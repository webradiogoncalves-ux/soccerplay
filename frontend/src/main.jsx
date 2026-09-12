import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bell, CalendarDays, ChevronRight, Clock3, Heart, Home, ListOrdered, RefreshCw, Search, Star, Trophy, X } from "lucide-react";
import "./styles.css";

const API = import.meta.env.VITE_API_BASE || "http://localhost:3001/api";

const BRAZIL_NAMES = ["Brasil", "Brazil"];
const MAJOR = ["Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1", "UEFA Champions League", "UEFA Europa League", "UEFA Europa Conference League", "Liga Portugal"];

async function getJSON(path) {
  const r = await fetch(`${API}${path}`);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Erro ao consultar servidor");
  return data;
}

function statusLabel(s) {
  const map = { NS:"Não iniciado", TBD:"A definir", "1H":"1º tempo", HT:"Intervalo", "2H":"2º tempo", ET:"Prorrogação", BT:"Intervalo", P:"Pênaltis", FT:"Final", AET:"Final", PEN:"Final" };
  return map[s] || s || "";
}

function formatTime(date) {
  try { return new Intl.DateTimeFormat("pt-BR", {hour:"2-digit", minute:"2-digit", timeZone:"America/Sao_Paulo"}).format(new Date(date)); }
  catch { return ""; }
}

function MatchCard({ match, onOpen, favorite, onFavorite }) {
  const f = match.fixture, t = match.teams, g = match.goals, live = ["1H","HT","2H","ET","BT","P"].includes(f.status.short);
  return <button className="match" onClick={() => onOpen(f.id)}>
    <div className="matchTop">
      <span>{match.league?.name || "Futebol"}</span>
      <span className={live ? "liveDot" : ""}>{live ? `AO VIVO ${f.status.elapsed ? f.status.elapsed + "'" : ""}` : statusLabel(f.status.short)}</span>
    </div>
    <div className="teams">
      <div><img src={t.home.logo} /><b>{t.home.name}</b></div>
      <strong>{g.home ?? 0} <small>x</small> {g.away ?? 0}</strong>
      <div><img src={t.away.logo} /><b>{t.away.name}</b></div>
    </div>
    <div className="matchBottom">
      <span>{live ? "Atualizando automaticamente" : formatTime(f.date)}</span>
      <span onClick={(e)=>{e.stopPropagation();onFavorite(match)}} className="fav">{favorite ? "★" : "☆"}</span>
    </div>
  </button>
}

function VirtualField({ events, home, away }) {
  const goals = events.filter(e => e.type === "Goal");
  const cards = events.filter(e => e.type === "Card");
  return <div className="fieldWrap">
    <div className="field">
      <div className="halfLine" />
      <div className="centerCircle" />
      <div className="box homeBox" />
      <div className="box awayBox" />
      <div className="goal homeGoal" />
      <div className="goal awayGoal" />
      {goals.map((e,i) => <div key={"g"+i} className={`eventMarker ${e.team?.id===home.id?"homeMarker":"awayMarker"}`} style={{left:e.team?.id===home.id?"28%":"72%", top:`${28+i*12}%`}}>⚽</div>)}
      {cards.map((e,i) => <div key={"c"+i} className={`cardMarker ${e.team?.id===home.id?"homeMarker":"awayMarker"}`} style={{left:e.team?.id===home.id?"40%":"60%", top:`${50+i*7}%`}}>🟨</div>)}
    </div>
    <div className="fieldLegend"><span>◉ {home.name}</span><span>{away.name} ◉</span></div>
    <p className="muted">Campo baseado em eventos reais. Sem dados de tracking/posição, o app não inventa movimentação de jogadores.</p>
  </div>
}

function App() {
  const [tab, setTab] = useState("home");
  const [live, setLive] = useState([]);
  const [today, setToday] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState(() => JSON.parse(localStorage.getItem("soccerplay:favs") || "[]"));
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setError("");
      const [l,t] = await Promise.all([getJSON("/live"), getJSON("/today")]);
      setLive(l.response || []);
      setToday(t.response || []);
    } catch(e) { setError(e.message); }
  };

  useEffect(() => { load(); const id=setInterval(load,15000); return()=>clearInterval(id); }, []);

  useEffect(() => {
    if (!selected) return;
    getJSON(`/fixture/${selected}`).then(d => setDetail(d.response?.[0] || null)).catch(e => setError(e.message));
  }, [selected]);

  const toggleFavorite = (m) => {
    const id=m.fixture.id;
    const next=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];
    setFavorites(next); localStorage.setItem("soccerplay:favs", JSON.stringify(next));
  };

  const all = [...live, ...today.filter(x=>!live.some(l=>l.fixture.id===x.fixture.id))];
  const filtered = all.filter(m => `${m.teams.home.name} ${m.teams.away.name} ${m.league?.name}`.toLowerCase().includes(query.toLowerCase()));
  const brazil = today.filter(m => BRAZIL_NAMES.includes(m.league?.country));
  const europe = today.filter(m => MAJOR.some(x => (m.league?.name||"").toLowerCase().includes(x.toLowerCase())));

  if (detail) {
    const events=detail.events||[];
    return <div className="app">
      <header className="topbar"><button className="iconBtn" onClick={()=>{setDetail(null);setSelected(null)}}><X/></button><div><small>{detail.league?.name}</small><h1>{detail.teams.home.name} x {detail.teams.away.name}</h1></div></header>
      <main className="content detail">
        <div className="scoreHero">
          <div><img src={detail.teams.home.logo}/><b>{detail.teams.home.name}</b></div>
          <strong>{detail.goals.home ?? 0} <small>x</small> {detail.goals.away ?? 0}</strong>
          <div><img src={detail.teams.away.logo}/><b>{detail.teams.away.name}</b></div>
        </div>
        <div className="pill">{statusLabel(detail.fixture.status.short)} {detail.fixture.status.elapsed ? `• ${detail.fixture.status.elapsed}'` : ""}</div>
        <VirtualField events={events} home={detail.teams.home} away={detail.teams.away}/>
        <section className="panel"><h2>Eventos</h2>{events.length ? events.map((e,i)=><div className="eventRow" key={i}><b>{e.time?.elapsed}'</b><span>{e.type==="Goal"?"⚽":e.type==="Card"?"🟨":"🔄"}</span><span>{e.team?.name}</span><span>{e.player?.name || e.detail || ""}</span></div>) : <p className="muted">Nenhum evento disponível.</p>}</section>
      </main>
    </div>
  }

  return <div className="app">
    <header className="topbar appTopbar">
      <div className="brandCenter"><h1>SOCCERPLAY</h1></div>
      <button className="iconBtn topRefresh" onClick={load} aria-label="Atualizar"><RefreshCw/></button>
    </header>
    <main className="content">
      {error && <div className="error">{error}</div>}
      <div className="search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar time ou competição"/></div>
      <div className="hero"><div><span>AO VIVO</span><h2>{live.length} partidas agora</h2><p>Atualização automática a cada 15 segundos.</p></div><Bell/></div>
      {tab==="home" && <>
        <Section title="Ao vivo" icon={<span className="redDot"/>}>{live.length ? live.map(m=><MatchCard key={m.fixture.id} match={m} onOpen={setSelected} favorite={favorites.includes(m.fixture.id)} onFavorite={toggleFavorite}/>) : <Empty text="Nenhuma partida ao vivo neste momento."/>}</Section>
        <Section title="Brasil hoje" icon={<Trophy/>}>{brazil.slice(0,12).map(m=><MatchCard key={m.fixture.id} match={m} onOpen={setSelected} favorite={favorites.includes(m.fixture.id)} onFavorite={toggleFavorite}/>)}</Section>
        <Section title="Europa" icon={<Star/>}>{europe.slice(0,12).map(m=><MatchCard key={m.fixture.id} match={m} onOpen={setSelected} favorite={favorites.includes(m.fixture.id)} onFavorite={toggleFavorite}/>)}</Section>
      </>}
      {tab==="matches" && <Section title="Jogos de hoje" icon={<CalendarDays/>}>{filtered.map(m=><MatchCard key={m.fixture.id} match={m} onOpen={setSelected} favorite={favorites.includes(m.fixture.id)} onFavorite={toggleFavorite}/>)}</Section>}
      {tab==="favorites" && <Section title="Favoritos" icon={<Heart/>}>{filtered.filter(m=>favorites.includes(m.fixture.id)).map(m=><MatchCard key={m.fixture.id} match={m} onOpen={setSelected} favorite onFavorite={toggleFavorite}/>)}</Section>}
      {tab==="tables" && <div className="panel"><h2>Tabelas</h2><p className="muted">A estrutura está pronta para consultar /standings da API por competição e temporada. No próximo passo podemos colocar os campeonatos escolhidos em abas.</p></div>}
    </main>
    <nav className="bottom">
      <Nav active={tab==="home"} icon={<Home/>} text="Início" onClick={()=>setTab("home")}/>
      <Nav active={tab==="matches"} icon={<ListOrdered/>} text="Jogos" onClick={()=>setTab("matches")}/>
      <Nav active={tab==="favorites"} icon={<Heart/>} text="Favoritos" onClick={()=>setTab("favorites")}/>
      <Nav active={tab==="tables"} icon={<Trophy/>} text="Tabelas" onClick={()=>setTab("tables")}/>
    </nav>
  </div>
}

function Section({title,icon,children}) { return <section className="section"><div className="sectionTitle"><h2>{icon}{title}</h2><ChevronRight size={18}/></div>{children}</section> }
function Nav({active,icon,text,onClick}) { return <button className={active?"nav active":"nav"} onClick={onClick}>{icon}<span>{text}</span></button> }
function Empty({text}) { return <div className="empty">{text}</div> }

createRoot(document.getElementById("root")).render(<App />);
