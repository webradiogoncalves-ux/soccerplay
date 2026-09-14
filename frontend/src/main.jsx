import React, {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { createRoot } from "react-dom/client";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  Heart,
  ListFilter,
  RefreshCw,
  Search,
  Star,
  Trophy,
  X
} from "lucide-react";
import "./styles.css";

const API =
  import.meta.env.VITE_API_BASE ||
  "http://localhost:3001/api";

const LIVE_STATUSES = new Set([
  "LIVE",
  "1H",
  "HT",
  "2H",
  "ET",
  "BT",
  "P"
]);

const FINISHED_STATUSES = new Set([
  "FT",
  "AET",
  "PEN"
]);

async function getJSON(path) {
  const response = await fetch(
    `${API}${path}`,
    {
      cache: "no-store"
    }
  );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error ||
      `Erro ${response.status}`
    );
  }

  return data;
}

function isLiveMatch(match) {
  const status =
    match
      ?.fixture
      ?.status
      ?.short;

  return LIVE_STATUSES.has(
    String(status || "")
      .toUpperCase()
  );
}

function isFinishedMatch(match) {
  const status =
    match
      ?.fixture
      ?.status
      ?.short;

  return FINISHED_STATUSES.has(
    String(status || "")
      .toUpperCase()
  );
}

function scoreNumber(value) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : 0;
}

function localDateKey(date) {
  const d =
    date instanceof Date
      ? date
      : new Date(date);

  const formatter =
    new Intl.DateTimeFormat(
      "en-CA",
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
    );

  return formatter.format(d);
}

function formatTime(dateValue) {
  if (!dateValue) {
    return "--:--";
  }

  const date =
    new Date(dateValue);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "--:--";
  }

  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      timeZone:
        "America/Sao_Paulo",

      hour:
        "2-digit",

      minute:
        "2-digit"
    }
  ).format(date);
}

function statusLabel(match) {
  const status =
    String(
      match
        ?.fixture
        ?.status
        ?.short ||
      ""
    ).toUpperCase();

  const elapsed =
    match
      ?.fixture
      ?.status
      ?.elapsed;

  if (
    LIVE_STATUSES.has(status)
  ) {
    return elapsed
      ? `${elapsed}'`
      : "AO VIVO";
  }

  if (
    FINISHED_STATUSES.has(
      status
    )
  ) {
    return "ENC.";
  }

  return formatTime(
    match?.fixture?.date
  );
}

function makeDays() {
  const result = [];
  const today = new Date();

  for (
    let offset = -3;
    offset <= 3;
    offset += 1
  ) {
    const date =
      new Date(today);

    date.setDate(
      date.getDate() +
        offset
    );

    result.push({
      key:
        localDateKey(date),

      day:
        new Intl.DateTimeFormat(
          "pt-BR",
          {
            weekday:
              "short",

            timeZone:
              "America/Sao_Paulo"
          }
        )
          .format(date)
          .replace(".", "")
          .toUpperCase(),

      number:
        new Intl.DateTimeFormat(
          "pt-BR",
          {
            day:
              "2-digit",

            timeZone:
              "America/Sao_Paulo"
          }
        ).format(date)
    });
  }

  return result;
}

function dedupeMatches(matches) {
  const seen =
    new Set();

  return matches.filter(
    (match) => {
      const id =
        match
          ?.fixture
          ?.id;

      if (!id) {
        return true;
      }

      const key =
        String(id);

      if (
        seen.has(key)
      ) {
        return false;
      }

      seen.add(key);

      return true;
    }
  );
}

function competitionKey(match) {
  const league =
    match?.league || {};

  return [
    league.id ||
      league.name ||
      "sem-liga",

    league.country ||
      "Internacional",

    league.group ||
      ""
  ].join("::");
}

function groupByCompetition(
  matches
) {
  const map =
    new Map();

  for (
    const match
    of matches
  ) {
    const key =
      competitionKey(match);

    if (!map.has(key)) {
      map.set(
        key,
        {
          key,
          league:
            match.league ||
            {},
          matches: []
        }
      );
    }

    map
      .get(key)
      .matches
      .push(match);
  }

  return Array.from(
    map.values()
  ).sort(
    (a, b) => {
      const countryCompare =
        String(
          a.league?.country ||
          ""
        ).localeCompare(
          String(
            b.league?.country ||
            ""
          ),
          "pt-BR"
        );

      if (
        countryCompare !== 0
      ) {
        return countryCompare;
      }

      return String(
        a.league?.name ||
        ""
      ).localeCompare(
        String(
          b.league?.name ||
          ""
        ),
        "pt-BR"
      );
    }
  );
}

function findNamedArray(
  value,
  names,
  visited = new Set()
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    typeof value !==
    "object"
  ) {
    return null;
  }

  if (
    visited.has(value)
  ) {
    return null;
  }

  visited.add(value);

  for (
    const name
    of names
  ) {
    if (
      Array.isArray(
        value[name]
      )
    ) {
      return value[name];
    }
  }

  for (
    const child
    of Object.values(value)
  ) {
    if (
      child &&
      typeof child ===
        "object"
    ) {
      const found =
        findNamedArray(
          child,
          names,
          visited
        );

      if (found) {
        return found;
      }
    }
  }

  return null;
}

function extractStandings(data) {
  if (
    Array.isArray(data)
  ) {
    return data;
  }

  return (
    findNamedArray(
      data,
      [
        "standings",
        "classification",
        "classificacao",
        "table",
        "rows"
      ]
    ) || []
  );
}

function normalizeStandingRow(
  row,
  index
) {
  const team =
    row.team ||
    row.club ||
    row.time ||
    {};

  return {
    position:
      row.position ??
      row.rank ??
      row.pos ??
      index + 1,

    name:
      team.name ??
      team.nome ??
      row.team_name ??
      row.name ??
      "Time",

    logo:
      team.logo ??
      team.image ??
      row.logo ??
      row.team_logo ??
      null,

    points:
      row.points ??
      row.pts ??
      row.pontos ??
      0,

    played:
      row.played ??
      row.matches ??
      row.games ??
      row.jogos ??
      0,

    wins:
      row.wins ??
      row.vitorias ??
      0,

    draws:
      row.draws ??
      row.empates ??
      0,

    losses:
      row.losses ??
      row.derrotas ??
      0
  };
}

function GoalAlert({
  goal
}) {
  if (!goal) {
    return null;
  }

  return (
    <div
      style={{
        position:
          "fixed",

        left:
          "50%",

        top:
          "92px",

        transform:
          "translateX(-50%)",

        zIndex:
          9999,

        width:
          "min(calc(100% - 24px), 520px)",

        padding:
          "16px 18px",

        borderRadius:
          "18px",

        background:
          "linear-gradient(135deg,#84ff6a,#38d96d)",

        color:
          "#06110a",

        boxShadow:
          "0 18px 50px rgba(40,220,90,.35)",

        textAlign:
          "center",

        fontWeight:
          900
      }}
    >
      <div
        style={{
          fontSize:
            "21px"
        }}
      >
        ⚽ GOOOOOOOOOOL!
      </div>

      <div
        style={{
          marginTop:
            "4px",

          fontSize:
            "15px"
        }}
      >
        GOL DO{" "}
        {String(
          goal.team ||
          "TIME"
        ).toUpperCase()}
      </div>

      <div
        style={{
          marginTop:
            "3px",

          fontSize:
            "13px"
        }}
      >
        {goal.home} x{" "}
        {goal.away}
      </div>
    </div>
  );
}

function TeamLogo({
  team
}) {
  const [
    failed,
    setFailed
  ] = useState(false);

  if (
    !team?.logo ||
    failed
  ) {
    return (
      <span className="teamFallback">
        ⚽
      </span>
    );
  }

  return (
    <img
      src={team.logo}
      alt={team.name || ""}
      onError={() =>
        setFailed(true)
      }
    />
  );
}

function CompetitionLogo({
  league
}) {
  const [
    failed,
    setFailed
  ] = useState(false);

  if (
    !league?.logo ||
    failed
  ) {
    return (
      <Trophy
        size={22}
      />
    );
  }

  return (
    <img
      src={league.logo}
      alt={league.name || ""}
      onError={() =>
        setFailed(true)
      }
    />
  );
}

function MatchRow({
  match,
  favorite,
  onFavorite,
  onOpen
}) {
  const live =
    isLiveMatch(match);

  const finished =
    isFinishedMatch(match);

  const statusClass =
    live
      ? "live"
      : finished
        ? "finished"
        : "scheduled";

  return (
    <div
      className="matchRow"
      onClick={() =>
        onOpen(match)
      }
    >
      <div
        className={`matchState ${statusClass}`}
      >
        {statusLabel(match)}
      </div>

      <div className="matchTeams">
        <div className="teamLine">
          <TeamLogo
            team={
              match
                ?.teams
                ?.home
            }
          />

          <span>
            {match
              ?.teams
              ?.home
              ?.name ||
              "Mandante"}
          </span>

          <b>
            {scoreNumber(
              match
                ?.goals
                ?.home
            )}
          </b>
        </div>

        <div className="teamLine">
          <TeamLogo
            team={
              match
                ?.teams
                ?.away
            }
          />

          <span>
            {match
              ?.teams
              ?.away
              ?.name ||
              "Visitante"}
          </span>

          <b>
            {scoreNumber(
              match
                ?.goals
                ?.away
            )}
          </b>
        </div>
      </div>

      <button
        className={
          favorite
            ? "favoriteButton selected"
            : "favoriteButton"
        }
        onClick={(event) => {
          event.stopPropagation();

          onFavorite(
            match
              ?.fixture
              ?.id
          );
        }}
      >
        <Star
          size={20}
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
  expanded,
  onToggle,
  favorites,
  onFavorite,
  onOpen
}) {
  const liveCount =
    group.matches.filter(
      isLiveMatch
    ).length;

  return (
    <section className="competitionCard">
      <button
        className="competitionHeader"
        onClick={onToggle}
      >
        <div className="competitionIdentity">
          <div className="competitionLogo">
            <CompetitionLogo
              league={
                group.league
              }
            />
          </div>

          <div>
            <span className="countryLabel">
              {group
                .league
                ?.country ||
                "Internacional"}
            </span>

            <strong>
              {group
                .league
                ?.name ||
                "Campeonato"}
            </strong>

            {group
              .league
              ?.group && (
              <small
                style={{
                  color:
                    "#6c7d73",
                  marginTop:
                    "2px"
                }}
              >
                {group
                  .league
                  .group}
              </small>
            )}
          </div>
        </div>

        <div className="competitionMeta">
          {liveCount >
            0 && (
            <span className="liveCount">
              {liveCount} AO VIVO
            </span>
          )}

          <span className="gameCount">
            {
              group
                .matches
                .length
            }
          </span>

          <ChevronRight
            size={17}
            className={
              expanded
                ? "rotate"
                : ""
            }
          />
        </div>
      </button>

      {expanded && (
        <div className="competitionMatches">
          {group.matches.map(
            (match) => {
              const id =
                String(
                  match
                    ?.fixture
                    ?.id
                );

              return (
                <MatchRow
                  key={id}
                  match={match}
                  favorite={
                    favorites.has(
                      id
                    )
                  }
                  onFavorite={
                    onFavorite
                  }
                  onOpen={
                    onOpen
                  }
                />
              );
            }
          )}
        </div>
      )}
    </section>
  );
}

function eventIcon(event) {
  const type =
    String(
      event?.type ||
      ""
    ).toLowerCase();

  if (
    type.includes("goal")
  ) {
    return "⚽";
  }

  if (
    type.includes("card")
  ) {
    return "🟨";
  }

  if (
    type.includes("subst")
  ) {
    return "🔄";
  }

  return "•";
}

function Detail({
  match,
  loading,
  standings,
  standingsLoading,
  onBack
}) {
  const [
    tab,
    setTab
  ] = useState(
    "summary"
  );

  if (loading) {
    return (
      <div className="app">
        <header className="detailHeader">
          <button
            className="roundButton"
            onClick={
              onBack
            }
          >
            <ChevronLeft />
          </button>

          <strong>
            Partida
          </strong>

          <span
            style={{
              width:
                42
            }}
          />
        </header>

        <main className="content">
          <div className="emptyState">
            <RefreshCw />
            <strong>
              Carregando partida...
            </strong>
          </div>
        </main>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="app">
        <header className="detailHeader">
          <button
            className="roundButton"
            onClick={
              onBack
            }
          >
            <ChevronLeft />
          </button>

          <strong>
            Partida
          </strong>

          <span
            style={{
              width:
                42
            }}
          />
        </header>

        <main className="content">
          <div className="emptyState">
            <strong>
              Partida indisponível
            </strong>
          </div>
        </main>
      </div>
    );
  }

  const events =
    Array.isArray(
      match.events
    )
      ? match.events
      : [];

  const standingRows =
    extractStandings(
      standings
    ).map(
      normalizeStandingRow
    );

  return (
    <div className="app">
      <header className="detailHeader">
        <button
          className="roundButton"
          onClick={
            onBack
          }
        >
          <ChevronLeft />
        </button>

        <div
          style={{
            display:
              "flex",
            alignItems:
              "center",
            gap:
              "8px",
            minWidth:
              0
          }}
        >
          {match
            ?.league
            ?.logo && (
            <img
              src={
                match
                  .league
                  .logo
              }
              alt=""
              style={{
                width:
                  28,
                height:
                  28,
                objectFit:
                  "contain"
              }}
            />
          )}

          <div
            style={{
              minWidth:
                0
            }}
          >
            <small
              style={{
                display:
                  "block",
                color:
                  "#738178"
              }}
            >
              {match
                ?.league
                ?.country ||
                "Internacional"}
            </small>

            <strong>
              {match
                ?.league
                ?.name ||
                "Campeonato"}
            </strong>
          </div>
        </div>

        <span
          style={{
            width:
              42
          }}
        />
      </header>

      <main className="content">
        <section
          className="competitionCard"
          style={{
            padding:
              "18px 14px",
            marginBottom:
              "12px"
          }}
        >
          <div
            style={{
              display:
                "grid",
              gridTemplateColumns:
                "1fr auto 1fr",
              alignItems:
                "center",
              gap:
                "10px",
              textAlign:
                "center"
            }}
          >
            <div>
              <div
                style={{
                  height:
                    72,
                  display:
                    "grid",
                  placeItems:
                    "center"
                }}
              >
                <TeamLogo
                  team={
                    match
                      ?.teams
                      ?.home
                  }
                />
              </div>

              <strong>
                {match
                  ?.teams
                  ?.home
                  ?.name ||
                  "Mandante"}
              </strong>
            </div>

            <div>
              <div
                style={{
                  fontSize:
                    "32px",
                  fontWeight:
                    900
                }}
              >
                {scoreNumber(
                  match
                    ?.goals
                    ?.home
                )}
                {" : "}
                {scoreNumber(
                  match
                    ?.goals
                    ?.away
                )}
              </div>

              <small
                style={{
                  color:
                    isLiveMatch(
                      match
                    )
                      ? "#6ff083"
                      : "#75867c"
                }}
              >
                {statusLabel(
                  match
                )}
              </small>
            </div>

            <div>
              <div
                style={{
                  height:
                    72,
                  display:
                    "grid",
                  placeItems:
                    "center"
                }}
              >
                <TeamLogo
                  team={
                    match
                      ?.teams
                      ?.away
                  }
                />
              </div>

              <strong>
                {match
                  ?.teams
                  ?.away
                  ?.name ||
                  "Visitante"}
              </strong>
            </div>
          </div>
        </section>

        <div
          style={{
            display:
              "grid",
            gridTemplateColumns:
              "repeat(4,1fr)",
            gap:
              "5px",
            marginBottom:
              "12px"
          }}
        >
          {[
            [
              "summary",
              "SUMÁRIO"
            ],
            [
              "lineups",
              "FORMAÇÕES"
            ],
            [
              "h2h",
              "H2H"
            ],
            [
              "standings",
              "CLASSIFICAÇÃO"
            ]
          ].map(
            ([key, label]) => (
              <button
                key={key}
                onClick={() =>
                  setTab(key)
                }
                style={{
                  minHeight:
                    "42px",
                  padding:
                    "6px 4px",
                  borderRadius:
                    "10px",
                  fontSize:
                    "9px",
                  fontWeight:
                    900,
                  color:
                    tab ===
                    key
                      ? "#07110c"
                      : "#829087",
                  background:
                    tab ===
                    key
                      ? "#75ea83"
                      : "#111c16"
                }}
              >
                {label}
              </button>
            )
          )}
        </div>

        {tab ===
          "summary" && (
          <section className="competitionCard">
            <div
              style={{
                padding:
                  "14px"
              }}
            >
              <strong>
                SUMÁRIO
              </strong>
            </div>

            {events.length >
            0 ? (
              events.map(
                (
                  event,
                  index
                ) => (
                  <div
                    key={
                      index
                    }
                    style={{
                      display:
                        "grid",
                      gridTemplateColumns:
                        "45px 28px 1fr",
                      gap:
                        "8px",
                      alignItems:
                        "center",
                      padding:
                        "11px 14px",
                      borderTop:
                        "1px solid rgba(255,255,255,.04)"
                    }}
                  >
                    <span
                      style={{
                        color:
                          "#7b8a81",
                        fontSize:
                          "12px",
                        fontWeight:
                          800
                      }}
                    >
                      {event
                        ?.time
                        ?.elapsed ??
                        0}
                      '
                    </span>

                    <span>
                      {eventIcon(
                        event
                      )}
                    </span>

                    <div>
                      <strong
                        style={{
                          fontSize:
                            "12px"
                        }}
                      >
                        {event
                          ?.player
                          ?.name ||
                          event
                            ?.team
                            ?.name ||
                          "Evento"}
                      </strong>

                      {event
                        ?.detail && (
                        <small
                          style={{
                            display:
                              "block",
                            marginTop:
                              "2px",
                            color:
                              "#6d7c73"
                          }}
                        >
                          {event.detail}
                        </small>
                      )}
                    </div>
                  </div>
                )
              )
            ) : (
              <div className="emptyState">
                <span>
                  Nenhum evento detalhado disponível para esta partida.
                </span>
              </div>
            )}
          </section>
        )}

        {tab ===
          "lineups" && (
          <div className="emptyState">
            <strong>
              FORMAÇÕES
            </strong>
            <span>
              A BSD não enviou formações para esta partida.
            </span>
          </div>
        )}

        {tab ===
          "h2h" && (
          <div className="emptyState">
            <strong>
              H2H
            </strong>
            <span>
              Confrontos diretos não disponíveis nesta partida.
            </span>
          </div>
        )}

        {tab ===
          "standings" && (
          <>
            {standingsLoading ? (
              <div className="emptyState">
                <RefreshCw />
                <strong>
                  Carregando classificação...
                </strong>
              </div>
            ) : standingRows.length >
              0 ? (
              <section className="competitionCard">
                <div
                  style={{
                    display:
                      "grid",
                    gridTemplateColumns:
                      "28px 1fr 34px 34px",
                    gap:
                      "5px",
                    padding:
                      "11px 12px",
                    color:
                      "#718078",
                    fontSize:
                      "10px",
                    fontWeight:
                      900
                  }}
                >
                  <span>#</span>
                  <span>
                    TIME
                  </span>
                  <span>
                    J
                  </span>
                  <span>
                    PTS
                  </span>
                </div>

                {standingRows.map(
                  (row) => (
                    <div
                      key={`${row.position}-${row.name}`}
                      style={{
                        display:
                          "grid",
                        gridTemplateColumns:
                          "28px 1fr 34px 34px",
                        gap:
                          "5px",
                        alignItems:
                          "center",
                        padding:
                          "11px 12px",
                        borderTop:
                          "1px solid rgba(255,255,255,.04)"
                      }}
                    >
                      <b>
                        {
                          row.position
                        }
                      </b>

                      <div
                        style={{
                          display:
                            "flex",
                          alignItems:
                            "center",
                          gap:
                            "7px",
                          minWidth:
                            0
                        }}
                      >
                        {row.logo && (
                          <img
                            src={
                              row.logo
                            }
                            alt=""
                            style={{
                              width:
                                22,
                              height:
                                22,
                              objectFit:
                                "contain"
                            }}
                          />
                        )}

                        <span
                          style={{
                            overflow:
                              "hidden",
                            textOverflow:
                              "ellipsis",
                            whiteSpace:
                              "nowrap",
                            fontSize:
                              "12px"
                          }}
                        >
                          {
                            row.name
                          }
                        </span>
                      </div>

                      <span>
                        {
                          row.played
                        }
                      </span>

                      <strong>
                        {
                          row.points
                        }
                      </strong>
                    </div>
                  )
                )}
              </section>
            ) : (
              <div className="emptyState">
                <strong>
                  CLASSIFICAÇÃO
                </strong>

                <span>
                  Classificação indisponível para este campeonato.
                </span>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function App() {
  const [
    live,
    setLive
  ] = useState([]);

  const [
    today,
    setToday
  ] = useState([]);

  const [
    serieD,
    setSerieD
  ] = useState([]);

  const [
    selectedDate,
    setSelectedDate
  ] = useState(
    localDateKey(
      new Date()
    )
  );

  const [
    query,
    setQuery
  ] = useState("");

  const [
    expanded,
    setExpanded
  ] = useState(
    new Set()
  );

  const [
    selectedId,
    setSelectedId
  ] = useState(null);

  const [
    detail,
    setDetail
  ] = useState(null);

  const [
    loadingDetail,
    setLoadingDetail
  ] = useState(false);

  const [
    standings,
    setStandings
  ] = useState(null);

  const [
    standingsLoading,
    setStandingsLoading
  ] = useState(false);

  const [
    loading,
    setLoading
  ] = useState(true);

  const [
    error,
    setError
  ] = useState("");

  const [
    activeNav,
    setActiveNav
  ] = useState("today");

  const [
    goalAlert,
    setGoalAlert
  ] = useState(null);

  const [
    favorites,
    setFavorites
  ] = useState(() => {
    try {
      const saved =
        JSON.parse(
          localStorage.getItem(
            "soccerplay:favs"
          ) || "[]"
        );

      return new Set(
        saved.map(String)
      );
    } catch {
      return new Set();
    }
  });

  const previousScoresRef =
    useRef(
      new Map()
    );

  const firstLiveLoadRef =
    useRef(true);

  const goalTimerRef =
    useRef(null);

  const days =
    useMemo(
      makeDays,
      []
    );

  function announceGoal(
    teamName,
    match
  ) {
    const team =
      teamName ||
      "time";

    const home =
      scoreNumber(
        match
          ?.goals
          ?.home
      );

    const away =
      scoreNumber(
        match
          ?.goals
          ?.away
      );

    setGoalAlert({
      team,
      home,
      away
    });

    if (
      goalTimerRef.current
    ) {
      clearTimeout(
        goalTimerRef.current
      );
    }

    goalTimerRef.current =
      setTimeout(
        () =>
          setGoalAlert(
            null
          ),
        6500
      );

    if (
      "speechSynthesis"
      in window
    ) {
      const phrase =
        `GOOOOOOOOOOOL DO ${String(
          team
        ).toUpperCase()}!`;

      const utterance =
        new SpeechSynthesisUtterance(
          phrase
        );

      utterance.lang =
        "pt-BR";

      utterance.rate =
        0.78;

      utterance.pitch =
        1.1;

      utterance.volume =
        1;

      window
        .speechSynthesis
        .speak(
          utterance
        );
    }

    if (
      navigator.vibrate
    ) {
      navigator.vibrate([
        250,
        120,
        250,
        120,
        500
      ]);
    }
  }

  function detectGoals(
    liveMatches
  ) {
    const nextScores =
      new Map();

    for (
      const match
      of liveMatches
    ) {
      const id =
        String(
          match
            ?.fixture
            ?.id ||
          ""
        );

      if (!id) {
        continue;
      }

      const home =
        scoreNumber(
          match
            ?.goals
            ?.home
        );

      const away =
        scoreNumber(
          match
            ?.goals
            ?.away
        );

      nextScores.set(
        id,
        {
          home,
          away
        }
      );

      if (
        firstLiveLoadRef.current
      ) {
        continue;
      }

      const previous =
        previousScoresRef
          .current
          .get(id);

      if (!previous) {
        continue;
      }

      if (
        home >
        previous.home
      ) {
        announceGoal(
          match
            ?.teams
            ?.home
            ?.name,
          match
        );
      }

      if (
        away >
        previous.away
      ) {
        announceGoal(
          match
            ?.teams
            ?.away
            ?.name,
          match
        );
      }
    }

    previousScoresRef.current =
      nextScores;

    firstLiveLoadRef.current =
      false;
  }

  async function load() {
    try {
      setError("");

      const results =
        await Promise.allSettled([
          getJSON("/live"),
          getJSON("/today"),
          getJSON(
            "/serie-d"
          )
        ]);

      const newLive =
        results[0].status ===
        "fulfilled"
          ? results[0]
              .value
              ?.response ||
            []
          : [];

      const newToday =
        results[1].status ===
        "fulfilled"
          ? results[1]
              .value
              ?.response ||
            []
          : [];

      const newSerieD =
        results[2].status ===
        "fulfilled"
          ? results[2]
              .value
              ?.response ||
            []
          : [];

      detectGoals(
        newLive
      );

      setLive(
        newLive
      );

      setToday(
        newToday
      );

      setSerieD(
        newSerieD
      );

      const failed =
        results.find(
          (result) =>
            result.status ===
            "rejected"
        );

      if (failed) {
        setError(
          failed.reason
            ?.message ||
          "Parte dos dados não pôde ser carregada."
        );
      }
    } catch (err) {
      setError(
        err.message
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();

    const timer =
      setInterval(
        load,
        15000
      );

    return () => {
      clearInterval(
        timer
      );

      if (
        goalTimerRef.current
      ) {
        clearTimeout(
          goalTimerRef.current
        );
      }
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        "soccerplay:favs",
        JSON.stringify(
          Array.from(
            favorites
          )
        )
      );
    } catch {
      //
    }
  }, [favorites]);

  async function openMatch(
    match
  ) {
    const id =
      match
        ?.fixture
        ?.id;

    if (!id) {
      return;
    }

    setSelectedId(
      id
    );

    setDetail(
      match
    );

    setLoadingDetail(
      true
    );

    setStandings(
      null
    );

    try {
      if (
        String(id)
          .startsWith(
            "serie-d-"
          )
      ) {
        setDetail(
          match
        );
      } else {
        const data =
          await getJSON(
            `/fixture/${encodeURIComponent(
              id
            )}`
          );

        if (
          data?.response
        ) {
          setDetail(
            data.response
          );
        }
      }
    } catch {
      setDetail(
        match
      );
    } finally {
      setLoadingDetail(
        false
      );
    }

    const leagueId =
      match
        ?.league
        ?.id;

    if (!leagueId) {
      return;
    }

    setStandingsLoading(
      true
    );

    try {
      const path =
        String(id)
          .startsWith(
            "serie-d-"
          )
          ? "/standings/serie-d"
          : `/standings/${encodeURIComponent(
              leagueId
            )}`;

      const table =
        await getJSON(path);

      setStandings(
        table?.response ??
        table
      );
    } catch {
      setStandings(
        null
      );
    } finally {
      setStandingsLoading(
        false
      );
    }
  }

  function toggleFavorite(
    id
  ) {
    if (
      id === null ||
      id === undefined
    ) {
      return;
    }

    const key =
      String(id);

    setFavorites(
      (current) => {
        const next =
          new Set(
            current
          );

        if (
          next.has(key)
        ) {
          next.delete(
            key
          );
        } else {
          next.add(
            key
          );
        }

        return next;
      }
    );
  }

  const allMatches =
    useMemo(() => {
      return dedupeMatches([
        ...live,
        ...today,
        ...serieD
      ]);
    }, [
      live,
      today,
      serieD
    ]);

  const selectedMatches =
    useMemo(() => {
      let source =
        allMatches;

      if (
        activeNav ===
        "live"
      ) {
        source =
          allMatches.filter(
            isLiveMatch
          );
      }

      if (
        activeNav ===
        "finished"
      ) {
        source =
          allMatches.filter(
            isFinishedMatch
          );
      }

      if (
        activeNav ===
        "favorites"
      ) {
        source =
          allMatches.filter(
            (match) =>
              favorites.has(
                String(
                  match
                    ?.fixture
                    ?.id
                )
              )
          );
      }

      if (
        activeNav ===
        "today"
      ) {
        source =
          allMatches.filter(
            (match) => {
              const date =
                match
                  ?.fixture
                  ?.date;

              if (!date) {
                return false;
              }

              return (
                localDateKey(
                  date
                ) ===
                selectedDate
              );
            }
          );
      }

      const normalizedQuery =
        query
          .trim()
          .toLowerCase();

      if (
        normalizedQuery
      ) {
        source =
          source.filter(
            (match) => {
              const text = [
                match
                  ?.teams
                  ?.home
                  ?.name,
                match
                  ?.teams
                  ?.away
                  ?.name,
                match
                  ?.league
                  ?.name,
                match
                  ?.league
                  ?.country
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

              return text.includes(
                normalizedQuery
              );
            }
          );
      }

      return source;
    }, [
      allMatches,
      activeNav,
      selectedDate,
      query,
      favorites
    ]);

  const groups =
    useMemo(
      () =>
        groupByCompetition(
          selectedMatches
        ),
      [
        selectedMatches
      ]
    );

  useEffect(() => {
    if (
      groups.length ===
      0
    ) {
      return;
    }

    setExpanded(
      (current) => {
        if (
          current.size >
          0
        ) {
          return current;
        }

        return new Set(
          groups.map(
            (group) =>
              group.key
          )
        );
      }
    );
  }, [
    groups
  ]);

  if (
    selectedId
  ) {
    return (
      <Detail
        match={detail}
        loading={
          loadingDetail
        }
        standings={
          standings
        }
        standingsLoading={
          standingsLoading
        }
        onBack={() => {
          setSelectedId(
            null
          );
          setDetail(
            null
          );
          setStandings(
            null
          );
        }}
      />
    );
  }

  return (
    <div className="app">
      <GoalAlert
        goal={
          goalAlert
        }
      />

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
            size={19}
          />
        </button>
      </header>

      <main className="content homeContent">
        <div className="searchBox">
          <Search
            size={18}
          />

          <input
            value={query}
            onChange={(event) =>
              setQuery(
                event
                  .target
                  .value
              )
            }
            placeholder="Buscar time ou campeonato"
          />

          {query && (
            <button
              onClick={() =>
                setQuery("")
              }
            >
              <X
                size={17}
              />
            </button>
          )}
        </div>

        <div className="daysStrip">
          {days.map(
            (day) => (
              <button
                key={
                  day.key
                }
                className={
                  selectedDate ===
                  day.key
                    ? "day active"
                    : "day"
                }
                onClick={() => {
                  setSelectedDate(
                    day.key
                  );
                  setActiveNav(
                    "today"
                  );
                }}
              >
                <span>
                  {day.day}
                </span>

                <b>
                  {day.number}
                </b>
              </button>
            )
          )}
        </div>

        <div className="summaryBar">
          <div>
            <span>
              TODOS OS JOGOS
            </span>

            <strong>
              {
                selectedMatches.length
              }{" "}
              partidas
            </strong>
          </div>

          <div className="summaryLive">
            <i />

            <span>
              {
                live.length
              }{" "}
              AO VIVO
            </span>
          </div>
        </div>

        {error && (
          <div className="errorBox">
            {error}
          </div>
        )}

        {loading ? (
          <div className="emptyState">
            <RefreshCw />
            <strong>
              Carregando jogos...
            </strong>
          </div>
        ) : groups.length ===
          0 ? (
          <div className="emptyState">
            <Trophy />

            <strong>
              Nenhuma partida encontrada
            </strong>

            <span>
              Tente outro dia, campeonato ou filtro.
            </span>
          </div>
        ) : (
          <div className="competitionsList">
            <div className="listTitle">
              <div>
                <ListFilter
                  size={15}
                />

                <span>
                  CAMPEONATOS
                </span>
              </div>

              <small>
                {
                  groups.length
                }
              </small>
            </div>

            {groups.map(
              (group) => (
                <CompetitionCard
                  key={
                    group.key
                  }
                  group={
                    group
                  }
                  expanded={
                    expanded.has(
                      group.key
                    )
                  }
                  onToggle={() => {
                    setExpanded(
                      (current) => {
                        const next =
                          new Set(
                            current
                          );

                        if (
                          next.has(
                            group.key
                          )
                        ) {
                          next.delete(
                            group.key
                          );
                        } else {
                          next.add(
                            group.key
                          );
                        }

                        return next;
                      }
                    );
                  }}
                  favorites={
                    favorites
                  }
                  onFavorite={
                    toggleFavorite
                  }
                  onOpen={
                    openMatch
                  }
                />
              )
            )}
          </div>
        )}
      </main>

      <nav className="bottomNav">
        <button
          className={
            activeNav ===
            "today"
              ? "navButton active"
              : "navButton"
          }
          onClick={() =>
            setActiveNav(
              "today"
            )
          }
        >
          <span className="navIcon">
            <CalendarDays />
          </span>

          <span>
            Hoje
          </span>
        </button>

        <button
          className={
            activeNav ===
            "live"
              ? "navButton active"
              : "navButton"
          }
          onClick={() =>
            setActiveNav(
              "live"
            )
          }
        >
          <span className="navIcon">
            <CircleDot />

            {live.length >
              0 && (
              <i>
                {
                  live.length
                }
              </i>
            )}
          </span>

          <span>
            Ao Vivo
          </span>
        </button>

        <button
          className={
            activeNav ===
            "favorites"
              ? "navButton active"
              : "navButton"
          }
          onClick={() =>
            setActiveNav(
              "favorites"
            )
          }
        >
          <span className="navIcon">
            <Heart />
          </span>

          <span>
            Favoritos
          </span>
        </button>

        <button
          className={
            activeNav ===
            "finished"
              ? "navButton active"
              : "navButton"
          }
          onClick={() =>
            setActiveNav(
              "finished"
            )
          }
        >
          <span className="navIcon">
            <Clock3 />
          </span>

          <span>
            Encerrados
          </span>
        </button>

        <button
          className="navButton"
          onClick={() => {
            setQuery("");
          }}
        >
          <span className="navIcon">
            <Trophy />
          </span>

          <span>
            Ligas
          </span>
        </button>
      </nav>
    </div>
  );
}

createRoot(
  document.getElementById(
    "root"
  )
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
