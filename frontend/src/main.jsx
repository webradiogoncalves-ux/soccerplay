import express from "express";
import cors from "cors";
import { getCompetition, getStandings } from "campeonato-brasileiro-api";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const API_BASE = "https://sports.bzzoiro.com/api/v2";
const IMAGE_BASE = "https://sports.bzzoiro.com";
const API_KEY = process.env.API_FOOTBALL_KEY;

const cache = new Map();
const pending = new Map();

const CACHE_TTL = {
  live: 20000,
  today: 60000,
  fixture: 30000,
  standings: 300000,
  leagues: 1800000,
  serieD: 60000,
  serieDStandings: 300000
};

function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function numberValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  if (typeof value === "string") {
    const n = Number(value.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

function arrayFrom(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.events)) return value.events;
  if (Array.isArray(value?.standings)) return value.standings;

  return [];
}

function getCache(key) {
  const item = cache.get(key);

  if (!item) return null;

  if (Date.now() - item.time > item.ttl) {
    cache.delete(key);
    return null;
  }

  return item.data;
}

function getStaleCache(key) {
  return cache.get(key)?.data ?? null;
}

function setCache(key, data, ttl) {
  cache.set(key, {
    data,
    time: Date.now(),
    ttl
  });
}

async function cachedCustom(key, ttl, loader) {
  const fresh = getCache(key);

  if (fresh) return fresh;

  if (pending.has(key)) {
    return pending.get(key);
  }

  const promise = Promise.resolve()
    .then(loader)
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

function bsdTeamLogo(id) {
  if (id === undefined || id === null || id === "") {
    return null;
  }

  return `${IMAGE_BASE}/img/team/${encodeURIComponent(id)}/?bg=transparent`;
}

function bsdLeagueLogo(id) {
  if (id === undefined || id === null || id === "") {
    return null;
  }

  return `${IMAGE_BASE}/img/league/${encodeURIComponent(id)}/?bg=transparent`;
}

function countryText(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object") {
    return firstValue(
      value.name,
      value.nome,
      value.country,
      value.pais,
      value.title
    );
  }

  return null;
}

function guessCountry(leagueName) {
  const name = String(leagueName || "").toLowerCase();

  if (
    name.includes("brasileirão") ||
    name.includes("brasileirao") ||
    name.includes("copa do brasil") ||
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
    name.includes("nwsl")
  ) {
    return "Estados Unidos";
  }

  if (name.includes("liga mx")) return "México";
  if (name.includes("premier league")) return "Inglaterra";
  if (name.includes("laliga") || name.includes("la liga")) return "Espanha";
  if (name.includes("bundesliga")) return "Alemanha";
  if (name.includes("ligue 1")) return "França";

  return "Internacional";
}

function normalizeTeam(
  team,
  fallbackId = null,
  fallbackLogo = null,
  useBsdLogo = true
) {
  if (team && typeof team === "object") {
    const id = firstValue(
      team.id,
      team.team_id,
      team.teamId,
      fallbackId
    );

    return {
      id,

      name: firstValue(
        team.name,
        team.nome,
        team.title,
        team.short_name,
        "Time"
      ),

      logo: firstValue(
        team.logo,
        team.image,
        team.escudo,
        team.badge,
        team.image_url,
        fallbackLogo,
        useBsdLogo ? bsdTeamLogo(id) : null
      )
    };
  }

  return {
    id: fallbackId,

    name: firstValue(
      team,
      "Time"
    ),

    logo: firstValue(
      fallbackLogo,
      useBsdLogo
        ? bsdTeamLogo(fallbackId)
        : null
    )
  };
}

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

  if (
    rawStatus.includes("inprogress") ||
    rawStatus.includes("in progress") ||
    rawStatus.includes("em andamento") ||
    rawStatus.includes("andamento") ||
    rawStatus.includes("ao vivo") ||
    rawStatus.includes("live") ||
    rawStatus.includes("playing") ||
    rawStatus.includes("1st_half") ||
    rawStatus.includes("2nd_half") ||
    rawStatus.includes("first_half") ||
    rawStatus.includes("second_half") ||
    rawStatus.includes("halftime") ||
    rawStatus.includes("half_time")
  ) {
    return {
      long: "Em andamento",
      short: "LIVE",
      elapsed: minute
    };
  }

  if (
    rawStatus.includes("finished") ||
    rawStatus.includes("finalizado") ||
    rawStatus.includes("encerr") ||
    rawStatus === "ft"
  ) {
    return {
      long: "Finalizado",
      short: "FT",
      elapsed: minute ?? 90
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

function normalizeLeagueItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const id = firstValue(
    item.id,
    item.league_id,
    item.competition_id
  );

  const name = firstValue(
    item.name,
    item.nome,
    item.title,
    item.league_name,
    item.competition_name,
    "Campeonato"
  );

  return {
    id,

    name,

    country: firstValue(
      countryText(item.country),
      countryText(item.country_data),
      countryText(item.pais),
      item.country_name,
      guessCountry(name)
    ),

    logo: firstValue(
      item.logo,
      item.image,
      item.escudo,
      item.badge,
      item.image_url,
      bsdLeagueLogo(id)
    )
  };
}

function buildLeagueMap(data) {
  const map = new Map();

  for (const item of arrayFrom(data)) {
    const league = normalizeLeagueItem(item);

    if (
      league?.id === null ||
      league?.id === undefined
    ) {
      continue;
    }

    map.set(
      String(league.id),
      league
    );
  }

  return map;
}

async function loadLeagueMap() {
  try {
    const data = await cachedFetch(
      "leagues",
      "/leagues/?limit=200",
      CACHE_TTL.leagues
    );

    return buildLeagueMap(data);
  } catch {
    return new Map();
  }
}

function normalizeLeague(
  event,
  leagueMap = new Map()
) {
  const leagueObject =
    event.league ||
    event.league_data ||
    event.competition ||
    {};

  const id = firstValue(
    event.league_id,
    leagueObject.id,
    leagueObject.league_id,
    event.competition_id
  );

  const mapped =
    id !== null &&
    id !== undefined
      ? leagueMap.get(String(id))
      : null;

  const rawEventName = firstValue(
    event.league_name,
    leagueObject.name,
    leagueObject.nome,
    event.campeonato,
    event.competition_name
  );

  const eventName =
    rawEventName &&
    String(rawEventName)
      .trim()
      .toLowerCase() !== "campeonato"
      ? rawEventName
      : null;

  const name = firstValue(
    mapped?.name,
    eventName,
    "Campeonato"
  );

  const rawCountry = firstValue(
    countryText(event.country),
    countryText(leagueObject.country),
    countryText(leagueObject.pais)
  );

  const eventCountry =
    rawCountry &&
    String(rawCountry)
      .trim()
      .toLowerCase() !== "internacional"
      ? rawCountry
      : null;

  return {
    id,

    name,

    country: firstValue(
      mapped?.country,
      eventCountry,
      guessCountry(name)
    ),

    logo: firstValue(
      mapped?.logo,
      event.league_logo,
      leagueObject.logo,
      leagueObject.image,
      leagueObject.escudo,
      bsdLeagueLogo(id)
    )
  };
}

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

function normalizeGoals(event) {
  return {
    home:
      numberValue(
        firstValue(
          event.home_score,
          event.home_goals,
          event.gols_mandante,
          event.gols_home
        )
      ) ?? 0,

    away:
      numberValue(
        firstValue(
          event.away_score,
          event.away_goals,
          event.gols_visitante,
          event.gols_away
        )
      ) ?? 0
  };
}

function normalizeMatch(
  event,
  leagueMap = new Map()
) {
  if (
    !event ||
    typeof event !== "object"
  ) {
    return null;
  }

  const source =
    event.raw &&
    typeof event.raw === "object"
      ? event.raw
      : event;

  const homeId = firstValue(
    source.home_team_id,
    source.home?.id,
    source.home_team?.id,
    source.mandante?.id,
    source.team_home?.id
  );

  const awayId = firstValue(
    source.away_team_id,
    source.away?.id,
    source.away_team?.id,
    source.visitante?.id,
    source.team_away?.id
  );

  const home = normalizeTeam(
    firstValue(
      source.home_team,
      source.home,
      source.mandante,
      source.time_mandante,
      source.team_home
    ),

    homeId,

    firstValue(
      source.home_team_logo,
      source.home?.logo,
      source.home_team?.logo
    ),

    true
  );

  const away = normalizeTeam(
    firstValue(
      source.away_team,
      source.away,
      source.visitante,
      source.time_visitante,
      source.team_away
    ),

    awayId,

    firstValue(
      source.away_team_logo,
      source.away?.logo,
      source.away_team?.logo
    ),

    true
  );

  const date =
    normalizeDate(source);

  return {
    fixture: {
      id: normalizeId(source),
      date,

      timestamp:
        date
          ? Date.parse(date)
          : null,

      status:
        normalizeStatus(source)
    },

    teams: {
      home,
      away
    },

    goals:
      normalizeGoals(source),

    league:
      normalizeLeague(
        source,
        leagueMap
      ),

    events:
      arrayFrom(
        firstValue(
          source.events,
          source.eventos,
          source.incidents,
          source.ocorrencias
        )
      ),

    statistics:
      source.statistics ||
      null,

    raw:
      source
  };
}

function normalizeSerieDStatus(match) {
  const raw = String(
    firstValue(
      match.status,
      match.statusCode,
      "scheduled"
    )
  ).toLowerCase();

  if (
    raw.includes("live") ||
    raw.includes("andamento") ||
    raw.includes("em_jogo") ||
    raw.includes("em jogo")
  ) {
    return {
      long: "Em andamento",
      short: "LIVE",
      elapsed: numberValue(match.minute)
    };
  }

  if (
    raw.includes("finished") ||
    raw.includes("encerr") ||
    raw.includes("final")
  ) {
    return {
      long: "Finalizado",
      short: "FT",
      elapsed: 90
    };
  }

  return {
    long: "Agendado",
    short: "NS",
    elapsed: null
  };
}

function normalizeSerieDMatch(
  match,
  round = {},
  competition = {}
) {
  const date = firstValue(
    match.dateTime,
    match.datetime,
    match.date,
    null
  );

  const groupName = firstValue(
    round.groupName,
    round.name,
    "Série D"
  );

  return {
    fixture: {
      id: `serie-d-${match.id}`,
      sourceId: match.id,
      date,

      timestamp:
        date
          ? Date.parse(date)
          : null,

      status:
        normalizeSerieDStatus(match)
    },

    teams: {
      home:
        normalizeTeam(
          match.homeTeam,
          null,

          firstValue(
            match.homeTeam?.logo,
            match.homeTeam?.image,
            match.homeTeam?.escudo
          ),

          false
        ),

      away:
        normalizeTeam(
          match.awayTeam,
          null,

          firstValue(
            match.awayTeam?.logo,
            match.awayTeam?.image,
            match.awayTeam?.escudo
          ),

          false
        )
    },

    goals: {
      home:
        numberValue(
          match.score?.home
        ) ?? 0,

      away:
        numberValue(
          match.score?.away
        ) ?? 0
    },

    league: {
      id:
        "serie-d-2026",

      name:
        firstValue(
          competition.name,
          "Campeonato Brasileiro Série D 2026"
        ),

      country:
        "Brasil",

      logo:
        firstValue(
          competition.logo,
          competition.image,
          null
        ),

      group:
        groupName
    },

    events: [],

    statistics:
      null,

    source:
      "campeonato-brasileiro-api",

    raw: {
      ...match,

      groupName,

      round:
        round.number,

      roundLabel:
        round.label
    }
  };
}

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
        Authorization:
          `Token ${API_KEY}`,

        Accept:
          "application/json"
      }
    }
  );

  const text =
    await response.text();

  let data = null;

  try {
    data =
      text
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

    error.status =
      response.status;

    error.data =
      data;

    error.path =
      path;

    throw error;
  }

  return data;
}

async function cachedFetch(
  key,
  path,
  ttl
) {
  return cachedCustom(
    key,
    ttl,
    () => apiFetch(path)
  );
}

function sendError(
  res,
  error
) {
  console.error(
    "SOCCERPLAY ERROR:",
    error.message,
    error.path || ""
  );

  res
    .status(
      error.status ||
      500
    )
    .json({
      error:
        error.message,

      status:
        error.status ||
        500,

      path:
        error.path ||
        null,

      details:
        error.data ||
        null
    });
}

function normalizeStandings(data) {
  const rows =
    Array.isArray(data)
      ? data
      : Array.isArray(
            data?.standings
          )
        ? data.standings
        : Array.isArray(
              data?.results
            )
          ? data.results
          : Array.isArray(
                data?.data
              )
            ? data.data
            : [];

  const standings =
    rows.map(
      (row, index) => {
        const team =
          row.team ||
          row.club ||
          row.time ||
          {};

        const teamId =
          firstValue(
            team.id,
            team.team_id,
            row.team_id
          );

        return {
          ...row,

          position:
            firstValue(
              row.position,
              row.rank,
              row.pos,
              index + 1
            ),

          team: {
            ...team,

            id:
              teamId,

            name:
              firstValue(
                team.name,
                team.nome,
                row.team_name,
                row.name,
                "Time"
              ),

            logo:
              firstValue(
                team.logo,
                team.image,
                row.team_logo,
                row.logo,
                bsdTeamLogo(
                  teamId
                )
              )
          },

          logo:
            firstValue(
              row.logo,
              row.team_logo,
              team.logo,
              bsdTeamLogo(
                teamId
              )
            ),

          points:
            firstValue(
              row.points,
              row.pts,
              row.pontos,
              0
            ),

          played:
            firstValue(
              row.played,
              row.matches_played,
              row.matches,
              row.games,
              row.jogos,
              0
            ),

          wins:
            firstValue(
              row.wins,
              row.won,
              row.vitorias,
              0
            ),

          draws:
            firstValue(
              row.draws,
              row.empates,
              0
            ),

          losses:
            firstValue(
              row.losses,
              row.lost,
              row.derrotas,
              0
            )
        };
      }
    );

  return {
    ...(
      typeof data === "object" &&
      !Array.isArray(data)
        ? data
        : {}
    ),

    standings
  };
}

app.get(
  "/api/health",
  (_req, res) => {
    res.json({
      ok: true,

      service:
        "soccerplay",

      providers: [
        "BSD - Bzzoiro Sports Data",
        "Campeonato Brasileiro API - Série D"
      ],

      apiConfigured:
        Boolean(API_KEY),

      baseUrl:
        API_BASE,

      imageBase:
        IMAGE_BASE,

      images: {
        teams: true,
        leagues: true
      },

      cachedItems:
        cache.size,

      pendingRequests:
        pending.size
    });
  }
);

app.get(
  "/api/live",
  async (_req, res) => {
    try {
      const [
        data,
        leagueMap
      ] =
        await Promise.all([
          cachedFetch(
            "live",
            "/events/live/",
            CACHE_TTL.live
          ),

          loadLeagueMap()
        ]);

      res.json({
        response:
          arrayFrom(data)
            .map(
              (item) =>
                normalizeMatch(
                  item,
                  leagueMap
                )
            )
            .filter(Boolean)
      });
    } catch (error) {
      sendError(
        res,
        error
      );
    }
  }
);

app.get(
  "/api/today",
  async (_req, res) => {
    try {
      const now =
        new Date();

      const parts =
        new Intl.DateTimeFormat(
          "en-US",
          {
            timeZone:
              "America/Sao_Paulo",

            year:
              "numeric",

            month:
              "2-digit",

            day:
              "2-digit"
          }
        ).formatToParts(
          now
        );

      const year =
        parts.find(
          (p) =>
            p.type === "year"
        )?.value;

      const month =
        parts.find(
          (p) =>
            p.type === "month"
        )?.value;

      const day =
        parts.find(
          (p) =>
            p.type === "day"
        )?.value;

      const date =
        `${year}-${month}-${day}`;

      const path =
        `/events/?date_from=${date}` +
        `&date_to=${date}` +
        `&limit=200`;

      const [
        data,
        leagueMap
      ] =
        await Promise.all([
          cachedFetch(
            `today-${date}`,
            path,
            CACHE_TTL.today
          ),

          loadLeagueMap()
        ]);

      res.json({
        response:
          arrayFrom(data)
            .map(
              (item) =>
                normalizeMatch(
                  item,
                  leagueMap
                )
            )
            .filter(Boolean)
      });
    } catch (error) {
      sendError(
        res,
        error
      );
    }
  }
);

app.get(
  "/api/fixture/:id",
  async (req, res) => {
    try {
      const id =
        encodeURIComponent(
          req.params.id
        );

      const [
        data,
        leagueMap
      ] =
        await Promise.all([
          cachedFetch(
            `fixture-${id}`,
            `/events/${id}/`,
            CACHE_TTL.fixture
          ),

          loadLeagueMap()
        ]);

      let raw =
        data;

      if (
        Array.isArray(
          data?.results
        )
      ) {
        raw =
          data.results[0] ||
          null;
      } else if (
        Array.isArray(
          data?.data
        )
      ) {
        raw =
          data.data[0] ||
          null;
      } else if (
        data?.results &&
        typeof data.results ===
          "object"
      ) {
        raw =
          data.results;
      } else if (
        data?.data &&
        typeof data.data ===
          "object"
      ) {
        raw =
          data.data;
      }

      res.json({
        response:
          normalizeMatch(
            raw,
            leagueMap
          )
      });
    } catch (error) {
      sendError(
        res,
        error
      );
    }
  }
);

app.get(
  "/api/leagues",
  async (_req, res) => {
    try {
      const data =
        await cachedFetch(
          "leagues",
          "/leagues/?limit=200",
          CACHE_TTL.leagues
        );

      const leagues =
        arrayFrom(data)
          .map(
            normalizeLeagueItem
          )
          .filter(Boolean)
          .sort(
            (a, b) => {
              const country =
                String(
                  a.country ||
                    ""
                ).localeCompare(
                  String(
                    b.country ||
                      ""
                  ),
                  "pt-BR"
                );

              return country !== 0
                ? country
                : String(
                    a.name ||
                      ""
                  ).localeCompare(
                    String(
                      b.name ||
                        ""
                    ),
                    "pt-BR"
                  );
            }
          );

      res.json({
        response:
          leagues
      });
    } catch (error) {
      sendError(
        res,
        error
      );
    }
  }
);

app.get(
  "/api/standings/:id",
  async (req, res) => {
    try {
      const rawId =
        String(
          req.params.id
        );

      if (
        [
          "serie-d",
          "serie-d-2026"
        ].includes(
          rawId.toLowerCase()
        )
      ) {
        const data =
          await cachedCustom(
            "serie-d-standings",
            CACHE_TTL.serieDStandings,
            () =>
              getStandings(
                "d"
              )
          );

        return res.json({
          response:
            data
        });
      }

      const id =
        encodeURIComponent(
          rawId
        );

      const data =
        await cachedFetch(
          `standings-${id}`,
          `/standings/?league=${id}`,
          CACHE_TTL.standings
        );

      res.json({
        response:
          normalizeStandings(
            data
          ),

        league_id:
          rawId
      });
    } catch (error) {
      sendError(
        res,
        error
      );
    }
  }
);

app.get(
  "/api/serie-d",
  async (_req, res) => {
    try {
      const data =
        await cachedCustom(
          "serie-d",
          CACHE_TTL.serieD,
          () =>
            getCompetition(
              "d"
            )
        );

      const rounds =
        Array.isArray(
          data?.rounds
        )
          ? data.rounds
          : [];

      const roundMatches =
        rounds.flatMap(
          (round) =>
            (
              Array.isArray(
                round?.matches
              )
                ? round.matches
                : []
            ).map(
              (match) =>
                normalizeSerieDMatch(
                  match,
                  round,
                  data?.competition ||
                    {}
                )
            )
        );

      const directMatches =
        Array.isArray(
          data?.matches
        )
          ? data.matches.map(
              (match) =>
                normalizeSerieDMatch(
                  match,

                  {
                    name:
                      data
                        ?.competition
                        ?.phase
                        ?.description ||
                      "Mata-mata"
                  },

                  data?.competition ||
                    {}
                )
            )
          : [];

      const seen =
        new Set();

      const matches = [
        ...roundMatches,
        ...directMatches
      ].filter(
        (match) => {
          const id =
            match?.fixture?.id;

          if (
            !id ||
            seen.has(id)
          ) {
            return false;
          }

          seen.add(id);

          return true;
        }
      );

      res.json({
        response:
          matches,

        competition:
          data?.competition ||
          null,

        groups:
          rounds.map(
            (r) => ({
              id:
                r.groupId ??
                r.id,

              name:
                r.groupName ??
                r.name ??
                null,

              round:
                r.number,

              label:
                r.label
            })
          )
      });
    } catch (error) {
      sendError(
        res,
        error
      );
    }
  }
);

app.get(
  "/api/serie-d/standings",
  async (_req, res) => {
    try {
      const data =
        await cachedCustom(
          "serie-d-standings",
          CACHE_TTL.serieDStandings,
          () =>
            getStandings(
              "d"
            )
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

app.listen(
  PORT,
  () => {
    console.log(
      `SoccerPlay backend rodando na porta ${PORT}`
    );

    console.log(
      "Providers: BSD + Campeonato Brasileiro API (Série D)"
    );
  }
);
