import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// =====================================================
// BSD - BZZOIRO SPORTS DATA
// =====================================================

const API_BASE = "https://sports.bzzoiro.com/api/v2";
const API_KEY = process.env.API_FOOTBALL_KEY;

// =====================================================
// CACHE
// =====================================================

const cache = new Map();
const pending = new Map();

const CACHE_TTL = {
  live: 20 * 1000,
  today: 60 * 1000,
  fixture: 30 * 1000,
  standings: 5 * 60 * 1000,
  leagues: 30 * 60 * 1000
};

// =====================================================
// UTILIDADES
// =====================================================

function getCache(key) {
  const item = cache.get(key);

  if (!item) {
    return null;
  }

  if (Date.now() > item.expiresAt) {
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
    expiresAt: Date.now() + ttl
  });
}

function arrayFrom(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.results)) {
    return data.results;
  }

  if (Array.isArray(data?.data)) {
    return data.data;
  }

  if (Array.isArray(data?.events)) {
    return data.events;
  }

  if (Array.isArray(data?.partidas)) {
    return data.partidas;
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
    if (
      value !== undefined &&
      value !== null &&
      value !== "" &&
      !Number.isNaN(Number(value))
    ) {
      return Number(value);
    }
  }

  return null;
}

function stringValue(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      return String(value);
    }
  }

  return null;
}

// =====================================================
// TIMES
// =====================================================

function normalizeTeam(team, fallbackName = "Time") {
  if (typeof team === "string") {
    return {
      id: null,
      name: team,
      logo: null
    };
  }

  if (!team || typeof team !== "object") {
    return {
      id: null,
      name: fallbackName,
      logo: null
    };
  }

  return {
    id: firstValue(
      team.id,
      team.team_id,
      team.codigo,
      team.code
    ),

    name: firstValue(
      team.name,
      team.nome,
      team.team_name,
      team.apelido,
      fallbackName
    ),

    logo: firstValue(
      team.logo,
      team.escudo,
      team.image,
      team.imagem,
      null
    )
  };
}

// =====================================================
// PLACAR
// =====================================================

function parseScoreFromText(text) {
  if (!text || typeof text !== "string") {
    return {
      home: null,
      away: null
    };
  }

  const match = text.match(
    /(\d+)\s*[×xX-]\s*(\d+)/
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

function normalizeGoals(match) {
  const directHome = numberValue(
    match?.goals?.home,
    match?.home_score,
    match?.home_goals,
    match?.placar?.mandante,
    match?.placar?.home,
    match?.resultado?.mandante,
    match?.resultado?.home
  );

  const directAway = numberValue(
    match?.goals?.away,
    match?.away_score,
    match?.away_goals,
    match?.placar?.visitante,
    match?.placar?.away,
    match?.resultado?.visitante,
    match?.resultado?.away
  );

  if (
    directHome !== null ||
    directAway !== null
  ) {
    return {
      home: directHome ?? 0,
      away: directAway ?? 0
    };
  }

  const text = stringValue(
    match?.partida,
    match?.resultado,
    match?.score,
    match?.placar,
    match?.name
  );

  return parseScoreFromText(text);
}

// =====================================================
// STATUS
// =====================================================

function normalizeStatus(match) {
  const raw = String(
    firstValue(
      match?.status,
      match?.status_name,
      match?.situacao,
      match?.state,
      match?.phase,
      ""
    )
  ).toLowerCase();

  const minute = numberValue(
    match?.minute,
    match?.minuto,
    match?.elapsed,
    match?.tempo
  );

  if (
    raw.includes("live") ||
    raw.includes("ao vivo") ||
    raw.includes("in progress") ||
    raw.includes("playing") ||
    raw.includes("jogando") ||
    minute !== null
  ) {
    return {
      short: "LIVE",
      long: "Ao vivo",
      elapsed: minute
    };
  }

  if (
    raw.includes("finished") ||
    raw.includes("final") ||
    raw.includes("encerr")
  ) {
    return {
      short: "FT",
      long: "Finalizado",
      elapsed: null
    };
  }

  if (
    raw.includes("post") ||
    raw.includes("adiad")
  ) {
    return {
      short: "PST",
      long: "Adiado",
      elapsed: null
    };
  }

  if (
    raw.includes("cancel")
  ) {
    return {
      short: "CANC",
      long: "Cancelado",
      elapsed: null
    };
  }

  return {
    short: "NS",
    long: "Não iniciado",
    elapsed: null
  };
}

// =====================================================
// CAMPEONATO
// =====================================================

function normalizeLeague(match) {
  const league =
    match?.league ||
    match?.campeonato ||
    match?.competition ||
    {};

  if (typeof league === "string") {
    return {
      id: null,
      name: league,
      country: null
    };
  }

  return {
    id: firstValue(
      league.id,
      league.league_id,
      league.codigo
    ),

    name: firstValue(
      league.name,
      league.nome,
      match?.campeonato_nome,
      "Campeonato"
    ),

    country: firstValue(
      league.country,
      league.pais,
      null
    )
  };
}

// =====================================================
// DATA / HORÁRIO
// =====================================================

function normalizeDate(match) {
  return firstValue(
    match?.fixture?.date,
    match?.date,
    match?.datetime,
    match?.data_hora,
    match?.dataHora,
    match?.start_time,
    match?.inicio,
    null
  );
}

// =====================================================
// ID DA PARTIDA
// =====================================================

function normalizeMatchId(match) {
  return firstValue(
    match?.fixture?.id,
    match?.id,
    match?.event_id,
    match?.partida_id,
    match?.codigo,
    null
  );
}

// =====================================================
// EVENTOS
// =====================================================

function normalizeEvents(match) {
  const source =
    match?.events ||
    match?.eventos ||
    match?.timeline ||
    match?.incidents ||
    [];

  if (!Array.isArray(source)) {
    return [];
  }

  return source.map((event) => {
    const typeRaw = String(
      firstValue(
        event?.type,
        event?.tipo,
        event?.event_type,
        event?.evento,
        ""
      )
    ).toLowerCase();

    let type = "Other";

    if (
      typeRaw.includes("goal") ||
      typeRaw.includes("gol")
    ) {
      type = "Goal";
    } else if (
      typeRaw.includes("yellow") ||
      typeRaw.includes("amarelo")
    ) {
      type = "Card";
    } else if (
      typeRaw.includes("red") ||
      typeRaw.includes("vermelho")
    ) {
      type = "Card";
    } else if (
      typeRaw.includes("sub") ||
      typeRaw.includes("substit")
    ) {
      type = "subst";
    }

    const teamRaw =
      event?.team ||
      event?.time ||
      event?.equipe ||
      {};

    const team = normalizeTeam(
      teamRaw,
      "Time"
    );

    const player =
      event?.player ||
      event?.jogador ||
      {};

    return {
      type,

      detail: firstValue(
        event?.detail,
        event?.detalhe,
        event?.description,
        event?.descricao,
        null
      ),

      team,

      player: {
        id: firstValue(
          player?.id,
          player?.player_id
        ),

        name: firstValue(
          player?.name,
          player?.nome,
          typeof player === "string"
            ? player
            : null
        )
      },

      assist: event?.assist
        ? {
            id: firstValue(
              event.assist.id
            ),

            name: firstValue(
              event.assist.name,
              event.assist.nome
            )
          }
        : null,

      time: {
        elapsed: numberValue(
          event?.time?.elapsed,
          event?.minuto,
          event?.minute,
          event?.tempo
        )
      }
    };
  });
}

// =====================================================
// NORMALIZA PARTIDA BSD -> FORMATO DO FRONTEND
// =====================================================

function normalizeMatch(match) {
  const home = normalizeTeam(
    firstValue(
      match?.teams?.home,
      match?.mandante,
      match?.home_team,
      match?.home,
      match?.time_mandante
    ),
    "Mandante"
  );

  const away = normalizeTeam(
    firstValue(
      match?.teams?.away,
      match?.visitante,
      match?.away_team,
      match?.away,
      match?.time_visitante
    ),
    "Visitante"
  );

  const goals = normalizeGoals(match);
  const status = normalizeStatus(match);
  const league = normalizeLeague(match);

  return {
    fixture: {
      id: normalizeMatchId(match),

      date: normalizeDate(match),

      status
    },

    league,

    teams: {
      home,
      away
    },

    goals,

    events: normalizeEvents(match),

    raw: match
  };
}

// =====================================================
// REQUISIÇÃO À BSD
// =====================================================

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

// =====================================================
// EVITA DUPLICAR REQUISIÇÕES
// =====================================================

async function cachedFetch(
  key,
  path,
  ttl
) {
  const cached = getCache(key);

  if (cached !== null) {
    return cached;
  }

  if (pending.has(key)) {
    return pending.get(key);
  }

  const request = apiFetch(path)
    .then((data) => {
      setCache(
        key,
        data,
        ttl
      );

      pending.delete(key);

      return data;
    })
    .catch((error) => {
      pending.delete(key);

      const stale = getStaleCache(key);

      if (
        stale !== null &&
        error.status === 429
      ) {
        return stale;
      }

      throw error;
    });

  pending.set(
    key,
    request
  );

  return request;
}

// =====================================================
// ERROS
// =====================================================

function sendError(
  res,
  error
) {
  res.status(
    error.status || 500
  ).json({
    error: error.message,

    status:
      error.status || 500,

    path:
      error.path || null,

    details:
      error.data || null
  });
}

// =====================================================
// HEALTH
// =====================================================

app.get(
  "/api/health",
  (_req, res) => {
    res.json({
      ok: true,

      service:
        "soccerplay",

      provider:
        "BSD - Bzzoiro Sports Data",

      apiConfigured:
        Boolean(API_KEY),

      baseUrl:
        API_BASE,

      cache: {
        live: "20s",
        today: "60s",
        fixture: "30s",
        standings: "5m",
        leagues: "30m"
      },

      cachedItems:
        cache.size,

      pendingRequests:
        pending.size
    });
  }
);

// =====================================================
// AO VIVO
// =====================================================

app.get(
  "/api/live",
  async (_req, res) => {
    try {
      const data =
        await cachedFetch(
          "live",
          "/events/live/",
          CACHE_TTL.live
        );

      const matches =
        arrayFrom(data)
          .map(normalizeMatch);

      res.json({
        response: matches
      });
    } catch (error) {
      sendError(
        res,
        error
      );
    }
  }
);

// =====================================================
// JOGOS DE HOJE
// =====================================================

app.get(
  "/api/today",
  async (_req, res) => {
    try {
      const now =
        new Date();

      const date =
        now.toISOString()
          .slice(0, 10);

      const path =
        `/events/?date_from=${date}&date_to=${date}&limit=200`;

      const data =
        await cachedFetch(
          `today-${date}`,
          path,
          CACHE_TTL.today
        );

      const matches =
        arrayFrom(data)
          .map(normalizeMatch);

      res.json({
        response: matches
      });
    } catch (error) {
      sendError(
        res,
        error
      );
    }
  }
);

// =====================================================
// DETALHES DA PARTIDA
// =====================================================

app.get(
  "/api/fixture/:id",
  async (req, res) => {
    try {
      const id =
        encodeURIComponent(
          req.params.id
        );

      const data =
        await cachedFetch(
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
        response: [
          match
        ]
      });
    } catch (error) {
      sendError(
        res,
        error
      );
    }
  }
);

// =====================================================
// CAMPEONATOS
// =====================================================

app.get(
  "/api/leagues",
  async (_req, res) => {
    try {
      const data =
        await cachedFetch(
          "leagues",
          "/leagues/",
          CACHE_TTL.leagues
        );

      res.json({
        response:
          arrayFrom(data)
      });
    } catch (error) {
      sendError(
        res,
        error
      );
    }
  }
);

// =====================================================
// TABELA
// =====================================================

app.get(
  "/api/standings/:id",
  async (req, res) => {
    try {
      const id =
        encodeURIComponent(
          req.params.id
        );

      const data =
        await cachedFetch(
          `standings-${id}`,
          `/standings/?league=${id}`,
          CACHE_TTL.standings
        );

      res.json({
        response:
          data
      });
    } catch (error) {
      sendError(
        res,
        error
      );
    }
  }
);

// =====================================================
// STATUS DO CACHE
// =====================================================

app.get(
  "/api/cache",
  (_req, res) => {
    const items = [];

    for (
      const [
        key,
        value
      ] of cache.entries()
    ) {
      items.push({
        key,

        expiresAt:
          new Date(
            value.expiresAt
          ).toISOString(),

        expired:
          Date.now() >
          value.expiresAt
      });
    }

    res.json({
      cachedItems:
        cache.size,

      pendingRequests:
        pending.size,

      items
    });
  }
);

// =====================================================
// INICIAR SERVIDOR
// =====================================================

app.listen(
  PORT,
  () => {
    console.log(
      `SoccerPlay backend rodando na porta ${PORT}`
    );

    console.log(
      `BSD API: ${API_BASE}`
    );

    console.log(
      `API key configurada: ${Boolean(API_KEY)}`
    );
  }
);
