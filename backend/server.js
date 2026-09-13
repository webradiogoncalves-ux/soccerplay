import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

const API_BASE = "https://sports.bzzoiro.com/api/v2";
const API_KEY = process.env.API_FOOTBALL_KEY;

// ======================================================
// CACHE
// ======================================================

const cache = new Map();
const pending = new Map();

const CACHE_TTL = {
  live: 20000,
  today: 60000,
  fixture: 30000,
  standings: 300000,
  leagues: 1800000
};

// ======================================================
// FUNÇÕES AUXILIARES
// ======================================================

function getCache(key) {
  const item = cache.get(key);

  if (!item) return null;

  if (Date.now() - item.time > item.ttl) {
    return null;
  }

  return item.data;
}

function getStaleCache(key) {
  const item = cache.get(key);
  return item ? item.data : null;
}

function setCache(key, data, ttl) {
  cache.set(key, {
    data,
    time: Date.now(),
    ttl
  });
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

function arrayFrom(value) {
  if (Array.isArray(value)) return value;

  if (Array.isArray(value?.results)) {
    return value.results;
  }

  if (Array.isArray(value?.data)) {
    return value.data;
  }

  if (Array.isArray(value?.events)) {
    return value.events;
  }

  if (Array.isArray(value?.partidas)) {
    return value.partidas;
  }

  return [];
}

function numberValue(value) {
  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const n = Number(value.replace(",", "."));

    if (Number.isFinite(n)) {
      return n;
    }
  }

  return null;
}

// ======================================================
// TIMES
// ======================================================

function normalizeTeam(team, fallbackName = "Time") {
  if (!team) {
    return {
      id: null,
      name: fallbackName,
      logo: null
    };
  }

  if (typeof team === "string") {
    return {
      id: null,
      name: team,
      logo: null
    };
  }

  return {
    id: firstValue(
      team.id,
      team.team_id,
      team.codigo,
      team.slug
    ),
    name: firstValue(
      team.name,
      team.nome,
      team.short_name,
      team.nome_popular,
      fallbackName
    ),
    logo: firstValue(
      team.logo,
      team.escudo,
      team.image,
      team.image_url,
      null
    )
  };
}

// ======================================================
// PLACAR
// ======================================================

function parseScore(text) {
  if (!text || typeof text !== "string") {
    return {
      home: null,
      away: null
    };
  }

  const match = text.match(/(\d+)\s*[×xX\-]\s*(\d+)/);

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

function normalizeGoals(event) {
  const directHome = firstValue(
    event.home_score,
    event.home_goals,
    event.gols_mandante,
    event.gols_home
  );

  const directAway = firstValue(
    event.away_score,
    event.away_goals,
    event.gols_visitante,
    event.gols_away
  );

  if (
    directHome !== null ||
    directAway !== null
  ) {
    return {
      home: numberValue(directHome) ?? 0,
      away: numberValue(directAway) ?? 0
    };
  }

  const scoreText = firstValue(
    event.partida,
    event.score,
    event.placar,
    event.result
  );

  return parseScore(scoreText);
}

// ======================================================
// STATUS
// ======================================================

function normalizeStatus(event) {
  const status = String(
    firstValue(
      event.status,
      event.status_name,
      event.situacao,
      event.estado,
      ""
    )
  ).toLowerCase();

  if (
    status.includes("live") ||
    status.includes("ao vivo") ||
    status.includes("andamento") ||
    status.includes("playing")
  ) {
    return {
      long: "Em andamento",
      short: "LIVE",
      elapsed: numberValue(
        firstValue(
          event.minute,
          event.minuto,
          event.elapsed,
          event.tempo
        )
      )
    };
  }

  if (
    status.includes("finished") ||
    status.includes("final") ||
    status.includes("encerr")
  ) {
    return {
      long: "Finalizado",
      short: "FT",
      elapsed: 90
    };
  }

  return {
    long: firstValue(
      event.status,
      event.status_name,
      event.situacao,
      "Agendado"
    ),
    short: "NS",
    elapsed: null
  };
}

// ======================================================
// CAMPEONATO
// ======================================================

function normalizeLeague(event) {
  const league =
    event.league ||
    event.league_data ||
    event.campeonato ||
    event.competition ||
    {};

  if (typeof league === "string") {
    return {
      id: null,
      name: league,
      country: "Brasil",
      logo: null
    };
  }

  return {
    id: firstValue(
      league.id,
      league.league_id,
      event.league_id,
      event.campeonato_id
    ),
    name: firstValue(
      league.name,
      league.nome,
      event.campeonato,
      event.competition_name,
      "Campeonato"
    ),
    country: firstValue(
      league.country,
      league.pais,
      "Brasil"
    ),
    logo: firstValue(
      league.logo,
      league.escudo,
      league.image,
      null
    )
  };
}

// ======================================================
// DATA
// ======================================================

function normalizeDate(event) {
  return firstValue(
    event.date,
    event.datetime,
    event.data,
    event.data_hora,
    event.start_at,
    event.start_time,
    null
  );
}

// ======================================================
// ID
// ======================================================

function normalizeId(event) {
  return firstValue(
    event.id,
    event.event_id,
    event.partida_id,
    event.game_id,
    event.fixture_id,
    null
  );
}

// ======================================================
// EVENTOS DA PARTIDA
// ======================================================

function normalizeEvents(event) {
  const source = firstValue(
    event.events,
    event.eventos,
    event.incidents,
    event.ocorrencias
  );

  const items = arrayFrom(source);

  return items.map((item) => {
    const type = String(
      firstValue(
        item.type,
        item.tipo,
        item.event,
        item.ocorrencia,
        ""
      )
    ).toLowerCase();

    let normalizedType = "other";

    if (
      type.includes("goal") ||
      type.includes("gol")
    ) {
      normalizedType = "Goal";
    } else if (
      type.includes("yellow") ||
      type.includes("amarelo")
    ) {
      normalizedType = "Card";
    } else if (
      type.includes("red") ||
      type.includes("vermelho")
    ) {
      normalizedType = "Card";
    } else if (
      type.includes("subst") ||
      type.includes("substit")
    ) {
      normalizedType = "subst";
    }

    const team = normalizeTeam(
      item.team ||
      item.time ||
      item.team_data ||
      null
    );

    const player =
      item.player ||
      item.jogador ||
      item.player_data ||
      {};

    return {
      time: {
        elapsed: numberValue(
          firstValue(
            item.time,
            item.minute,
            item.minuto,
            item.elapsed,
            item.tempo,
            0
          )
        )
      },

      team,

      player: {
        id: firstValue(
          player.id,
          player.player_id
        ),
        name: firstValue(
          player.name,
          player.nome,
          item.player_name,
          item.jogador_nome,
          null
        )
      },

      assist: {
        name: firstValue(
          item.assist,
          item.assistencia,
          null
        )
      },

      type: normalizedType,

      detail: firstValue(
        item.detail,
        item.detalhe,
        item.description,
        null
      )
    };
  });
}

// ======================================================
// NORMALIZAÇÃO PRINCIPAL
// ======================================================

function normalizeMatch(event) {
  if (!event || typeof event !== "object") {
    return null;
  }

  const partidaText = firstValue(
    event.partida,
    event.match,
    event.nome
  );

  const score = normalizeGoals(event);

  let homeRaw = firstValue(
    event.home,
    event.home_team,
    event.mandante,
    event.time_mandante,
    event.team_home
  );

  let awayRaw = firstValue(
    event.away,
    event.away_team,
    event.visitante,
    event.time_visitante,
    event.team_away
  );

  // Algumas respostas podem trazer somente:
  // "Time A 2 × 1 Time B"
  if (
    (!homeRaw || !awayRaw) &&
    typeof partidaText === "string"
  ) {
    const parts = partidaText.split(
      /\s+\d+\s*[×xX\-]\s*\d+\s+/
    );

    if (parts.length >= 2) {
      homeRaw = parts[0];
      awayRaw = parts[1];
    }
  }

  const home = normalizeTeam(
    homeRaw,
    "Mandante"
  );

  const away = normalizeTeam(
    awayRaw,
    "Visitante"
  );

  return {
    fixture: {
      id: normalizeId(event),
      date: normalizeDate(event),
      timestamp: normalizeDate(event)
        ? Date.parse(normalizeDate(event))
        : null,

      status: normalizeStatus(event)
    },

    teams: {
      home,
      away
    },

    goals: {
      home:
        score.home !== null
          ? score.home
          : 0,

      away:
        score.away !== null
          ? score.away
          : 0
    },

    league: normalizeLeague(event),

    events: normalizeEvents(event),

    statistics: event.statistics || null,

    raw: event
  };
}

// ======================================================
// API BSD
// ======================================================

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
        Authorization: `Token ${API_KEY}`,
        Accept: "application/json"
      }
    }
  );

  const text = await response.text();

  let data = null;

  try {
    data = text
      ? JSON.parse(text)
      : null;
  } catch {
    data = {
      raw: text
    };
  }

  if (!response.ok) {
    const error = new Error(
      `BSD respondeu ${response.status}`
    );

    error.status = response.status;
    error.data = data;
    error.path = path;

    throw error;
  }

  return data;
}

// ======================================================
// CACHE + PROTEÇÃO CONTRA REPETIÇÃO
// ======================================================

async function cachedFetch(
  key,
  path,
  ttl
) {
  const fresh = getCache(key);

  if (fresh) {
    return fresh;
  }

  if (pending.has(key)) {
    return pending.get(key);
  }

  const promise = apiFetch(path)
    .then((data) => {
      setCache(key, data, ttl);

      return data;
    })
    .catch((error) => {
      // Se houver cache antigo, usa ele
      // em caso de erro da API.
      const stale = getStaleCache(key);

      if (stale) {
        return stale;
      }

      throw error;
    })
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, promise);

  return promise;
}

// ======================================================
// ERROS
// ======================================================

function sendError(res, error) {
  res.status(error.status || 500).json({
    error: error.message,
    status: error.status || 500,
    path: error.path || null,
    details: error.data || null
  });
}

// ======================================================
// HEALTH
// ======================================================

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "soccerplay",
    provider: "BSD - Bzzoiro Sports Data",
    apiConfigured: Boolean(API_KEY),
    baseUrl: API_BASE,

    cache: {
      live: "20s",
      today: "60s",
      fixture: "30s",
      standings: "5min",
      leagues: "30min"
    },

    cachedItems: cache.size,
    pendingRequests: pending.size
  });
});

// ======================================================
// AO VIVO
// ======================================================

app.get("/api/live", async (_req, res) => {
  try {
    const data = await cachedFetch(
      "live",
      "/events/live/",
      CACHE_TTL.live
    );

    const matches = arrayFrom(data)
      .map(normalizeMatch)
      .filter(Boolean);

    res.json({
      response: matches
    });
  } catch (error) {
    sendError(res, error);
  }
});

// ======================================================
// JOGOS DE HOJE
// ======================================================

app.get("/api/today", async (_req, res) => {
  try {
    const now = new Date();

    const year = now.getUTCFullYear();
    const month = String(
      now.getUTCMonth() + 1
    ).padStart(2, "0");

    const day = String(
      now.getUTCDate()
    ).padStart(2, "0");

    const date = `${year}-${month}-${day}`;

    const path =
      `/events/?date_from=${date}` +
      `&date_to=${date}` +
      `&limit=200`;

    const data = await cachedFetch(
      `today-${date}`,
      path,
      CACHE_TTL.today
    );

    const matches = arrayFrom(data)
      .map(normalizeMatch)
      .filter(Boolean);

    res.json({
      response: matches
    });
  } catch (error) {
    sendError(res, error);
  }
});

// ======================================================
// DETALHES DA PARTIDA
// ======================================================

app.get(
  "/api/fixture/:id",
  async (req, res) => {
    try {
      const id = encodeURIComponent(
        req.params.id
      );

      const data = await cachedFetch(
        `fixture-${id}`,
        `/events/${id}/`,
        CACHE_TTL.fixture
      );

      const raw =
        data?.results ||
        data?.data ||
        data;

      const match =
        normalizeMatch(raw);

      res.json({
        response: match
      });
    } catch (error) {
      sendError(res, error);
    }
  }
);

// ======================================================
// CAMPEONATOS
// ======================================================

app.get(
  "/api/leagues",
  async (_req, res) => {
    try {
      const data = await cachedFetch(
        "leagues",
        "/leagues/",
        CACHE_TTL.leagues
      );

      res.json({
        response: data
      });
    } catch (error) {
      sendError(res, error);
    }
  }
);

// ======================================================
// TABELA
// ======================================================

app.get(
  "/api/standings/:id",
  async (req, res) => {
    try {
      const id = encodeURIComponent(
        req.params.id
      );

      const data = await cachedFetch(
        `standings-${id}`,
        `/standings/?league=${id}`,
        CACHE_TTL.standings
      );

      res.json({
        response: data
      });
    } catch (error) {
      sendError(res, error);
    }
  }
);

// ======================================================
// STATUS DO CACHE
// ======================================================

app.get(
  "/api/cache",
  (_req, res) => {
    const items = [];

    for (const [
      key,
      item
    ] of cache.entries()) {
      items.push({
        key,
        ageSeconds: Math.round(
          (Date.now() - item.time) / 1000
        ),
        ttlSeconds:
          Math.round(item.ttl / 1000)
      });
    }

    res.json({
      cachedItems: items,
      pendingRequests:
        Array.from(pending.keys())
    });
  }
);

// ======================================================
// SERVIDOR
// ======================================================

app.listen(PORT, () => {
  console.log(
    `SoccerPlay backend rodando na porta ${PORT}`
  );

  console.log(
    `Provider: BSD - Bzzoiro Sports Data`
  );
});
