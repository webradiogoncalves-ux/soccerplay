import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

const API_BASE = "https://api.api-futebol.com.br/v1";
const API_KEY = process.env.API_FOOTBALL_KEY;

/*
 * ============================================================
 * SOCCERPLAY - BACKEND
 * API Futebol / FutDev
 * ============================================================
 */

async function apiFetch(path) {
  if (!API_KEY) {
    const error = new Error(
      "API_FOOTBALL_KEY não configurada no Render"
    );

    error.status = 500;
    throw error;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: "application/json"
    }
  });

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

    throw error;
  }

  return data;
}

/*
 * ------------------------------------------------------------
 * Utilidades
 * ------------------------------------------------------------
 */

function arrayFrom(data) {
  if (Array.isArray(data)) return data;

  if (!data || typeof data !== "object") {
    return [];
  }

  const possibleArrays = [
    data.response,
    data.data,
    data.partidas,
    data.jogos,
    data.matches,
    data.resultados,
    data.items
  ];

  for (const item of possibleArrays) {
    if (Array.isArray(item)) {
      return item;
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
    if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      return value;
    }

    if (
      typeof value === "string" &&
      value.trim() !== "" &&
      !Number.isNaN(Number(value))
    ) {
      return Number(value);
    }
  }

  return null;
}

function teamObject(team, fallbackName = "Time") {
  team = team || {};

  const id = firstValue(
    team.id,
    team.time_id,
    team.codigo,
    team.slug
  );

  const name = firstValue(
    team.name,
    team.nome,
    team.team_name,
    team.time,
    fallbackName
  );

  const logo = firstValue(
    team.logo,
    team.escudo,
    team.logo_url,
    team.imagem,
    ""
  );

  return {
    id,
    name,
    logo
  };
}

/*
 * ------------------------------------------------------------
 * Status
 * ------------------------------------------------------------
 */

function normalizeStatus(match) {
  const raw = String(
    firstValue(
      match.status,
      match.situacao,
      match.estado,
      match.status_jogo,
      match.status_partida
    ) || ""
  ).toLowerCase();

  const minute = numberValue(
    match.minuto,
    match.minute,
    match.tempo,
    match.elapsed
  );

  if (
    raw.includes("final") ||
    raw.includes("encerr") ||
    raw === "ft"
  ) {
    return {
      short: "FT",
      long: "Final",
      elapsed: minute
    };
  }

  if (
    raw.includes("intervalo") ||
    raw === "ht"
  ) {
    return {
      short: "HT",
      long: "Intervalo",
      elapsed: minute
    };
  }

  if (
    raw.includes("ao vivo") ||
    raw.includes("andamento") ||
    raw.includes("live") ||
    raw.includes("jogando") ||
    raw.includes("1 tempo") ||
    raw.includes("2 tempo") ||
    minute !== null
  ) {
    return {
      short: minute !== null && minute > 45 ? "2H" : "1H",
      long: "Ao vivo",
      elapsed: minute
    };
  }

  return {
    short: "NS",
    long: "Não iniciado",
    elapsed: minute
  };
}

/*
 * ------------------------------------------------------------
 * Times
 * ------------------------------------------------------------
 */

function getHomeTeam(match) {
  return teamObject(
    firstValue(
      match.home,
      match.mandante,
      match.time_mandante,
      match.home_team,
      match.equipe_mandante
    ),
    "Mandante"
  );
}

function getAwayTeam(match) {
  return teamObject(
    firstValue(
      match.away,
      match.visitante,
      match.time_visitante,
      match.away_team,
      match.equipe_visitante
    ),
    "Visitante"
  );
}

/*
 * ------------------------------------------------------------
 * Placar
 * ------------------------------------------------------------
 */

function getGoals(match) {
  const home = numberValue(
    match.gols_mandante,
    match.gols_mandante_total,
    match.home_score,
    match.home_goals,
    match.placar_mandante,
    match.mandante_gols,
    match.home?.score,
    match.home?.goals
  );

  const away = numberValue(
    match.gols_visitante,
    match.gols_visitante_total,
    match.away_score,
    match.away_goals,
    match.placar_visitante,
    match.visitante_gols,
    match.away?.score,
    match.away?.goals
  );

  /*
   * Alguns retornos podem trazer o placar como:
   * "2 x 1"
   */
  const partida = firstValue(
    match.partida,
    match.jogo,
    match.nome
  );

  if (
    (home === null || away === null) &&
    typeof partida === "string"
  ) {
    const found = partida.match(
      /(\d+)\s*[xX×-]\s*(\d+)/
    );

    if (found) {
      return {
        home: home ?? Number(found[1]),
        away: away ?? Number(found[2])
      };
    }
  }

  return {
    home: home ?? 0,
    away: away ?? 0
  };
}

/*
 * ------------------------------------------------------------
 * Campeonato
 * ------------------------------------------------------------
 */

function getLeague(match) {
  const championship = firstValue(
    match.campeonato,
    match.competicao,
    match.competition,
    match.league
  );

  if (typeof championship === "string") {
    return {
      id: null,
      name: championship,
      country: firstValue(
        match.pais,
        match.country,
        match.campeonato_pais,
        "Brasil"
      )
    };
  }

  championship = championship || {};

  return {
    id: firstValue(
      championship.id,
      championship.campeonato_id
    ),
    name: firstValue(
      championship.name,
      championship.nome,
      championship.campeonato,
      "Futebol"
    ),
    country: firstValue(
      championship.country,
      championship.pais,
      match.pais,
      match.country,
      "Brasil"
    )
  };
}

/*
 * ------------------------------------------------------------
 * Data/hora
 * ------------------------------------------------------------
 */

function getMatchDate(match) {
  return firstValue(
    match.data_hora,
    match.dataHora,
    match.datetime,
    match.date_time,
    match.data_inicio,
    match.horario,
    match.date,
    match.data,
    new Date().toISOString()
  );
}

/*
 * ------------------------------------------------------------
 * ID
 * ------------------------------------------------------------
 */

function getMatchId(match, index = 0) {
  return firstValue(
    match.id,
    match.partida_id,
    match.jogo_id,
    match.fixture_id,
    match.codigo,
    `soccerplay-${index}`
  );
}

/*
 * ------------------------------------------------------------
 * Eventos
 * ------------------------------------------------------------
 */

function normalizeEvent(event) {
  if (!event || typeof event !== "object") {
    return null;
  }

  const rawType = String(
    firstValue(
      event.type,
      event.tipo,
      event.evento,
      event.event_type,
      ""
    )
  ).toLowerCase();

  let type = "Other";

  if (
    rawType.includes("gol") ||
    rawType.includes("goal")
  ) {
    type = "Goal";
  } else if (
    rawType.includes("cartao") ||
    rawType.includes("cartão") ||
    rawType.includes("card") ||
    rawType.includes("amarelo")
  ) {
    type = "Card";
  } else if (
    rawType.includes("substit") ||
    rawType.includes("troca")
  ) {
    type = "subst";
  }

  const team = teamObject(
    firstValue(
      event.team,
      event.time,
      event.equipe
    ),
    "Time"
  );

  const playerObject = firstValue(
    event.player,
    event.jogador
  );

  const playerName =
    typeof playerObject === "string"
      ? playerObject
      : firstValue(
          playerObject?.name,
          playerObject?.nome,
          event.jogador_nome,
          event.player_name,
          event.nome_jogador,
          event.detalhe,
          event.detail,
          ""
        );

  return {
    type,
    team,
    player: {
      id:
        typeof playerObject === "object"
          ? firstValue(
              playerObject?.id,
              playerObject?.jogador_id
            )
          : null,
      name: playerName
    },
    time: {
      elapsed: numberValue(
        event.minuto,
        event.minute,
        event.tempo,
        event.elapsed,
        event.time?.elapsed
      )
    },
    detail: firstValue(
      event.detalhe,
      event.detail,
      event.descricao,
      event.description,
      ""
    )
  };
}

function getEvents(match) {
  const rawEvents = firstValue(
    match.events,
    match.eventos,
    match.lances,
    match.ocorrencias
  );

  if (!Array.isArray(rawEvents)) {
    return [];
  }

  return rawEvents
    .map(normalizeEvent)
    .filter(Boolean);
}

/*
 * ------------------------------------------------------------
 * Normalização principal
 * ------------------------------------------------------------
 */

function normalizeMatch(match, index = 0) {
  const home = getHomeTeam(match);
  const away = getAwayTeam(match);
  const goals = getGoals(match);
  const league = getLeague(match);
  const status = normalizeStatus(match);

  return {
    fixture: {
      id: getMatchId(match, index),
      date: getMatchDate(match),
      status
    },

    teams: {
      home,
      away
    },

    goals,

    league,

    events: getEvents(match),

    /*
     * Mantém os dados originais disponíveis
     * para futuras funções do SoccerPlay.
     */
    soccerplay: {
      original: match
    }
  };
}

/*
 * ------------------------------------------------------------
 * Extrai partidas de qualquer formato retornado pela API
 * ------------------------------------------------------------
 */

function normalizeResponse(data) {
  const list = arrayFrom(data);

  return list.map((match, index) =>
    normalizeMatch(match, index)
  );
}

/*
 * ------------------------------------------------------------
 * HEALTH
 * ------------------------------------------------------------
 */

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "soccerplay",
    provider: "API Futebol - FutDev",
    apiConfigured: Boolean(API_KEY),
    baseUrl: API_BASE
  });
});

/*
 * ------------------------------------------------------------
 * AO VIVO
 * ------------------------------------------------------------
 */

app.get("/api/live", async (_req, res) => {
  try {
    let data;

    try {
      data = await apiFetch("/partidas/ao-vivo");
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }

      data = await apiFetch("/ao-vivo");
    }

    const response = normalizeResponse(data);

    res.json({
      response
    });
  } catch (error) {
    sendError(res, error);
  }
});

/*
 * ------------------------------------------------------------
 * JOGOS DE HOJE
 *
 * A API Futebol possui endpoints que podem variar conforme
 * o plano/versão. Tentamos os formatos disponíveis.
 * ------------------------------------------------------------
 */

app.get("/api/today", async (_req, res) => {
  try {
    let data = null;

    const endpoints = [
      "/partidas",
      "/jogos",
      "/partidas/hoje"
    ];

    for (const endpoint of endpoints) {
      try {
        data = await apiFetch(endpoint);
        break;
      } catch (error) {
        if (
          error.status !== 404 &&
          error.status !== 400
        ) {
          throw error;
        }
      }
    }

    /*
     * Caso a conta/versão da API disponibilize somente
     * partidas ao vivo, usamos esse retorno como fallback.
     */
    if (!data) {
      try {
        data = await apiFetch("/partidas/ao-vivo");
      } catch (error) {
        if (error.status === 404) {
          data = await apiFetch("/ao-vivo");
        } else {
          throw error;
        }
      }
    }

    const response = normalizeResponse(data);

    res.json({
      response
    });
  } catch (error) {
    sendError(res, error);
  }
});

/*
 * ------------------------------------------------------------
 * DETALHES DA PARTIDA
 * ------------------------------------------------------------
 */

app.get("/api/fixture/:id", async (req, res) => {
  try {
    const id = encodeURIComponent(req.params.id);

    const data = await apiFetch(`/partidas/${id}`);

    const list = arrayFrom(data);

    let response;

    if (list.length) {
      response = list.map((match, index) =>
        normalizeMatch(match, index)
      );
    } else if (
      data &&
      typeof data === "object"
    ) {
      response = [
        normalizeMatch(data, 0)
      ];
    } else {
      response = [];
    }

    res.json({
      response
    });
  } catch (error) {
    sendError(res, error);
  }
});

/*
 * ------------------------------------------------------------
 * TABELA
 * ------------------------------------------------------------
 */

app.get("/api/standings/:id", async (req, res) => {
  try {
    const id = encodeURIComponent(req.params.id);

    const data = await apiFetch(
      `/campeonatos/${id}/tabela`
    );

    res.json({
      response: data
    });
  } catch (error) {
    sendError(res, error);
  }
});

/*
 * ------------------------------------------------------------
 * CAMPEONATOS
 * ------------------------------------------------------------
 */

app.get("/api/leagues", async (_req, res) => {
  try {
    const data = await apiFetch("/campeonatos");

    res.json({
      response: data
    });
  } catch (error) {
    sendError(res, error);
  }
});

/*
 * ------------------------------------------------------------
 * ERROS
 * ------------------------------------------------------------
 */

function sendError(res, error) {
  console.error("SoccerPlay API error:", error);

  res.status(error.status || 500).json({
    error: error.message,
    path: error.path || null,
    details: error.data || null
  });
}

/*
 * ------------------------------------------------------------
 * START
 * ------------------------------------------------------------
 */

app.listen(PORT, () => {
  console.log(
    `SoccerPlay backend rodando na porta ${PORT}`
  );
});
