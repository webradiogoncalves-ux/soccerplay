import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const API_KEY = process.env.API_FOOTBALL_KEY;
const API_BASE = process.env.API_FOOTBALL_BASE || "https://v3.football.api-sports.io";

if (!API_KEY) {
  console.warn("API_FOOTBALL_KEY não configurada. Crie backend/.env a partir de .env.example");
}

async function apiFootball(path, params = {}) {
  const url = new URL(API_BASE + path);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url, {
    headers: { "x-apisports-key": API_KEY || "" }
  });

  const data = await response.json();
  if (!response.ok || data.errors && Object.keys(data.errors).length) {
    const message = typeof data.errors === "object" ? JSON.stringify(data.errors) : String(data.errors);
    throw new Error(message || `API HTTP ${response.status}`);
  }
  return data;
}

function todayBrazil() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, provider: "API-Football" });
});

app.get("/api/live", async (_req, res) => {
  try {
    const data = await apiFootball("/fixtures", { live: "all" });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get("/api/today", async (req, res) => {
  try {
    const date = req.query.date || todayBrazil();
    const data = await apiFootball("/fixtures", {
      date,
      timezone: "America/Sao_Paulo"
    });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get("/api/fixture/:id", async (req, res) => {
  try {
    const data = await apiFootball("/fixtures", { id: req.params.id });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get("/api/standings", async (req, res) => {
  try {
    const data = await apiFootball("/standings", {
      league: req.query.league,
      season: req.query.season
    });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get("/api/leagues", async (req, res) => {
  try {
    const data = await apiFootball("/leagues", {
      country: req.query.country,
      season: req.query.season
    });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`SoccerPlay-Lite backend em http://localhost:${PORT}`);
});
