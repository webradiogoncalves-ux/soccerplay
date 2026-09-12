import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const API_BASE = "https://api.api-futebol.com.br/v1";
const API_KEY = process.env.API_FOOTBALL_KEY;

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

function sendError(res, error) {
  res.status(error.status || 500).json({
    error: error.message,
    path: error.path || null,
    details: error.data || null
  });
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "soccerplay",
    provider: "API Futebol - FutDev",
    apiConfigured: Boolean(API_KEY),
    baseUrl: API_BASE
  });
});

app.get("/api/live", async (_req, res) => {
  try {
    try {
      const data = await apiFetch("/partidas/ao-vivo");

      return res.json({
        response: data
      });
    } catch (firstError) {
      if (firstError.status !== 404) {
        throw firstError;
      }
    }

    const data = await apiFetch("/ao-vivo");

    res.json({
      response: data
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/today", async (_req, res) => {
  try {
    let data;

    try {
      data = await apiFetch("/partidas/ao-vivo");
    } catch (firstError) {
      if (firstError.status !== 404) {
        throw firstError;
      }

      data = await apiFetch("/ao-vivo");
    }

    res.json({
      response: data
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/fixture/:id", async (req, res) => {
  try {
    const id = encodeURIComponent(req.params.id);

    const data = await apiFetch(`/partidas/${id}`);

    res.json({
      response: data
    });
  } catch (error) {
    sendError(res, error);
  }
});

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

app.listen(PORT, () => {
  console.log(
    `SoccerPlay backend rodando na porta ${PORT}`
  );
});
