import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { TextToSpeech } from "@capacitor-community/text-to-speech";
import {
  CalendarDays, ChevronLeft, ChevronRight, CircleDot, Clock3,
  Heart, ListFilter, RefreshCw, Search, Star, Trophy,
  Volume2, VolumeX, X
} from "lucide-react";
import "./styles.css";

const API = import.meta.env.VITE_API_BASE || "http://localhost:3001/api";
const LIVE = new Set(["LIVE", "1H", "HT", "2H", "ET", "BT", "P"]);
const FINISHED = new Set(["FT", "AET", "PEN"]);

async function getJSON(path) {
  const r = await fetch(`${API}${path}`, { cache: "no-store" });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(data?.error || `Erro ${r.status}`);
  return data;
}
const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const status = m => String(m?.fixture?.status?.short || "").toUpperCase();
const isLive = m => LIVE.has(status(m));
const isFinished = m => FINISHED.has(status(m));

function dateKey(v) {
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone:"America/Sao_Paulo", year:"numeric", month:"2-digit", day:"2-digit"
  }).format(d);
}
function time(v) {
  const d = new Date(v);
  if (!v || Number.isNaN(d.getTime())) return "--:--";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone:"America/Sao_Paulo", hour:"2-digit", minute:"2-digit"
  }).format(d);
}
function label(m) {
  const s=status(m), e=m?.fixture?.status?.elapsed;
  if (LIVE.has(s)) return e ? `${e}'` : "AO VIVO";
  if (FINISHED.has(s)) return "ENC.";
  return time(m?.fixture?.date);
}
function days() {
  const a=[], now=new Date();
  for(let i=-3;i<=3;i++){
    const d=new Date(now); d.setDate(d.getDate()+i);
    a.push({
      key:dateKey(d),
      day:new Intl.DateTimeFormat("pt-BR",{weekday:"short",timeZone:"America/Sao_Paulo"}).format(d).replace(".","").toUpperCase(),
      number:new Intl.DateTimeFormat("pt-BR",{day:"2-digit",timeZone:"America/Sao_Paulo"}).format(d)
    });
  }
  return a;
}
function dedupe(a) {
  const seen=new Set();
  return a.filter(m=>{
    const id=String(m?.fixture?.id||"");
    if(!id) return true;
    if(seen.has(id)) return false;
    seen.add(id); return true;
  });
}
function groups(matches) {
  const map=new Map();
  for(const m of matches){
    const l=m?.league||{};
    const key=`${l.id||l.name||"liga"}::${l.country||"Internacional"}::${l.group||""}`;
    if(!map.has(key)) map.set(key,{key,league:l,matches:[]});
    map.get(key).matches.push(m);
  }
  return [...map.values()];
}
function standingsRows(data) {
  const out=[], seen=new Set();
  function walk(v){
    if(!v||typeof v!=="object"||seen.has(v)) return;
    seen.add(v);
    if(Array.isArray(v)){
      if(v.some(x=>x&&typeof x==="object"&&(x.rank!=null||x.position!=null||x.points!=null||x.pts!=null))){
        out.push(...v); return;
      }
      v.forEach(walk); return;
    }
    ["standings","classification","classificacao","table","rows","response","data"].forEach(k=>walk(v[k]));
  }
  walk(data); return out;
}
function row(r,i){
  const t=r?.team||r?.club||r?.time||{};
  return {
    pos:r?.position??r?.rank??r?.pos??i+1,
    name:t?.name??t?.nome??r?.team_name??r?.name??"Time",
    logo:t?.logo??t?.image??t?.escudo??r?.logo??null,
    played:r?.played??r?.matches_played??r?.matches??r?.games??0,
    points:r?.points??r?.pts??r?.pontos??0
  };
}

function TeamLogo({team,size=30}) {
  const [bad,setBad]=useState(false);
  useEffect(()=>setBad(false),[team?.logo]);
  if(!team?.logo||bad) return <span className="teamFallback" style={{width:size,height:size,minWidth:size,display:"grid",placeItems:"center"}}>⚽</span>;
  return <img src={team.logo} alt={team.name||""} onError={()=>setBad(true)}
    style={{width:size,height:size,maxWidth:"100%",objectFit:"contain",display:"block"}} />;
}
function LeagueLogo({league,size=22}) {
  const [bad,setBad]=useState(false);
  useEffect(()=>setBad(false),[league?.logo]);
  if(!league?.logo||bad) return <Trophy size={size}/>;
  return <img src={league.logo} alt="" onError={()=>setBad(true)} style={{width:size,height:size,objectFit:"contain"}}/>;
}
function GoalAlert({goal}) {
  if(!goal) return null;
  return <div style={{position:"fixed",zIndex:9999,top:90,left:"50%",transform:"translateX(-50%)",width:"min(520px,calc(100% - 24px))",padding:16,borderRadius:18,background:"#6fea82",color:"#07110c",textAlign:"center",fontWeight:900}}>
    <div style={{fontSize:21}}>⚽ GOOOOOOOOOOL!</div>
    <div>GOL DO {String(goal.team||"TIME").toUpperCase()}</div>
    <small>{goal.home} x {goal.away}</small>
  </div>;
}
function MatchRow({m,favorite,onFavorite,onOpen}) {
  return <div className="matchRow" onClick={()=>onOpen(m)}>
    <div className={`matchState ${isLive(m)?"live":isFinished(m)?"finished":"scheduled"}`}>{label(m)}</div>
    <div className="matchTeams">
      <div className="teamLine"><TeamLogo team={m?.teams?.home}/><span>{m?.teams?.home?.name||"Mandante"}</span><b>{n(m?.goals?.home)}</b></div>
      <div className="teamLine"><TeamLogo team={m?.teams?.away}/><span>{m?.teams?.away?.name||"Visitante"}</span><b>{n(m?.goals?.away)}</b></div>
    </div>
    <button className={favorite?"favoriteButton selected":"favoriteButton"} onClick={e=>{e.stopPropagation();onFavorite(m?.fixture?.id)}}>
      <Star size={20} fill={favorite?"currentColor":"none"}/>
    </button>
  </div>;
}
function Competition({g,open,toggle,favorites,onFavorite,onOpen}) {
  const lc=g.matches.filter(isLive).length;
  return <section className="competitionCard">
    <button className="competitionHeader" onClick={toggle}>
      <div className="competitionIdentity"><div className="competitionLogo"><LeagueLogo league={g.league}/></div>
        <div><span className="countryLabel">{g.league?.country||"Internacional"}</span><strong>{g.league?.name||"Campeonato"}</strong></div>
      </div>
      <div className="competitionMeta">{lc>0&&<span className="liveCount">{lc} AO VIVO</span>}<span className="gameCount">{g.matches.length}</span><ChevronRight size={17} className={open?"rotate":""}/></div>
    </button>
    {open&&<div className="competitionMatches">{g.matches.map(m=><MatchRow key={m?.fixture?.id} m={m} favorite={favorites.has(String(m?.fixture?.id))} onFavorite={onFavorite} onOpen={onOpen}/>)}</div>}
  </section>;
}
function Detail({match,loading,standings,standingsLoading,onBack}) {
  const [tab,setTab]=useState("summary");
  if(loading) return <div className="app"><header className="detailHeader"><button className="roundButton" onClick={onBack}><ChevronLeft/></button><strong>Partida</strong><span/></header><main className="content"><div className="emptyState">Carregando...</div></main></div>;
  if(!match) return <div className="app"><header className="detailHeader"><button className="roundButton" onClick={onBack}><ChevronLeft/></button><strong>Partida</strong><span/></header><main className="content"><div className="emptyState">Partida indisponível</div></main></div>;
  const events=Array.isArray(match.events)?match.events:Array.isArray(match.incidents)?match.incidents:[];
  const table=standingsRows(standings).map(row);
  return <div className="app">
    <header className="detailHeader"><button className="roundButton" onClick={onBack}><ChevronLeft/></button><strong>{match?.league?.name||"Partida"}</strong><span/></header>
    <main className="content">
      <section className="competitionCard" style={{padding:"24px 10px",marginBottom:12}}>
        <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 86px minmax(0,1fr)",gap:5,textAlign:"center"}}>
          {[["home","Mandante"],["score",""],["away","Visitante"]].map(([side,fallback])=>{
            if(side==="score") return <div key="score" style={{display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center"}}><b style={{fontSize:32}}>{n(match?.goals?.home)} : {n(match?.goals?.away)}</b><small style={{marginTop:10,color:isLive(match)?"#6fea82":"#75867c"}}>{label(match)}</small></div>;
            const team=match?.teams?.[side];
            return <div key={side} style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:0}}>
              <div style={{height:92,display:"grid",placeItems:"center"}}><TeamLogo team={team} size={86}/></div>
              <strong style={{marginTop:10,fontSize:14,lineHeight:1.2,overflowWrap:"anywhere"}}>{team?.name||fallback}</strong>
            </div>;
          })}
        </div>
      </section>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginBottom:12}}>
        {[["summary","SUMÁRIO"],["lineups","FORMAÇÕES"],["h2h","H2H"],["standings","CLASSIFICAÇÃO"]].map(([k,v])=>
          <button key={k} onClick={()=>setTab(k)} style={{minHeight:42,borderRadius:10,fontSize:9,fontWeight:900,background:tab===k?"#75ea83":"#111c16",color:tab===k?"#07110c":"#829087"}}>{v}</button>)}
      </div>
      {tab==="summary"&&<section className="competitionCard">{events.length?events.map((e,i)=><div key={i} style={{padding:12,borderTop:"1px solid rgba(255,255,255,.04)"}}><b>{e?.time?.elapsed??e?.minute??0}'</b>{" "}{e?.player?.name||e?.team?.name||e?.description||"Evento"}</div>):<div className="emptyState">Nenhum evento detalhado disponível.</div>}</section>}
      {tab==="lineups"&&<div className="emptyState"><strong>FORMAÇÕES</strong><span>Formações não disponíveis nesta partida.</span></div>}
      {tab==="h2h"&&<div className="emptyState"><strong>H2H</strong><span>Confrontos diretos não disponíveis nesta partida.</span></div>}
      {tab==="standings"&&(standingsLoading?<div className="emptyState">Carregando classificação...</div>:table.length?<section className="competitionCard">
        <div style={{display:"grid",gridTemplateColumns:"30px 1fr 34px 38px",padding:12,fontSize:10}}><b>#</b><b>TIME</b><b>J</b><b>PTS</b></div>
        {table.map((r,i)=><div key={`${r.name}-${i}`} style={{display:"grid",gridTemplateColumns:"30px minmax(0,1fr) 34px 38px",alignItems:"center",padding:12,borderTop:"1px solid rgba(255,255,255,.04)"}}>
          <b>{r.pos}</b><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</span><span>{r.played}</span><b>{r.points}</b>
        </div>)}
      </section>:<div className="emptyState"><strong>CLASSIFICAÇÃO</strong><span>Classificação indisponível para este campeonato.</span></div>)}
    </main>
  </div>;
}

function App(){
  const [live,setLive]=useState([]),[today,setToday]=useState([]),[serieD,setSerieD]=useState([]),[leagues,setLeagues]=useState([]);
  const [selectedDate,setSelectedDate]=useState(dateKey(new Date())),[query,setQuery]=useState(""),[expanded,setExpanded]=useState(new Set());
  const [selectedId,setSelectedId]=useState(null),[detail,setDetail]=useState(null),[loadingDetail,setLoadingDetail]=useState(false);
  const [standings,setStandings]=useState(null),[standingsLoading,setStandingsLoading]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [nav,setNav]=useState("today"),[goal,setGoal]=useState(null);
  const [voice,setVoice]=useState(()=>{try{return localStorage.getItem("soccerplay:goalvoice")==="1"}catch{return false}});
  const [favorites,setFavorites]=useState(()=>{try{return new Set(JSON.parse(localStorage.getItem("soccerplay:favs")||"[]").map(String))}catch{return new Set()}});
  const previous=useRef(new Map()),first=useRef(true),voiceRef=useRef(voice),timer=useRef(null);
  useEffect(()=>{voiceRef.current=voice},[voice]);
  const dayList=useMemo(days,[]);

  async function speak(text){
    try {
      await TextToSpeech.speak({
        text,
        lang: "pt-BR",
        rate: 0.8,
        pitch: 1.05,
        volume: 1.0,
        category: "ambient"
      });
      return;
    } catch (e) {
      if ("speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "pt-BR";
        u.rate = 0.8;
        u.pitch = 1.05;
        u.volume = 1;
        window.speechSynthesis.speak(u);
      }
    }
  }
  async function activateVoice(){
    setVoice(true);
    voiceRef.current=true;
    try{localStorage.setItem("soccerplay:goalvoice","1")}catch{}
    await speak("Notificações de gol ativadas");
  }
  function announce(team,m){
    const g={team:team||"time",home:n(m?.goals?.home),away:n(m?.goals?.away)};
    setGoal(g);clearTimeout(timer.current);timer.current=setTimeout(()=>setGoal(null),6500);
    if(voiceRef.current) speak(`GOOOOOOOOOOOL DO ${String(g.team).toUpperCase()}!`);
    navigator.vibrate?.([250,120,250,120,500]);
  }
  function detect(a){
    const next=new Map();
    for(const m of a){
      const id=String(m?.fixture?.id||""); if(!id)continue;
      const now={home:n(m?.goals?.home),away:n(m?.goals?.away)};next.set(id,now);
      if(!first.current){
        const p=previous.current.get(id);
        if(p&&now.home>p.home) announce(m?.teams?.home?.name,m);
        if(p&&now.away>p.away) announce(m?.teams?.away?.name,m);
      }
    }
    previous.current=next;first.current=false;
  }
  async function load(){
    try{
      setError("");
      const r=await Promise.allSettled([getJSON("/live"),getJSON("/today"),getJSON("/serie-d"),getJSON("/leagues")]);
      const l=r[0].status==="fulfilled"?(r[0].value?.response||[]):[];
      setLive(l);detect(l);
      setToday(r[1].status==="fulfilled"?(r[1].value?.response||[]):[]);
      setSerieD(r[2].status==="fulfilled"?(r[2].value?.response||[]):[]);
      setLeagues(r[3].status==="fulfilled"?(r[3].value?.response||[]):[]);
      const bad=r.find(x=>x.status==="rejected");if(bad)setError(bad.reason?.message||"Parte dos dados não carregou.");
    }catch(e){setError(e.message)}finally{setLoading(false)}
  }
  useEffect(()=>{load();const i=setInterval(load,15000);return()=>{clearInterval(i);clearTimeout(timer.current)}},[]);
  useEffect(()=>{try{localStorage.setItem("soccerplay:favs",JSON.stringify([...favorites]))}catch{}},[favorites]);

  function fav(id){if(id==null)return;setFavorites(cur=>{const x=new Set(cur),k=String(id);x.has(k)?x.delete(k):x.add(k);return x})}
  async function openMatch(m){
    const id=m?.fixture?.id;if(!id)return;
    setSelectedId(id);setDetail(m);setLoadingDetail(true);setStandings(null);
    try{if(!String(id).startsWith("serie-d-")){const d=await getJSON(`/fixture/${encodeURIComponent(id)}`);if(d?.response)setDetail(d.response)}}catch{}finally{setLoadingDetail(false)}
    const lid=m?.league?.id;if(!lid)return;
    setStandingsLoading(true);
    try{setStandings(await getJSON(String(id).startsWith("serie-d-")?"/standings/serie-d":`/standings/${encodeURIComponent(lid)}`))}catch{setStandings(null)}finally{setStandingsLoading(false)}
  }
  const all=useMemo(()=>dedupe([...live,...today,...serieD]),[live,today,serieD]);
  const selected=useMemo(()=>{
    let a=all;
    if(nav==="live")a=a.filter(isLive);
    else if(nav==="finished")a=a.filter(isFinished);
    else if(nav==="favorites")a=a.filter(m=>favorites.has(String(m?.fixture?.id)));
    else if(nav==="today")a=a.filter(m=>dateKey(m?.fixture?.date)===selectedDate);
    const q=query.trim().toLowerCase();
    if(q)a=a.filter(m=>[m?.teams?.home?.name,m?.teams?.away?.name,m?.league?.name,m?.league?.country].filter(Boolean).join(" ").toLowerCase().includes(q));
    return a;
  },[all,nav,selectedDate,query,favorites]);
  const gs=useMemo(()=>groups(selected),[selected]);
  useEffect(()=>{if(gs.length)setExpanded(cur=>cur.size?cur:new Set(gs.map(g=>g.key)))},[gs]);

  if(selectedId)return <Detail match={detail} loading={loadingDetail} standings={standings} standingsLoading={standingsLoading} onBack={()=>{setSelectedId(null);setDetail(null);setStandings(null)}}/>;

  return <div className="app">
    <GoalAlert goal={goal}/>
    <header className="mainHeader"><div className="brand"><img className="brandIcon" src="/icon.png" alt="SoccerPlay"/><div><strong>SOCCERPLAY</strong><span>Futebol ao vivo</span></div></div><button className="roundButton" onClick={load}><RefreshCw size={19}/></button></header>
    <main className="content homeContent">
      <button onClick={voice?()=>{setVoice(false);voiceRef.current=false;try{localStorage.setItem("soccerplay:goalvoice","0")}catch{}}:activateVoice}
        style={{width:"100%",minHeight:44,borderRadius:12,marginBottom:10,fontWeight:900,background:voice?"#183820":"#6fea82",color:voice?"#76ef8a":"#07110c"}}>
        {voice?<><Volume2 size={17}/> VOZ DE GOL ATIVADA</>:<><VolumeX size={17}/> ATIVAR VOZ DE GOL</>}
      </button>
      <div className="searchBox"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar time ou campeonato"/>{query&&<button onClick={()=>setQuery("")}><X size={17}/></button>}</div>
      {nav!=="leagues"&&<>
        <div className="daysStrip">{dayList.map(d=><button key={d.key} className={selectedDate===d.key?"day active":"day"} onClick={()=>{setSelectedDate(d.key);setNav("today")}}><span>{d.day}</span><b>{d.number}</b></button>)}</div>
        <div className="summaryBar"><div><span>TODOS OS JOGOS</span><strong>{selected.length} partidas</strong></div><div className="summaryLive"><i/><span>{live.length} AO VIVO</span></div></div>
      </>}
      {error&&<div className="errorBox">{error}</div>}
      {loading?<div className="emptyState"><RefreshCw/><strong>Carregando jogos...</strong></div>:
       nav==="leagues"?<div className="competitionsList">{leagues.length?leagues.map(l=><section className="competitionCard" key={l.id||l.name}><div style={{padding:14,display:"flex",gap:10,alignItems:"center"}}><LeagueLogo league={l}/><strong>{l.name||"Campeonato"}</strong><small>{l.country||""}</small></div></section>):<div className="emptyState">Nenhuma liga encontrada</div>}</div>:
       !gs.length?<div className="emptyState"><Trophy/><strong>Nenhuma partida encontrada</strong></div>:
       <div className="competitionsList"><div className="listTitle"><div><ListFilter size={15}/><span>CAMPEONATOS</span></div><small>{gs.length}</small></div>
       {gs.map(g=><Competition key={g.key} g={g} open={expanded.has(g.key)} toggle={()=>setExpanded(cur=>{const x=new Set(cur);x.has(g.key)?x.delete(g.key):x.add(g.key);return x})} favorites={favorites} onFavorite={fav} onOpen={openMatch}/>)}</div>}
    </main>
    <nav className="bottomNav">
      {[["today","Hoje",CalendarDays],["live","Ao Vivo",CircleDot],["favorites","Favoritos",Heart],["finished","Encerrados",Clock3],["leagues","Ligas",Trophy]].map(([k,t,I])=>
        <button key={k} className={nav===k?"navButton active":"navButton"} onClick={()=>setNav(k)}><span className="navIcon"><I/></span><span>{t}</span></button>)}
    </nav>
  </div>;
}

createRoot(document.getElementById("root")).render(<React.StrictMode><App/></React.StrictMode>);
