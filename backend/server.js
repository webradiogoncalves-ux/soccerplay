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
    throw new Error("API_FOOTBALL_KEY não configurada no Render");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: "application/json"
    }
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
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

    throw error;
  }

  return data;
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "soccerplay",
    apiConfigured: Boolean(API_KEY)
  });
});

app.get("/api/live", async (_req, res) => {
  try {
    const data = await apiFetch("/ao-vivo");

    res.json({
      response: data
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.data || null
    });
  }
});

app.get("/api/today", async (req, res) => {
  try {
    const date =
      req.query.date ||
      new Date().toLocaleDateString("en-CA", {
        timeZone: "America/Sao_Paulo"
      });

    const data = await apiFetch(
      `/partidas?data=${encodeURIComponent(date)}`
    );

    res.json({
      response: data
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.data || null
    });
  }
});

app.get("/api/fixture/:id", async (req, res) => {
  try {
    const data = await apiFetch(
      `/partidas/${encodeURIComponent(req.params.id)}`
    );

    res.json({
      response: data
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.data || null
    });
  }
});

app.get("/api/standings/:id", async (req, res) => {
  try {
    const data = await apiFetch(
      `/campeonatos/${encodeURIComponent(req.params.id)}/tabela`
    );

    res.json({
      response: data
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.data || null
    });
  }
});

app.get("/api/leagues", async (_req, res) => {
  try {
    const data = await apiFetch("/campeonatos");

    res.json({
      response: data
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.data || null
    });
  }
});

app.listen(PORT, () => {
  console.log(
    `SoccerPlay backend rodando na porta ${PORT}`
  );
});
