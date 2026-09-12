const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_BASE = "https://api.api-futebol.com.br/v1";

if (!API_KEY) {
  console.warn("ATENÇÃO: API_FOOTBALL_KEY não configurada no ambiente.");
}

/**
 * Consulta a API Futebol da FutDev.
 *
 * A autenticação da API nova é:
 * Authorization: Bearer SEU_TOKEN
 */
async function apiFootball(path, options = {}) {
  const url = `${API_BASE}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${API_KEY}`,
      ...(options.headers || {})
    }
  });

  const text = await response.text();

  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {
      error: text || "Resposta inválida da API"
    };
  }

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      data?.erro ||
      `API respondeu HTTP ${response.status}`;

    const error = new Error(message);
    error.status = response.status;
    error.apiResponse = data;
    throw error;
  }

  return data;
}

/**
 * Resposta padronizada de erro para o aplicativo.
 */
function sendError(res, error) {
  console.error("Erro API:", error);

  const status = error.status || 500;

  res.status(status).json({
    error: error.message || "Erro ao consultar API de futebol"
  });
}

/**
 * Health check
 */
app.get("/api/health", async (req, res) => {
  res.json({
    ok: true,
    service: "SoccerPlay-Lite",
    provider: "FutDev - API Futebol"
  });
});

/**
 * PARTIDAS AO VIVO
 *
 * API Futebol:
 * GET /v1/ao-vivo
 */
app.get("/api/live", async (req, res) => {
  try {
    const data = await apiFootball("/ao-vivo");

    res.json(normalizeResponse(data));
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * JOGOS DE HOJE
 *
 * A API Futebol possui cobertura de campeonatos,
 * partidas e dados em tempo real.
 *
 * Como a documentação pública da referência ainda está
 * sendo ampliada, tentamos o endpoint de partidas usando
 * a data atual.
 */
app.get("/api/today", async (req, res) => {
  try {
    const date =
      req.query.date ||
      new Date().toISOString().slice(0, 10);

    const paths = [
      `/partidas?data=${encodeURIComponent(date)}`,
      `/partidas?date=${encodeURIComponent(date)}`
    ];

    let lastError = null;

    for (const path of paths) {
      try {
        const data = await apiFootball(path);
        return res.json(normalizeResponse(data));
      } catch (error) {
        lastError = error;

        // Se o endpoint existir mas retornou erro de autenticação,
        // não tentamos outro formato.
        if ([401, 403].includes(error.status)) {
          throw error;
        }
      }
    }

    throw lastError || new Error("Não foi possível consultar os jogos de hoje.");
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * DETALHES DE UMA PARTIDA
 */
app.get("/api/fixture/:id", async (req, res) => {
  try {
    const id = encodeURIComponent(req.params.id);

    const paths = [
      `/partidas/${id}`,
      `/partidas/${id}/detalhes`
    ];

    let lastError = null;

    for (const path of paths) {
      try {
        const data = await apiFootball(path);
        return res.json(normalizeResponse(data));
      } catch (error) {
        lastError = error;

        if ([401, 403].includes(error.status)) {
          throw error;
        }
      }
    }

    throw lastError || new Error("Partida não encontrada.");
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * TABELA DE UM CAMPEONATO
 *
 * API Futebol:
 * GET /v1/campeonatos/{id}/tabela
 */
app.get("/api/standings", async (req, res) => {
  try {
    const league =
      req.query.league ||
      req.query.campeonato ||
      req.query.id;

    if (!league) {
      return res.status(400).json({
        error: "Informe o ID do campeonato."
      });
    }

    const data = await apiFootball(
      `/campeonatos/${encodeURIComponent(league)}/tabela`
    );

    res.json(normalizeResponse(data));
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * LISTA DE CAMPEONATOS
 *
 * Mantemos o endpoint /api/leagues para o frontend
 * continuar usando a mesma estrutura.
 */
app.get("/api/leagues", async (req, res) => {
  try {
    const data = await apiFootball("/campeonatos");

    res.json(normalizeResponse(data));
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * Normalização básica.
 *
 * O frontend antigo espera:
 *
 * {
 *   response: [...]
 * }
 *
 * Assim mantemos a interface do SoccerPlay praticamente
 * independente do fornecedor da API.
 */
function normalizeResponse(data) {
  if (Array.isArray(data)) {
    return {
      response: data
    };
  }

  if (Array.isArray(data?.response)) {
    return data;
  }

  if (Array.isArray(data?.data)) {
    return {
      ...data,
      response: data.data
    };
  }

  if (Array.isArray(data?.partidas)) {
    return {
      ...data,
      response: data.partidas
    };
  }

  if (Array.isArray(data?.jogos)) {
    return {
      ...data,
      response: data.jogos
    };
  }

  if (Array.isArray(data?.campeonatos)) {
    return {
      ...data,
      response: data.campeonatos
    };
  }

  return {
    ...data,
    response: data?.response || []
  };
}

/**
 * Tratamento geral de erros.
 */
app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).json({
    error: err.message || "Erro interno do servidor"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `SoccerPlay-Lite backend rodando na porta ${PORT}`
  );
});
