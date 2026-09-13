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
// AUXILIARES
// ======================================================

function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
}

function numberValue(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const n = Number(value.replace(",", "."));

    return Number.isFinite(n) ? n : null;
  }

  return null;
}

function arrayFrom(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (Array.isArray(value?.results)) {
    return value.results;
  }

  if (Array.isArray(value?.data)) {
    return value.data;
  }

  if (Array.isArray(value?.events)) {
    return value.events;
  }

  return [];
}

// ======================================================
// CACHE
// ======================================================

function getCache(key) {
  const item = cache.get(key);

  if (!item) {
    return null;
  }

  if (Date.now() - item.time > item.ttl) {
    cache.delete(key);
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

// ======================================================
// TIMES
// ======================================================

function normalizeTeam(name, id = null, logo = null) {
  if (name && typeof name === "object") {
    return {
      id: firstValue(
        name.id,
        name.team_id
      ),
      name: firstValue(
        name.name,
        name.nome,
        "Time"
      ),
      logo: firstValue(
        name.logo,
        name.image,
        name.escudo,
        null
      )
    };
  }

  return {
    id: id,
    name: firstValue(name, "Time"),
    logo: logo
  };
}

// ======================================================
// STATUS
// ======================================================

function normalizeStatus(event) {
  const rawStatus = String(
    firstValue(
      event.status,
      event.status_name,
      event.situacao,
      event.estado,
      ""
    )
  ).toLowerCase();

  const minute = numberValue(
    firstValue(
      event.current_minute,
      event.minute,
      event.minuto,
      event.elapsed,
      event.tempo
    )
  );

  // Jogo ao vivo
  if (
    rawStatus.includes("inprogress") ||
    rawStatus.includes("in progress") ||
    rawStatus.includes("em andamento") ||
    rawStatus.includes("andamento") ||
    rawStatus.includes("ao vivo") ||
    rawStatus.includes("live") ||
    rawStatus.includes("playing")
  ) {
    return {
      long: "Em andamento",
      short: "LIVE",
      elapsed: minute
    };
  }

  // Jogo finalizado
  if (
    rawStatus.includes("finished") ||
    rawStatus.includes("finalizado") ||
    rawStatus.includes("final") ||
    rawStatus.includes("encerr")
  ) {
    return {
      long: "Finalizado",
      short: "FT",
      elapsed: minute ?? 90
    };
  }

  // Jogo não iniciado
  if (
    rawStatus.includes("notstarted") ||
    rawStatus.includes("not started") ||
    rawStatus.includes("agend")
  ) {
    return {
      long: "Agendado",
      short: "NS",
      elapsed: null
    };
  }

  return {
    long: firstValue(
      event.status,
      "Agendado"
    ),
    short: "NS",
    elapsed: minute
  };
}

// ======================================================
// CAMPEONATO
// ======================================================

function guessCountry(leagueName) {
  const name = String(
    leagueName || ""
  ).toLowerCase();

  if (
    name.includes("brasileirão") ||
    name.includes("brasileirao") ||
    name.includes("copa do brasil") ||
    name.includes("paulista") ||
    name.includes("carioca") ||
    name.includes("mineiro") ||
    name.includes("gaúcho") ||
    name.includes("gaucho") ||
    name.includes("paranaense") ||
    name.includes("catarinense") ||
    name.includes("pernambucano") ||
    name.includes("baiano") ||
    name.includes("cearense") ||
    name.includes("goiano") ||
    name.includes("capixaba") ||
    name.includes("alagoano") ||
    name.includes("potiguar") ||
    name.includes("sergipano") ||
    name.includes("paraibano") ||
    name.includes("piauiense") ||
    name.includes("maranhense") ||
    name.includes("paraense") ||
    name.includes("amazonense") ||
    name.includes("acreano") ||
    name.includes("rondoniense") ||
    name.includes("tocantinense") ||
    name.includes("brasiliense") ||
    name.includes("série a") ||
    name.includes("serie a") ||
    name.includes("série b") ||
    name.includes("serie b") ||
    name.includes("série c") ||
    name.includes("serie c") ||
    name.includes("série d") ||
    name.includes("serie d")
  ) {
    return "Brasil";
  }

  if (
    name.includes("mls") ||
    name.includes("usl") ||
    name.includes("nwsL".toLowerCase())
  ) {
    return "Estados Unidos";
  }

  if (name.includes("liga mx")) {
    return "México";
  }

  if (
    name.includes("categoria primera") ||
    name.includes("primera a")
  ) {
    return "Colômbia";
  }

  if (
    name.includes("liga profesional") ||
    name.includes("liga profissional")
  ) {
    return "Argentina";
  }

  if (name.includes("premier league")) {
    return "Inglaterra";
  }

  if (name.includes("laliga") || name.includes("la liga")) {
    return "Espanha";
  }

  if (name.includes("bundesliga")) {
    return "Alemanha";
  }

  if (name.includes("serie a")) {
    return "Itália";
  }

  if (name.includes("ligue 1")) {
    return "França";
  }

  if (name.includes("eredivisie")) {
    return "Países Baixos";
  }

  if (name.includes("primeira liga")) {
    return "Portugal";
  }

  return "Internacional";
}

function normalizeLeague(event) {
  const leagueObject =
    event.league ||
    event.league_data ||
    event.competition ||
    {};

  const id = firstValue(
    event.league_id,
    leagueObject.id,
    leagueObject.league_id
  );

  const name = firstValue(
    event.league_name,
    leagueObject.name,
    leagueObject.nome,
    event.campeonato,
    event.competition_name,
    "Campeonato"
  );

  return {
    id,
    name,
    country: firstValue(
      event.country,
      leagueObject.country,
      leagueObject.pais,
      guessCountry(name)
    ),
    logo: firstValue(
      event.league_logo,
      leagueObject.logo,
      leagueObject.image,
      leagueObject.escudo,
      null
    )
  };
}

// ======================================================
// DATA
// ======================================================

function normalizeDate(event) {
  return firstValue(
    event.event_date,
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
// PLACAR
// ======================================================

function normalizeGoals(event) {
  const home = numberValue(
    firstValue(
      event.home_score,
      event.home_goals,
      event.gols_mandante,
      event.gols_home
    )
  );

  const away = numberValue(
    firstValue(
      event.away_score,
      event.away_goals,
      event.gols_visitante,
      event.gols_away
    )
  );

  return {
    home: home ?? 0,
    away: away ?? 0
  };
}

// ======================================================
// EVENTOS
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
    }

    if (
      type.includes("yellow") ||
      type.includes("amarelo") ||
      type.includes("red") ||
      type.includes("vermelho")
    ) {
      normalizedType = "Card";
    }

    if (
      type.includes("subst") ||
      type.includes("substit")
    ) {
      normalizedType = "subst";
    }

    const player =
      item.player ||
      item.jogador ||
      item.player_data ||
      {};

    const team =
      item.team ||
      item.time ||
      item.team_data ||
      null;

    return {
      time: {
        elapsed: numberValue(
          firstValue(
            item.minute,
            item.minuto,
            item.elapsed,
            item.tempo,
            item.time,
            0
          )
        )
      },

      team: normalizeTeam(
        team
      ),

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

  // Caso venha embrulhado
  const source =
    event.raw && typeof event.raw === "object"
      ? event.raw
      : event;

  const home = normalizeTeam(
    firstValue(
      source.home_team,
      source.home,
      source.mandante,
      source.time_mandante,
      source.team_home
    ),
    firstValue(
      source.home_team_id,
      source.home?.id,
      null
    ),
    firstValue(
      source.home_team_logo,
      source.home?.logo,
      null
    )
  );

  const away = normalizeTeam(
    firstValue(
      source.away_team,
      source.away,
      source.visitante,
      source.time_visitante,
      source.team_away
    ),
    firstValue(
      source.away_team_id,
      source.away?.id,
      null
    ),
    firstValue(
      source.away_team_logo,
      source.away?.logo,
      null
    )
  );

  const date = normalizeDate(source);

  return {
    fixture: {
      id: normalizeId(source),

      date,

      timestamp: date
        ? Date.parse(date)
        : null,

      status: normalizeStatus(source)
    },

    teams: {
      home,
      away
    },

    goals: normalizeGoals(source),

    league: normalizeLeague(source),

    events: normalizeEvents(source),

    statistics:
      source.statistics || null,

    raw: source
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
// CACHE COM PROTEÇÃO
// ======================================================

async function cachedFetch(key, path, ttl) {
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
// ERRO
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

    const parts = new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    ).formatToParts(now);

    const year = parts.find(
      (p) => p.type === "year"
    )?.value;

    const month = parts.find(
      (p) => p.type === "month"
    )?.value;

    const day = parts.find(
      (p) => p.type === "day"
    )?.value;

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

      let raw = data;

      if (Array.isArray(data?.results)) {
        raw = data.results[0] || null;
      } else if (Array.isArray(data?.data)) {
        raw = data.data[0] || null;
      } else if (data?.results && typeof data.results === "object") {
        raw = data.results;
      } else if (data?.data && typeof data.data === "object") {
        raw = data.data;
      }

      const match = normalizeMatch(raw);

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
// CLASSIFICAÇÃO
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
// CACHE
// ======================================================

app.get(
  "/api/cache",
  (_req, res) => {
    const items = [];

    for (const [key, item] of cache.entries()) {
      items.push({
        key,

        ageSeconds: Math.round(
          (Date.now() - item.time) / 1000
        ),

        ttlSeconds: Math.round(
          item.ttl / 1000
        )
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
    "Provider: BSD - Bzzoiro Sports Data"
  );
});
