import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Heart,
  Home,
  ListFilter,
  RefreshCw,
  Search,
  Star,
  Trophy,
  X,
} from "lucide-react";
import "./styles.css";

const API = import.meta.env.VITE_API_BASE || "http://localhost:3001/api";
const LIVE_STATUSES = new Set(["LIVE", "1H", "HT", "2H", "ET", "BT", "P"]);
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);

async function getJSON(path) {
  const response = await fetch(`${API}${path}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || "Erro ao consultar o servidor");
  }

  return data;
}

function isLiveMatch(match) {
  return LIVE_STATUSES.has(match?.fixture?.status?.short);
}

function isFinishedMatch(match) {
  return FINISHED_STATUSES.has(match?.fixture?.status?.short);
}

function formatTime(date) {
  if (!date) return "";

  try {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(date));
  } catch {
    return "";
  }
}

function localDateKey(date) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(date));
  } catch {
    return "";
  }
}

function statusLabel(match) {
  const status = match?.fixture?.status?.short;
  const elapsed = match?.fixture?.status?.elapsed;

  if (isLiveMatch(match)) {
    return elapsed ? `AO VIVO ${elapsed}'` : "AO VIVO";
  }

  if (isFinishedMatch(match)) return "ENCERRADO";
  if (status === "PST") return "ADIADO";
  if (status === "CANC") return "CANCELADO";
  if (status === "SUSP") return "SUSPENSO";

  return formatTime(match?.fixture?.date) || "A DEFINIR";
}

function makeDays() {
  const today = new Date();

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index - 3);

    return {
      key: localDateKey(date),
      weekday: new Intl.DateTimeFormat("pt-BR", {
        weekday: "short",
        timeZone: "America/Sao_Paulo",
      })
        .format(date)
        .replace(".", "")
        .toUpperCase(),
      day: new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        timeZone: "America/Sao_Paulo",
      }).format(date),
      today: index === 3,
    };
  });
}

function dedupeMatches(matches) {
  const map = new Map();

  matches.forEach((match) => {
    const id = match?.fixture?.id;

    if (id !== undefined && id !== null) {
      map.set(String(id), match);
    }
  });

  return [...map.values()];
}

function competitionKey(match) {
  return `${match?.league?.country || "Outros"}::${
    match?.league?.id || match?.league?.name || "Futebol"
  }`;
}

function groupByCompetition(matches) {
  const groups = new Map();

  matches.forEach((match) => {
    const key = competitionKey(match);

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        country: match?.league?.country || "Outros",
        name: match?.league?.name || "Futebol",
        logo: match?.league?.logo || null,
        matches: [],
      });
    }

    groups.get(key).matches.push(match);
  });

  return [...groups.values()].sort((a, b) => {
    const aBrazil =
      a.country === "Brasil" || a.country === "Brazil" ? 0 : 1;

    const bBrazil =
      b.country === "Brasil" || b.country === "Brazil" ? 0 : 1;

    if (aBrazil !== bBrazil) {
      return aBrazil - bBrazil;
    }

    return `${a.country} ${a.name}`.localeCompare(
      `${b.country} ${b.name}`,
      "pt-BR"
    );
  });
}

function MatchRow({
  match,
  favorite,
  onFavorite,
  onOpen,
}) {
  const live = isLiveMatch(match);
  const finished = isFinishedMatch(match);

  const homeScore = match?.goals?.home;
  const awayScore = match?.goals?.away;

  const showScore =
    live ||
    finished ||
    homeScore !== null ||
    awayScore !== null;

  return (
    <div
      className="matchRow"
      onClick={() => onOpen(match.fixture.id)}
    >
      <div
        className={`matchState ${
          live
            ? "live"
            : finished
            ? "finished"
            : "scheduled"
        }`}
      >
        {statusLabel(match)}
      </div>

      <div className="matchTeams">
        <div className="teamLine">
          {match?.teams?.home?.logo ? (
            <img
              src={match.teams.home.logo}
              alt=""
            />
          ) : (
            <span className="teamFallback">
              ⚽
            </span>
          )}

          <span>
            {match?.teams?.home?.name ||
              "Mandante"}
          </span>

          {showScore && (
            <b>{homeScore ?? 0}</b>
          )}
        </div>

        <div className="teamLine">
          {match?.teams?.away?.logo ? (
            <img
              src={match.teams.away.logo}
              alt=""
            />
          ) : (
            <span className="teamFallback">
              ⚽
            </span>
          )}

          <span>
            {match?.teams?.away?.name ||
              "Visitante"}
          </span>

          {showScore && (
            <b>{awayScore ?? 0}</b>
          )}
        </div>
      </div>

      <button
        className={`favoriteButton ${
          favorite ? "selected" : ""
        }`}
        onClick={(event) => {
          event.stopPropagation();
          onFavorite(match);
        }}
        aria-label="Favoritar partida"
      >
        <Star
          size={18}
          fill={
            favorite
              ? "currentColor"
              : "none"
          }
        />
      </button>
    </div>
  );
}

function CompetitionCard({
  group,
  favorites,
  onFavorite,
  onOpen,
  expanded,
  onToggle,
}) {
  const liveCount =
    group.matches.filter(isLiveMatch).length;

  return (
    <section className="competitionCard">
      <button
        className="competitionHeader"
        onClick={onToggle}
      >
        <div className="competitionIdentity">
          <div className="competitionLogo">
            {group.logo ? (
              <img
                src={group.logo}
                alt=""
              />
            ) : (
              <Trophy size={20} />
            )}
          </div>

          <div>
            <span className="countryLabel">
              {group.country}
            </span>

            <strong>
              {group.name}
            </strong>
          </div>
        </div>

        <div className="competitionMeta">
          {liveCount > 0 && (
            <span className="liveCount">
              {liveCount} AO VIVO
            </span>
          )}

          <span className="gameCount">
            {group.matches.length}
          </span>

          <ChevronRight
            className={
              expanded ? "rotate" : ""
            }
            size={18}
          />
        </div>
      </button>

      {expanded && (
        <div className="competitionMatches">
          {group.matches
            .slice()
            .sort(
              (a, b) =>
                new Date(a.fixture.date) -
                new Date(b.fixture.date)
            )
            .map((match) => (
              <MatchRow
                key={match.fixture.id}
                match={match}
                favorite={favorites.includes(
                  String(match.fixture.id)
                )}
                onFavorite={onFavorite}
                onOpen={onOpen}
              />
            ))}
        </div>
      )}
    </section>
  );
}

function Detail({
  match,
  onClose,
}) {
  const events = Array.isArray(
    match?.events
  )
    ? match.events
    : [];

  return (
    <div className="app detailPage">
      <header className="detailHeader">
        <button
          className="roundButton"
          onClick={onClose}
        >
          <ChevronLeft />
        </button>

        <div>
          <span>
            {match?.league?.country ||
              "Futebol"}
          </span>

          <strong>
            {match?.league?.name ||
              "Partida"}
          </strong>
        </div>

        <div className="headerSpacer" />
      </header>

      <main className="content">
        <section className="scoreCard">
          <div className="detailTeam">
            {match?.teams?.home?.logo && (
              <img
                src={
                  match.teams.home.logo
                }
                alt=""
              />
            )}

            <b>
              {match?.teams?.home?.name}
            </b>
          </div>

          <div className="detailScore">
            <span
              className={
                isLiveMatch(match)
                  ? "liveBadge"
                  : "statusBadge"
              }
            >
              {statusLabel(match)}
            </span>

            <strong>
              {match?.goals?.home ?? 0}
              <small> x </small>
              {match?.goals?.away ?? 0}
            </strong>
          </div>

          <div className="detailTeam">
            {match?.teams?.away?.logo && (
              <img
                src={
                  match.teams.away.logo
                }
                alt=""
              />
            )}

            <b>
              {match?.teams?.away?.name}
            </b>
          </div>
        </section>

        <section className="detailPanel">
          <h2>
            Lances da partida
          </h2>

          {events.length === 0 ? (
            <p className="muted">
              A fonte não disponibilizou
              eventos detalhados para esta
              partida.
            </p>
          ) : (
            events.map(
              (event, index) => (
                <div
                  className="eventItem"
                  key={`${
                    event?.time
                      ?.elapsed || 0
                  }-${index}`}
                >
                  <b>
                    {event?.time
                      ?.elapsed
                      ? `${event.time.elapsed}'`
                      : "–"}
                  </b>

                  <span>
                    {event?.type ===
                    "Goal"
                      ? "⚽"
                      : event?.type ===
                        "Card"
                      ? "🟨"
                      : "🔄"}
                  </span>

                  <div>
                    <strong>
                      {event?.team
                        ?.name || ""}
                    </strong>

                    <small>
                      {event?.player
                        ?.name ||
                        event?.detail ||
                        ""}
                    </small>
                  </div>
                </div>
              )
            )
          )}
        </section>
      </main>
    </div>
  );
}

function App() {
  const days = useMemo(
    makeDays,
    []
  );

  const [tab, setTab] =
    useState("today");

  const [live, setLive] =
    useState([]);

  const [today, setToday] =
    useState([]);

  const [serieD, setSerieD] =
    useState([]);

  const [
    selectedDate,
    setSelectedDate,
  ] = useState(
    days[3]?.key || ""
  );

  const [query, setQuery] =
    useState("");

  const [
    expanded,
    setExpanded,
  ] = useState({});

  const [
    selectedId,
    setSelectedId,
  ] = useState(null);

  const [detail, setDetail] =
    useState(null);

  const [
    loadingDetail,
    setLoadingDetail,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [error, setError] =
    useState("");

  const [
    favorites,
    setFavorites,
  ] = useState(() => {
    try {
      return JSON.parse(
        localStorage.getItem(
          "soccerplay:favs"
        ) || "[]"
      ).map(String);
    } catch {
      return [];
    }
  });

  async function load() {
    setLoading(true);
    setError("");

    try {
      const [
        liveData,
        todayData,
        serieDData,
      ] = await Promise.all([
        getJSON("/live"),
        getJSON("/today"),
        getJSON("/serie-d").catch(
          () => ({
            response: [],
          })
        ),
      ]);

      setLive(
        Array.isArray(
          liveData?.response
        )
          ? liveData.response
          : []
      );

      setToday(
        Array.isArray(
          todayData?.response
        )
          ? todayData.response
          : []
      );

      setSerieD(
        Array.isArray(
          serieDData?.response
        )
          ? serieDData.response
          : []
      );
    } catch (err) {
      setError(
        err.message ||
          "Não foi possível carregar os jogos."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();

    const timer = setInterval(
      load,
      15000
    );

    return () =>
      clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedId) return;

    setLoadingDetail(true);
    setDetail(null);

    getJSON(
      `/fixture/${selectedId}`
    )
      .then((data) => {
        const response =
          data?.response;

        setDetail(
          Array.isArray(response)
            ? response[0] || null
            : response || null
        );
      })
      .catch((err) =>
        setError(
          err.message ||
            "Não foi possível abrir a partida."
        )
      )
      .finally(() =>
        setLoadingDetail(false)
      );
  }, [selectedId]);

  const allMatches = useMemo(
    () =>
      dedupeMatches([
        ...live,
        ...today,
        ...serieD,
      ]),
    [live, today, serieD]
  );

  const liveMatches = useMemo(
    () =>
      allMatches.filter(
        isLiveMatch
      ),
    [allMatches]
  );

  const finishedMatches =
    useMemo(
      () =>
        allMatches.filter(
          isFinishedMatch
        ),
      [allMatches]
    );

  const visibleMatches =
    useMemo(() => {
      let result = allMatches;

      if (tab === "live") {
        result = liveMatches;
      }

      if (tab === "finished") {
        result = finishedMatches;
      }

      if (tab === "favorites") {
        result =
          allMatches.filter(
            (match) =>
              favorites.includes(
                String(
                  match.fixture.id
                )
              )
          );
      }

      if (tab === "today") {
        result =
          allMatches.filter(
            (match) =>
              localDateKey(
                match?.fixture?.date
              ) === selectedDate
          );
      }

      if (query.trim()) {
        const text = query
          .toLowerCase()
          .trim();

        result =
          result.filter(
            (match) =>
              `${
                match?.teams?.home
                  ?.name || ""
              } ${
                match?.teams?.away
                  ?.name || ""
              } ${
                match?.league
                  ?.name || ""
              } ${
                match?.league
                  ?.country || ""
              }`
                .toLowerCase()
                .includes(text)
          );
      }

      return result;
    }, [
      allMatches,
      liveMatches,
      finishedMatches,
      favorites,
      tab,
      selectedDate,
      query,
    ]);

  const groups = useMemo(
    () =>
      groupByCompetition(
        visibleMatches
      ),
    [visibleMatches]
  );

  function toggleFavorite(
    match
  ) {
    const id = String(
      match.fixture.id
    );

    const next =
      favorites.includes(id)
        ? favorites.filter(
            (item) =>
              item !== id
          )
        : [...favorites, id];

    setFavorites(next);

    localStorage.setItem(
      "soccerplay:favs",
      JSON.stringify(next)
    );
  }

  function toggleGroup(key) {
    setExpanded((old) => ({
      ...old,
      [key]:
        old[key] === false
          ? true
          : !old[key],
    }));
  }

  if (detail) {
    return (
      <Detail
        match={detail}
        onClose={() => {
          setDetail(null);
          setSelectedId(null);
        }}
      />
    );
  }

  return (
    <div className="app">
      <header className="mainHeader">
        <div className="brand">
          <img
            className="brandIcon"
            src="/icon.png"
            alt="SoccerPlay"
            onError={(event) => {
              event.currentTarget.style.display =
                "none";
            }}
          />

          <div>
            <strong>
              SOCCERPLAY
            </strong>

            <span>
              Futebol ao vivo
            </span>
          </div>
        </div>

        <button
          className="roundButton"
          onClick={load}
          aria-label="Atualizar"
        >
          <RefreshCw
            className={
              loading ? "spin" : ""
            }
          />
        </button>
      </header>

      <main className="content homeContent">
        <div className="searchBox">
          <Search size={19} />

          <input
            value={query}
            onChange={(event) =>
              setQuery(
                event.target.value
              )
            }
            placeholder="Buscar time ou competição"
          />

          {query && (
            <button
              onClick={() =>
                setQuery("")
              }
            >
              <X size={17} />
            </button>
          )}
        </div>

        {tab === "today" && (
          <div className="daysStrip">
            {days.map((day) => (
              <button
                key={day.key}
                className={
                  selectedDate ===
                  day.key
                    ? "day active"
                    : "day"
                }
                onClick={() =>
                  setSelectedDate(
                    day.key
                  )
                }
              >
                <span>
                  {day.today
                    ? "HOJE"
                    : day.weekday}
                </span>

                <b>
                  {day.day}
                </b>
              </button>
            ))}
          </div>
        )}

        <section className="summaryBar">
          <div>
            <span>
              {tab === "live"
                ? "PARTIDAS AO VIVO"
                : tab ===
                  "favorites"
                ? "MEUS FAVORITOS"
                : tab ===
                  "leagues"
                ? "COMPETIÇÕES"
                : tab ===
                  "finished"
                ? "JOGOS ENCERRADOS"
                : "TODOS OS JOGOS"}
            </span>

            <strong>
              {visibleMatches.length}{" "}
              {visibleMatches.length ===
              1
                ? "jogo"
                : "jogos"}
            </strong>
          </div>

          <div className="summaryLive">
            <i />

            <span>
              {liveMatches.length} ao
              vivo
            </span>
          </div>
        </section>

        {error && (
          <div className="errorBox">
            {error}
          </div>
        )}

        {loading &&
          allMatches.length === 0 && (
            <div className="emptyState">
              Carregando partidas
              reais...
            </div>
          )}

        {!loading &&
          groups.length === 0 && (
            <div className="emptyState">
              <Trophy size={28} />

              <strong>
                Nenhum jogo
                encontrado
              </strong>

              <span>
                {tab === "favorites"
                  ? "Favorite uma partida para vê-la aqui."
                  : "Não há partidas disponíveis para este filtro."}
              </span>
            </div>
          )}

        {groups.length > 0 && (
          <section className="competitionsList">
            <div className="listTitle">
              <div>
                <ListFilter
                  size={17}
                />

                <span>
                  COMPETIÇÕES
                </span>
              </div>

              <small>
                {groups.length}
              </small>
            </div>

            {groups.map(
              (group) => (
                <CompetitionCard
                  key={group.key}
                  group={group}
                  favorites={
                    favorites
                  }
                  onFavorite={
                    toggleFavorite
                  }
                  onOpen={
                    setSelectedId
                  }
                  expanded={
                    expanded[
                      group.key
                    ] !== false
                  }
                  onToggle={() =>
                    toggleGroup(
                      group.key
                    )
                  }
                />
              )
            )}
          </section>
        )}

        {loadingDetail && (
          <div className="detailLoading">
            Abrindo partida...
          </div>
        )}
      </main>

      <nav className="bottomNav">
        <NavButton
          active={tab === "today"}
          icon={<Home />}
          text="Hoje"
          onClick={() =>
            setTab("today")
          }
        />

        <NavButton
          active={tab === "live"}
          icon={
            <span className="navLiveDot" />
          }
          text="Ao Vivo"
          onClick={() =>
            setTab("live")
          }
          badge={
            liveMatches.length
          }
        />

        <NavButton
          active={
            tab === "favorites"
          }
          icon={<Heart />}
          text="Favoritos"
          onClick={() =>
            setTab("favorites")
          }
        />

        <NavButton
          active={
            tab === "finished"
          }
          icon={
            <CalendarDays />
          }
          text="Encerrados"
          onClick={() =>
            setTab("finished")
          }
        />

        <NavButton
          active={
            tab === "leagues"
          }
          icon={<Trophy />}
          text="Ligas"
          onClick={() =>
            setTab("leagues")
          }
        />
      </nav>
    </div>
  );
}

function NavButton({
  active,
  icon,
  text,
  onClick,
  badge,
}) {
  return (
    <button
      className={
        active
          ? "navButton active"
          : "navButton"
      }
      onClick={onClick}
    >
      <span className="navIcon">
        {icon}

        {badge > 0 && (
          <i>{badge}</i>
        )}
      </span>

      <span>{text}</span>
    </button>
  );
}

createRoot(
  document.getElementById("root")
).render(<App />);
