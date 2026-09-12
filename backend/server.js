import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

const API_BASE = "https://api.api-futebol.com.br/v1";
const API_KEY = process.env.API_FOOTBALL_KEY;

/*
|--------------------------------------------------------------------------
| CONFIGURAÇÃO DE CACHE
|--------------------------------------------------------------------------
*/

const CACHE_TTL = {
  live: 20 * 1000,       // 20 segundos
  today: 60 * 1000,      // 1 minuto
  fixture: 30 * 1000,    // 30 segundos
  standings: 5 * 60 * 1000,
  leagues: 30 * 60 * 1000
};

const cache = new Map();

/*
|--------------------------------------------------------------------------
| CONTROLE DE REQUISIÇÕES
|--------------------------------------------------------------------------
*/

const pendingRequests = new Map();

function getCache(key) {
  const item = cache.get(key);

  if (!item) {
    return null;
  }

  const age = Date.now() - item.timestamp;

  return {
    data: item.data,
    fresh: age < item.ttl,
    age
  };
}

function setCache(key, data, ttl) {
  cache.set(key, {
    data,
    timestamp: Date.now(),
    ttl
  });
}

function getStaleCache(key) {
  const item = cache.get(key);

  if (!item) {
    return null;
  }

  return item.data;
}

/*
|--------------------------------------------------------------------------
| UTILITÁRIOS
|--------------------------------------------------------------------------
*/

function arrayFrom(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (!data || typeof data !== "object") {
    return [];
  }

  const possibleArrays = [
    data.response,
    data.data,
    data.result,
    data.results,
    data.partidas,
    data.jogos,
    data.campeonatos,
    data.matches
  ];

  for (const value of possibleArrays) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function firstValue(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      return value;
    }
  }

  return null;
}

function numberValue(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    const number = Number(value);

    if (!Number.isNaN(number)) {
      return number;
    }
  }

  return null;
}

function textValue(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      return String(value);
    }
  }

  return "";
}

/*
|--------------------------------------------------------------------------
| TIMES
|--------------------------------------------------------------------------
*/

function normalizeTeam(team, fallbackName = "Time") {
  if (!team) {
    return {
      id: null,
      name: fallbackName,
      logo: ""
    };
  }

  if (typeof team === "string") {
    return {
      id: null,
      name: team,
      logo: ""
    };
  }

  return {
    id: numberValue(
      team.id,
      team.time_id,
      team.team_id,
      team.codigo
    ),

    name: textValue(
      team.name,
      team.nome,
      team.time,
      team.equipe,
      fallbackName
    ),

    logo: textValue(
      team.logo,
      team.escudo,
      team.image,
      team.imagem,
      team.url_logo
    )
  };
}

/*
|--------------------------------------------------------------------------
| PLACAR
|--------------------------------------------------------------------------
*/

function parseScoreFromText(text) {
  if (!text || typeof text !== "string") {
    return {
      home: null,
      away: null
    };
  }

  /*
   Exemplos aceitos:

   Flamengo 2 × 1 Palmeiras
   Flamengo 2 x 1 Palmeiras
   Fla 2 - 1 Pal
  */

  const match = text.match(
    /(?:^|\s)(\d+)\s*[x×\-]\s*(\d+)(?:\s|$)/i
  );

  if (!match) {
    return {
      home: null,
      away: null
    };
  }

  return {
    home: Number(match[1]),
    away: Number(match[2])
  };
}

function normalizeGoals(item) {
  const goals = item?.goals || item?.placar || item?.score || {};

  let home = numberValue(
    goals.home,
    goals.mandante,
    goals.casa,
    goals.home_score,
    goals.gols_home,
    item?.gols_home,
    item?.gols_mandante,
    item?.placar_mandante
  );

  let away = numberValue(
    goals.away,
    goals.visitante,
    goals.fora,
    goals.away_score,
    goals.gols_away,
    item?.gols_away,
    item?.gols_visitante,
    item?.placar_visitante
  );

  if (home === null || away === null) {
    const text = firstValue(
      item?.partida,
      item?.jogo,
      item?.match,
      item?.placar
    );

    const parsed = parseScoreFromText(text);

    if (home === null) {
      home = parsed.home;
    }

    if (away === null) {
      away = parsed.away;
    }
  }

  return {
    home,
    away
  };
}

/*
|--------------------------------------------------------------------------
| STATUS
|--------------------------------------------------------------------------
*/

function normalizeStatus(item) {
  const status = item?.fixture?.status || item?.status || {};

  const raw = textValue(
    status.short,
    status.codigo,
    status.code,
    status.status,
    item?.status,
    item?.situacao,
    item?.estado
  ).toLowerCase();

  let short = "NS";

  if (
    raw.includes("ao vivo") ||
    raw.includes("live") ||
    raw.includes("andamento") ||
    raw === "1h"
  ) {
    short = "2H";
  } else if (
    raw.includes("intervalo") ||
    raw === "ht"
  ) {
    short = "HT";
  } else if (
    raw.includes("final") ||
    raw.includes("encerrado") ||
    raw.includes("fim") ||
    raw === "ft"
  ) {
    short = "FT";
  } else if (
    raw.includes("adiado") ||
    raw.includes("postergado")
  ) {
    short = "PST";
  } else if (
    raw.includes("cancelado")
  ) {
    short = "CANC";
  } else if (
    raw.includes("1º tempo") ||
    raw.includes("primeiro tempo")
  ) {
    short = "1H";
  } else if (
    raw.includes("2º tempo") ||
    raw.includes("segundo tempo")
  ) {
    short = "2H";
  } else if (
    raw === "ns" ||
    raw.includes("não iniciado") ||
    raw.includes("nao iniciado")
  ) {
    short = "NS";
  }

  const elapsed = numberValue(
    status.elapsed,
    status.minuto,
    item?.minuto,
    item?.minute
  );

  return {
    long: textValue(
      status.long,
      status.nome,
      item?.status,
      item?.situacao,
      short
    ),

    short,

    elapsed
  };
}

/*
|--------------------------------------------------------------------------
| CAMPEONATO
|--------------------------------------------------------------------------
*/

function normalizeLeague(item) {
  const league = item?.league || item?.campeonato || {};

  return {
    id: numberValue(
      league.id,
      league.campeonato_id,
      item?.campeonato_id
    ),

    name: textValue(
      league.name,
      league.nome,
      item?.campeonato,
      "Futebol"
    ),

    country: textValue(
      league.country,
      league.pais,
      item?.pais,
      item?.country,
      ""
    ),

    logo: textValue(
      league.logo,
      league.escudo,
      league.image,
      ""
    )
  };
}

/*
|--------------------------------------------------------------------------
| DATA DA PARTIDA
|--------------------------------------------------------------------------
*/

function normalizeDate(item) {
  return firstValue(
    item?.fixture?.date,
    item?.data,
    item?.date,
    item?.datetime,
    item?.data_hora,
    item?.horario,
    new Date().toISOString()
  );
}

/*
|--------------------------------------------------------------------------
| ID DA PARTIDA
|--------------------------------------------------------------------------
*/

function normalizeId(item, index = 0) {
  const id = numberValue(
    item?.fixture?.id,
    item?.id,
    item?.partida_id,
    item?.jogo_id,
    item?.match_id
  );

  if (id !== null) {
    return id;
  }

  /*
   Não inventamos IDs numéricos.

   Quando a API não fornece ID, usamos um identificador
   textual estável somente para permitir que a interface
   funcione sem criar uma partida falsa.
  */

  const text = textValue(
    item?.partida,
    item?.jogo,
    item?.match
  );

  if (text) {
    return `api-${encodeURIComponent(text)}-${index}`;
  }

  return `api-match-${index}`;
}

/*
|--------------------------------------------------------------------------
| EVENTOS
|--------------------------------------------------------------------------
*/

function normalizeEvents(item) {
  const rawEvents = firstValue(
    item?.events,
    item?.eventos,
    item?.lances,
    item?.incidentes
  );

  if (!Array.isArray(rawEvents)) {
    return [];
  }

  return rawEvents.map((event) => {
    const typeRaw = textValue(
      event?.type,
      event?.tipo,
      event?.event,
      event?.evento
    ).toLowerCase();

    let type = "Substitution";

    if (
      typeRaw.includes("gol") ||
      typeRaw.includes("goal")
    ) {
      type = "Goal";
    } else if (
      typeRaw.includes("cartao") ||
      typeRaw.includes("cartão") ||
      typeRaw.includes("card") ||
      typeRaw.includes("amarelo")
    ) {
      type = "Card";
    }

    const team = normalizeTeam(
      event?.team ||
      event?.time ||
      event?.equipe
    );

    return {
      type,

      team,

      player: {
        id: numberValue(
          event?.player?.id,
          event?.jogador?.id
        ),

        name: textValue(
          event?.player?.name,
          event?.player?.nome,
          event?.jogador?.name,
          event?.jogador?.nome,
          event?.jogador
        )
      },

      assist: event?.assist
        ? {
            id: numberValue(event.assist.id),
            name: textValue(
              event.assist.name,
              event.assist.nome
            )
          }
        : null,

      time: {
        elapsed: numberValue(
          event?.time?.elapsed,
          event?.minuto,
          event?.minute
        )
      },

      detail: textValue(
        event?.detail,
        event?.detalhe,
        event?.descricao,
        event?.description
      )
    };
  });
}

/*
|--------------------------------------------------------------------------
| NORMALIZAÇÃO PRINCIPAL
|--------------------------------------------------------------------------
*/

function normalizeMatch(item, index = 0) {
  const existingHome =
    item?.teams?.home ||
    item?.mandante ||
    item?.home ||
    item?.time_mandante ||
    item?.casa;

  const existingAway =
    item?.teams?.away ||
    item?.visitante ||
    item?.away ||
    item?.time_visitante ||
    item?.fora;

  /*
   Algumas respostas podem trazer os times dentro
   de um objeto "partida".
  */

  const home = normalizeTeam(
    existingHome,
    "Mandante"
  );

  const away = normalizeTeam(
    existingAway,
    "Visitante"
  );

  const goals = normalizeGoals(item);

  const status = normalizeStatus(item);

  const league = normalizeLeague(item);

  const fixtureId = normalizeId(item, index);

  return {
    fixture: {
      id: fixtureId,

      date: normalizeDate(item),

      status
    },

    teams: {
      home,
      away
    },

    goals,

    league,

    events: normalizeEvents(item),

    /*
     Dados extras da API, quando existirem.
     Isso não atrapalha o frontend atual.
    */

    minute: numberValue(
      item?.minuto,
      item?.minute
    ),

    rawPartida: textValue(
      item?.partida,
      item?.jogo,
      item?.match
    ),

    raw: item
  };
}

/*
|--------------------------------------------------------------------------
| NORMALIZAÇÃO DE LISTA
|--------------------------------------------------------------------------
*/

function normalizeMatches(data) {
  const list = arrayFrom(data);

  return list.map((item, index) =>
    normalizeMatch(item, index)
  );
}

/*
|--------------------------------------------------------------------------
| CHAMADA À API FUTEBOL
|--------------------------------------------------------------------------
*/

async function apiFetch(path) {
  if (!API_KEY) {
    const error = new Error(
      "API_FOOTBALL_KEY não configurada no Render"
    );

    error.status = 500;

    throw error;
  }

  const response = await fetch(
    `${API_BASE}${path}`,
    {
      method: "GET",

      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: "application/json"
      }
    }
  );

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = {
      raw: text
    };
  }

  if (!response.ok) {
    const error = new Error(
      `API Futebol respondeu ${response.status}`
    );

    error.status = response.status;
    error.data = data;
    error.path = path;

    /*
     Captura Retry-After quando a API fornece.
    */

    error.retryAfter = response.headers.get(
      "retry-after"
    );

    throw error;
  }

  return data;
}

/*
|--------------------------------------------------------------------------
| CHAMADA COM CACHE E PROTEÇÃO CONTRA 429
|--------------------------------------------------------------------------
*/

async function cachedApiFetch(
  cacheKey,
  path,
  ttl
) {
  /*
   1. Se existe cache válido, retorna imediatamente.
  */

  const cached = getCache(cacheKey);

  if (cached?.fresh) {
    return cached.data;
  }

  /*
   2. Se já existe uma chamada em andamento para
      o mesmo recurso, reutiliza a mesma Promise.

      Isso impede duas chamadas simultâneas iguais.
  */

  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey);
  }

  const request = (async () => {
    try {
      const data = await apiFetch(path);

      /*
       Só salva no cache se a API respondeu corretamente.
      */

      setCache(
        cacheKey,
        data,
        ttl
      );

      return data;
    } catch (error) {
      /*
       3. Se for 429, usa o último cache válido.
      */

      if (error.status === 429) {
        const stale = getStaleCache(cacheKey);

        if (stale !== null) {
          console.warn(
            `429 da API em ${path}. Usando cache anterior.`
          );

          return stale;
        }

        console.warn(
          `429 da API em ${path}. Ainda não existe cache disponível.`
        );
      }

      throw error;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(
    cacheKey,
    request
  );

  return request;
}

/*
|--------------------------------------------------------------------------
| ERROS
|--------------------------------------------------------------------------
*/

function sendError(res, error) {
  const status = error.status || 500;

  const payload = {
    error: error.message || "Erro interno",
    status,
    path: error.path || null,
    details: error.data || null
  };

  if (error.retryAfter) {
    payload.retryAfter = error.retryAfter;
  }

  res.status(status).json(payload);
}

/*
|--------------------------------------------------------------------------
| HEALTH
|--------------------------------------------------------------------------
*/

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,

    service: "soccerplay",

    provider: "API Futebol - FutDev",

    apiConfigured: Boolean(API_KEY),

    baseUrl: API_BASE,

    cache: {
      live: `${CACHE_TTL.live / 1000}s`,
      today: `${CACHE_TTL.today / 1000}s`,
      fixture: `${CACHE_TTL.fixture / 1000}s`
    },

    cachedItems: cache.size,

    pendingRequests: pendingRequests.size
  });
});

/*
|--------------------------------------------------------------------------
| AO VIVO
|--------------------------------------------------------------------------
*/

app.get("/api/live", async (_req, res) => {
  try {
    let data;

    try {
      /*
       Endpoint principal.
      */

      data = await cachedApiFetch(
        "live",
        "/partidas/ao-vivo",
        CACHE_TTL.live
      );
    } catch (firstError) {
      /*
       Compatibilidade com o outro endpoint documentado
       pela API Futebol.
      */

      if (firstError.status !== 404) {
        throw firstError;
      }

      data = await cachedApiFetch(
        "live-fallback",
        "/ao-vivo",
        CACHE_TTL.live
      );
    }

    const response = normalizeMatches(data);

    res.json({
      response
    });
  } catch (error) {
    sendError(res, error);
  }
});

/*
|--------------------------------------------------------------------------
| JOGOS DE HOJE
|--------------------------------------------------------------------------
*/

app.get("/api/today", async (_req, res) => {
  try {
    let data = null;

    /*
     Tentativa 1
    */

    const todayEndpoints = [
      "/partidas",
      "/jogos",
      "/partidas/hoje"
    ];

    for (const endpoint of todayEndpoints) {
      try {
        data = await cachedApiFetch(
          `today:${endpoint}`,
          endpoint,
          CACHE_TTL.today
        );

        break;
      } catch (error) {
        if (error.status === 404) {
          continue;
        }

        throw error;
      }
    }

    /*
     Se a API não possuir endpoint específico de jogos,
     usamos o endpoint de ao vivo como fallback.
    */

    if (data === null) {
      try {
        data = await cachedApiFetch(
          "today-live-fallback",
          "/partidas/ao-vivo",
          CACHE_TTL.today
        );
      } catch (firstError) {
        if (firstError.status !== 404) {
          throw firstError;
        }

        data = await cachedApiFetch(
          "today-live-fallback-2",
          "/ao-vivo",
          CACHE_TTL.today
        );
      }
    }

    const response = normalizeMatches(data);

    res.json({
      response
    });
  } catch (error) {
    sendError(res, error);
  }
});

/*
|--------------------------------------------------------------------------
| DETALHES DA PARTIDA
|--------------------------------------------------------------------------
*/

app.get("/api/fixture/:id", async (req, res) => {
  try {
    const id = encodeURIComponent(
      req.params.id
    );

    const data = await cachedApiFetch(
      `fixture:${id}`,
      `/partidas/${id}`,
      CACHE_TTL.fixture
    );

    let response = arrayFrom(data);

    /*
     Se a API retornar uma partida como objeto único,
     transforma em lista de uma partida.
    */

    if (
      response.length === 0 &&
      data &&
      typeof data === "object"
    ) {
      response = [data];
    }

    response = response.map(
      (item, index) =>
        normalizeMatch(item, index)
    );

    res.json({
      response
    });
  } catch (error) {
    sendError(res, error);
  }
});

/*
|--------------------------------------------------------------------------
| TABELA
|--------------------------------------------------------------------------
*/

app.get("/api/standings/:id", async (req, res) => {
  try {
    const id = encodeURIComponent(
      req.params.id
    );

    const data = await cachedApiFetch(
      `standings:${id}`,
      `/campeonatos/${id}/tabela`,
      CACHE_TTL.standings
    );

    res.json({
      response: data
    });
  } catch (error) {
    sendError(res, error);
  }
});

/*
|--------------------------------------------------------------------------
| CAMPEONATOS
|--------------------------------------------------------------------------
*/

app.get("/api/leagues", async (_req, res) => {
  try {
    const data = await cachedApiFetch(
      "leagues",
      "/campeonatos",
      CACHE_TTL.leagues
    );

    res.json({
      response: data
    });
  } catch (error) {
    sendError(res, error);
  }
});

/*
|--------------------------------------------------------------------------
| STATUS DO CACHE
|--------------------------------------------------------------------------
*/

app.get("/api/cache", (_req, res) => {
  const items = [];

  for (const [key, value] of cache.entries()) {
    const age = Date.now() - value.timestamp;

    items.push({
      key,

      ageSeconds:
        Math.round(age / 1000),

      ttlSeconds:
        Math.round(value.ttl / 1000),

      fresh:
        age < value.ttl
    });
  }

  res.json({
    cache: items,
    pendingRequests: [
      ...pendingRequests.keys()
    ]
  });
});

/*
|--------------------------------------------------------------------------
| SERVIDOR
|--------------------------------------------------------------------------
*/

app.listen(PORT, () => {
  console.log(
    `SoccerPlay backend rodando na porta ${PORT}`
  );

  console.log(
    `API Futebol: ${API_BASE}`
  );

  console.log(
    `API key configurada: ${Boolean(API_KEY)}`
  );
});
