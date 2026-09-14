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
  "P",
]);

const FINISHED_STATUSES = new Set([
  "FT",
  "AET",
  "PEN",
]);

async function getJSON(path) {
  const response = await fetch(
    `${API}${path}`
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error ||
        "Erro ao consultar o servidor"
    );
  }

  return data;
}

function isLiveMatch(match) {
  return LIVE_STATUSES.has(
    match?.fixture?.status?.short
  );
}

function isFinishedMatch(match) {
  return FINISHED_STATUSES.has(
    match?.fixture?.status?.short
  );
}

function formatTime(date) {
  if (!date) return "";

  try {
    return new Intl.DateTimeFormat(
      "pt-BR",
      {
        hour: "2-digit",
        minute: "2-digit",
        timeZone:
          "America/Sao_Paulo",
      }
    ).format(new Date(date));
  } catch {
    return "";
  }
}

function localDateKey(date) {
  try {
    return new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).format(new Date(date));
  } catch {
    return "";
  }
}

function statusLabel(match) {
  const status =
    match?.fixture?.status?.short;

  const elapsed =
    match?.fixture?.status?.elapsed;

  if (isLiveMatch(match)) {
    return elapsed
      ? `AO VIVO ${elapsed}'`
      : "AO VIVO";
  }

  if (isFinishedMatch(match)) {
    return "ENCERRADO";
  }

  if (status === "PST") {
    return "ADIADO";
  }

  if (status === "CANC") {
    return "CANCELADO";
  }

  if (status === "SUSP") {
    return "SUSPENSO";
  }

  return (
    formatTime(
      match?.fixture?.date
    ) || "A DEFINIR"
  );
}

function makeDays() {
  const today = new Date();

  return Array.from(
    { length: 7 },
    (_, index) => {
      const date = new Date(today);

      date.setDate(
        today.getDate() +
          index -
          3
      );

      return {
        key: localDateKey(date),

        weekday:
          new Intl.DateTimeFormat(
            "pt-BR",
            {
              weekday: "short",
              timeZone:
                "America/Sao_Paulo",
            }
          )
            .format(date)
            .replace(".", "")
            .toUpperCase(),

        day:
          new Intl.DateTimeFormat(
            "pt-BR",
            {
              day: "2-digit",
              timeZone:
                "America/Sao_Paulo",
            }
          ).format(date),

        today: index === 3,
      };
    }
  );
}

function dedupeMatches(matches) {
  const map = new Map();

  matches.forEach((match) => {
    const id =
      match?.fixture?.id;

    if (
      id !== undefined &&
      id !== null
    ) {
      map.set(
        String(id),
        match
      );
    }
  });

  return [...map.values()];
}

function competitionKey(match) {
  return `${
    match?.league?.country ||
    "Outros"
  }::${
    match?.league?.id ||
    match?.league?.name ||
    "Futebol"
  }`;
}

function groupByCompetition(
  matches
) {
  const groups = new Map();

  matches.forEach((match) => {
    const key =
      competitionKey(match);

    if (!groups.has(key)) {
      groups.set(key, {
        key,

        country:
          match?.league?.country ||
          "Outros",

        name:
          match?.league?.name ||
          "Futebol",

        logo:
          match?.league?.logo ||
          null,

        matches: [],
      });
    }

    groups
      .get(key)
      .matches.push(match);
  });

  return [
    ...groups.values(),
  ].sort((a, b) => {
    const aBrazil =
      a.country === "Brasil" ||
      a.country === "Brazil"
        ? 0
        : 1;

    const bBrazil =
      b.country === "Brasil" ||
      b.country === "Brazil"
        ? 0
        : 1;

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
  const live =
    isLiveMatch(match);

  const finished =
    isFinishedMatch(match);

  const homeScore =
    match?.goals?.home;

  const awayScore =
    match?.goals?.away;

  const showScore =
    live ||
    finished ||
    homeScore !== null ||
    awayScore !== null;

  return (
    <div
      className="matchRow"
      onClick={() =>
        onOpen(
          match.fixture.id
        )
      }
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
          {match?.teams?.home
            ?.logo ? (
            <img
              src={
                match.teams.home
                  .logo
              }
              alt=""
            />
          ) : (
            <span className="teamFallback">
              ⚽
            </span>
          )}

          <span>
            {match?.teams?.home
              ?.name ||
              "Mandante"}
          </span>

          {showScore && (
            <b>
              {homeScore ?? 0}
            </b>
          )}
        </div>

        <div className="teamLine">
          {match?.teams?.away
            ?.logo ? (
            <img
              src={
                match.teams.away
                  .logo
              }
              alt=""
            />
          ) : (
            <span className="teamFallback">
              ⚽
            </span>
          )}

          <span>
            {match?.teams?.away
              ?.name ||
              "Visitante"}
          </span>

          {showScore && (
            <b>
              {awayScore ?? 0}
            </b>
          )}
        </div>
      </div>

      <button
        className={`favoriteButton ${
          favorite
            ? "selected"
            : ""
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
            {
              group.matches
                .length
            }
          </span>

          <ChevronRight
            className={
              expanded
                ? "rotate"
                : ""
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
                new Date(
                  a.fixture.date
                ) -
                new Date(
                  b.fixture.date
                )
            )
            .map((match) => (
              <MatchRow
                key={
                  match.fixture.id
                }
                match={match}
                favorite={favorites.includes(
                  String(
                    match.fixture
                      .id
                  )
                )}
                onFavorite={
                  onFavorite
                }
                onOpen={onOpen}
              />
            ))}
        </div>
      )}
    </section>
  );
}

function eventIcon(event) {
  const type = String(
    event?.type || ""
  ).toLowerCase();

  const detail = String(
    event?.detail || ""
  ).toLowerCase();

  if (
    type.includes("goal") ||
    detail.includes("goal")
  ) {
    return "⚽";
  }

  if (
    type.includes("card") ||
    detail.includes("card")
  ) {
    return "🟨";
  }

  if (
    type.includes("subst") ||
    type.includes(
      "substitution"
    ) ||
    detail.includes("subst")
  ) {
    return "🔄";
  }

  return "•";
}

function findArray(
  value,
  keys = []
) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value;
  }

  if (
    typeof value !== "object"
  ) {
    return [];
  }

  for (const key of keys) {
    if (
      Array.isArray(value[key])
    ) {
      return value[key];
    }
  }

  for (const child of Object.values(
    value
  )) {
    if (
      child &&
      typeof child === "object"
    ) {
      const found = findArray(
        child,
        keys
      );

      if (found.length) {
        return found;
      }
    }
  }

  return [];
}

function normalizeStandingRow(
  row,
  index
) {
  const team =
    row?.team ||
    row?.club ||
    row?.time ||
    row?.equipe ||
    {};

  return {
    position:
      row?.rank ??
      row?.position ??
      row?.posicao ??
      row?.place ??
      index + 1,

    teamName:
      team?.name ||
      team?.nome ||
      row?.team_name ||
      row?.name ||
      row?.nome ||
      "Time",

    teamLogo:
      team?.logo ||
      team?.image ||
      team?.escudo ||
      row?.team_logo ||
      null,

    points:
      row?.points ??
      row?.pts ??
      row?.pontos ??
      row?.point ??
      "-",

    played:
      row?.all?.played ??
      row?.played ??
      row?.games ??
      row?.jogos ??
      row?.partidas ??
      "-",

    wins:
      row?.all?.win ??
      row?.wins ??
      row?.vitorias ??
      "-",

    draws:
      row?.all?.draw ??
      row?.draws ??
      row?.empates ??
      "-",

    losses:
      row?.all?.lose ??
      row?.losses ??
      row?.derrotas ??
      "-",
  };
}

function Detail({
  match,
  onClose,
}) {
  const [
    activeTab,
    setActiveTab,
  ] = useState("summary");

  const [
    standings,
    setStandings,
  ] = useState([]);

  const [
    standingsLoading,
    setStandingsLoading,
  ] = useState(false);

  const [
    standingsError,
    setStandingsError,
  ] = useState("");

  const events = Array.isArray(
    match?.events
  )
    ? match.events
    : [];

  const lineups = findArray(
    match,
    [
      "lineups",
      "formations",
      "escalacoes",
    ]
  );

  const h2h = findArray(match, [
    "h2h",
    "head_to_head",
    "confrontos",
  ]);

  useEffect(() => {
    if (
      activeTab !==
      "standings"
    ) {
      return;
    }

    const leagueId =
      match?.league?.id;

    if (!leagueId) {
      setStandingsError(
        "Classificação indisponível para esta competição."
      );

      return;
    }

    let cancelled = false;

    async function loadStandings() {
      setStandingsLoading(true);

      setStandingsError("");

      try {
        const standingsPath =
          String(
            leagueId
          ).startsWith(
            "serie-d"
          )
            ? "/standings/serie-d"
            : `/standings/${leagueId}`;

        const data =
          await getJSON(
            standingsPath
          );

        const rows =
          findArray(data, [
            "standings",
            "classification",
            "classificacao",
            "table",
            "response",
            "data",
          ]);

        if (!cancelled) {
          setStandings(
            rows
              .filter(
                (row) =>
                  row &&
                  typeof row ===
                    "object"
              )
              .map(
                normalizeStandingRow
              )
          );
        }
      } catch (err) {
        if (!cancelled) {
          setStandingsError(
            err.message ||
              "Não foi possível carregar a classificação."
          );
        }
      } finally {
        if (!cancelled) {
          setStandingsLoading(
            false
          );
        }
      }
    }

    loadStandings();

    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    match?.league?.id,
  ]);

  const tabs = [
    {
      id: "summary",
      label: "SUMÁRIO",
    },
    {
      id: "lineups",
      label: "FORMAÇÕES",
    },
    {
      id: "h2h",
      label: "H2H",
    },
    {
      id: "standings",
      label:
        "CLASSIFICAÇÃO",
    },
  ];

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
            {match?.league
              ?.country ||
              "Futebol"}
          </span>

          <strong>
            {match?.league
              ?.name ||
              "Partida"}
          </strong>
        </div>

        <div className="headerSpacer" />
      </header>

      <main className="content">
        <section className="scoreCard">
          <div className="detailTeam">
            {match?.teams?.home
              ?.logo ? (
              <img
                src={
                  match.teams
                    .home.logo
                }
                alt=""
              />
            ) : (
              <span
                className="teamFallback"
                style={{
                  fontSize: 34,
                }}
              >
                ⚽
              </span>
            )}

            <b>
              {match?.teams?.home
                ?.name ||
                "Mandante"}
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
              {match?.goals
                ?.home ?? 0}

              <small>
                {" "}
                x{" "}
              </small>

              {match?.goals
                ?.away ?? 0}
            </strong>
          </div>

          <div className="detailTeam">
            {match?.teams?.away
              ?.logo ? (
              <img
                src={
                  match.teams
                    .away.logo
                }
                alt=""
              />
            ) : (
              <span
                className="teamFallback"
                style={{
                  fontSize: 34,
                }}
              >
                ⚽
              </span>
            )}

            <b>
              {match?.teams?.away
                ?.name ||
                "Visitante"}
            </b>
          </div>
        </section>

        <div
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            padding:
              "4px 0 10px",
            marginBottom: 6,
          }}
        >
          {tabs.map(
            (item) => (
              <button
                key={item.id}
                onClick={() =>
                  setActiveTab(
                    item.id
                  )
                }
                style={{
                  border: 0,

                  borderBottom:
                    activeTab ===
                    item.id
                      ? "3px solid #59ff7a"
                      : "3px solid transparent",

                  background:
                    "transparent",

                  color:
                    activeTab ===
                    item.id
                      ? "#ffffff"
                      : "#8f9c95",

                  fontWeight:
                    800,

                  fontSize: 12,

                  whiteSpace:
                    "nowrap",

                  padding:
                    "12px 10px 9px",

                  cursor:
                    "pointer",
                }}
              >
                {item.label}
              </button>
            )
          )}
        </div>

        {activeTab ===
          "summary" && (
          <section className="detailPanel">
            <h2>
              Sumário da
              partida
            </h2>

            {events.length ===
            0 ? (
              <p className="muted">
                A fonte não
                disponibilizou
                eventos
                detalhados para
                esta partida.
              </p>
            ) : (
              events.map(
                (
                  event,
                  index
                ) => (
                  <div
                    className="eventItem"
                    key={`${
                      event?.time
                        ?.elapsed ||
                      0
                    }-${index}`}
                  >
                    <b>
                      {event?.time
                        ?.elapsed
                        ? `${event.time.elapsed}'`
                        : "–"}
                    </b>

                    <span>
                      {eventIcon(
                        event
                      )}
                    </span>

                    <div>
                      <strong>
                        {event?.team
                          ?.name ||
                          ""}
                      </strong>

                      <small>
                        {event?.player
                          ?.name ||
                          event?.assist
                            ?.name ||
                          event?.detail ||
                          event?.type ||
                          ""}
                      </small>
                    </div>
                  </div>
                )
              )
            )}
          </section>
        )}

        {activeTab ===
          "lineups" && (
          <section className="detailPanel">
            <h2>
              Formações
            </h2>

            {lineups.length ===
            0 ? (
              <p className="muted">
                A fonte não
                disponibilizou
                escalações ou
                formações para
                esta partida.
              </p>
            ) : (
              lineups.map(
                (
                  item,
                  index
                ) => (
                  <div
                    className="eventItem"
                    key={index}
                  >
                    <span>
                      👥
                    </span>

                    <div>
                      <strong>
                        {item?.team
                          ?.name ||
                          item?.name ||
                          item?.team_name ||
                          `Formação ${
                            index +
                            1
                          }`}
                      </strong>

                      <small>
                        {item?.formation ||
                          item?.formacao ||
                          "Escalação disponível"}
                      </small>
                    </div>
                  </div>
                )
              )
            )}
          </section>
        )}

        {activeTab ===
          "h2h" && (
          <section className="detailPanel">
            <h2>
              Confrontos
              diretos
            </h2>

            {h2h.length ===
            0 ? (
              <p className="muted">
                A fonte não
                disponibilizou
                histórico de
                confrontos para
                esta partida.
              </p>
            ) : (
              h2h.map(
                (
                  item,
                  index
                ) => (
                  <div
                    className="eventItem"
                    key={index}
                  >
                    <span>
                      ⚽
                    </span>

                    <div>
                      <strong>
                        {item?.home
                          ?.name ||
                          item?.teams
                            ?.home
                            ?.name ||
                          item?.home_name ||
                          "Mandante"}{" "}
                        {item?.goals
                          ?.home ??
                          item?.home_score ??
                          "-"}{" "}
                        x{" "}
                        {item?.goals
                          ?.away ??
                          item?.away_score ??
                          "-"}{" "}
                        {item?.away
                          ?.name ||
                          item?.teams
                            ?.away
                            ?.name ||
                          item?.away_name ||
                          "Visitante"}
                      </strong>

                      <small>
                        {item?.date ||
                          item?.fixture
                            ?.date ||
                          item?.competition ||
                          ""}
                      </small>
                    </div>
                  </div>
                )
              )
            )}
          </section>
        )}

        {activeTab ===
          "standings" && (
          <section className="detailPanel">
            <h2>
              Classificação
            </h2>

            {standingsLoading && (
              <p className="muted">
                Carregando
                classificação
                real...
              </p>
            )}

            {!standingsLoading &&
              standingsError && (
                <p className="muted">
                  {
                    standingsError
                  }
                </p>
              )}

            {!standingsLoading &&
              !standingsError &&
              standings.length ===
                0 && (
                <p className="muted">
                  A fonte não
                  disponibilizou
                  classificação
                  para esta
                  competição.
                </p>
              )}

            {!standingsLoading &&
              standings.length >
                0 && (
                <div
                  style={{
                    overflowX:
                      "auto",
                  }}
                >
                  <div
                    style={{
                      minWidth:
                        520,

                      display:
                        "grid",

                      gridTemplateColumns:
                        "34px minmax(150px,1fr) 44px 44px 44px 44px 54px",

                      gap: 6,

                      padding:
                        "8px 6px",

                      fontSize:
                        11,

                      fontWeight:
                        800,

                      color:
                        "#87958e",
                    }}
                  >
                    <span>
                      #
                    </span>
                    <span>
                      TIME
                    </span>
                    <span>
                      J
                    </span>
                    <span>
                      V
                    </span>
                    <span>
                      E
                    </span>
                    <span>
                      D
                    </span>
                    <span>
                      PTS
                    </span>
                  </div>

                  {standings.map(
                    (
                      row,
                      index
                    ) => (
                      <div
                        key={`${row.teamName}-${index}`}
                        style={{
                          minWidth:
                            520,

                          display:
                            "grid",

                          gridTemplateColumns:
                            "34px minmax(150px,1fr) 44px 44px 44px 44px 54px",

                          gap: 6,

                          alignItems:
                            "center",

                          padding:
                            "10px 6px",

                          borderTop:
                            "1px solid rgba(255,255,255,.07)",

                          fontSize:
                            13,
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

                            gap: 8,

                            minWidth:
                              0,
                          }}
                        >
                          {row.teamLogo ? (
                            <img
                              src={
                                row.teamLogo
                              }
                              alt=""
                              style={{
                                width:
                                  24,

                                height:
                                  24,

                                objectFit:
                                  "contain",
                              }}
                            />
                          ) : (
                            <span>
                              ⚽
                            </span>
                          )}

                          <strong
                            style={{
                              overflow:
                                "hidden",

                              textOverflow:
                                "ellipsis",

                              whiteSpace:
                                "nowrap",
                            }}
                          >
                            {
                              row.teamName
                            }
                          </strong>
                        </div>

                        <span>
                          {
                            row.played
                          }
                        </span>

                        <span>
                          {
                            row.wins
                          }
                        </span>

                        <span>
                          {
                            row.draws
                          }
                        </span>

                        <span>
                          {
                            row.losses
                          }
                        </span>

                        <b>
                          {
                            row.points
                          }
                        </b>
                      </div>
                    )
                  )}
                </div>
              )}
          </section>
        )}
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

  const [
    serieD,
    setSerieD,
  ] = useState([]);

  const [
    selectedDate,
    setSelectedDate,
  ] = useState(
    days[3]?.key || ""
  );

  const [
    query,
    setQuery,
  ] = useState("");

  const [
    expanded,
    setExpanded,
  ] = useState({});

  const [
    selectedId,
    setSelectedId,
  ] = useState(null);

  const [
    detail,
    setDetail,
  ] = useState(null);

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

        getJSON(
          "/serie-d"
        ).catch(() => ({
          response: [],
        })),
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

    const timer =
      setInterval(
        load,
        15000
      );

    return () =>
      clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      return;
    }

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
            ? response[0] ||
                null
            : response ||
                null
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

  const allMatches =
    useMemo(
      () =>
        dedupeMatches([
          ...live,
          ...today,
          ...serieD,
        ]),
      [
        live,
        today,
        serieD,
      ]
    );

  const liveMatches =
    useMemo(
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
      let result =
        allMatches;

      if (tab === "live") {
        result =
          liveMatches;
      }

      if (
        tab === "finished"
      ) {
        result =
          finishedMatches;
      }

      if (
        tab === "favorites"
      ) {
        result =
          allMatches.filter(
            (match) =>
              favorites.includes(
                String(
                  match.fixture
                    .id
                )
              )
          );
      }

      if (
        tab === "today"
      ) {
        result =
          allMatches.filter(
            (match) =>
              localDateKey(
                match?.fixture
                  ?.date
              ) ===
              selectedDate
          );
      }

      if (query.trim()) {
        const text =
          query
            .toLowerCase()
            .trim();

        result =
          result.filter(
            (match) =>
              `${
                match?.teams
                  ?.home?.name ||
                ""
              } ${
                match?.teams
                  ?.away?.name ||
                ""
              } ${
                match?.league
                  ?.name || ""
              } ${
                match?.league
                  ?.country ||
                ""
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

  const groups =
    useMemo(
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
        : [
            ...favorites,
            id,
          ];

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

          setSelectedId(
            null
          );
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
            onError={(
              event
            ) => {
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
              loading
                ? "spin"
                : ""
            }
          />
        </button>
      </header>

      <main className="content homeContent">
        <div className="searchBox">
          <Search size={19} />

          <input
            value={query}
            onChange={(
              event
            ) =>
              setQuery(
                event.target
                  .value
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
            {days.map(
              (day) => (
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
              )
            )}
          </div>
        )}

        <section className="summaryBar">
          <div>
            <span>
              {tab ===
              "live"
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
              {
                visibleMatches.length
              }{" "}
              {visibleMatches.length ===
              1
                ? "jogo"
                : "jogos"}
            </strong>
          </div>

          <div className="summaryLive">
            <i />

            <span>
              {
                liveMatches.length
              }{" "}
              ao vivo
            </span>
          </div>
        </section>

        {error && (
          <div className="errorBox">
            {error}
          </div>
        )}

        {loading &&
          allMatches.length ===
            0 && (
            <div className="emptyState">
              Carregando
              partidas reais...
            </div>
          )}

        {!loading &&
          groups.length ===
            0 && (
            <div className="emptyState">
              <Trophy
                size={28}
              />

              <strong>
                Nenhum jogo
                encontrado
              </strong>

              <span>
                {tab ===
                "favorites"
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
            Abrindo
            partida...
          </div>
        )}
      </main>

      <nav className="bottomNav">
        <NavButton
          active={
            tab === "today"
          }
          icon={<Home />}
          text="Hoje"
          onClick={() =>
            setTab("today")
          }
        />

        <NavButton
          active={
            tab === "live"
          }
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
            tab ===
            "favorites"
          }
          icon={<Heart />}
          text="Favoritos"
          onClick={() =>
            setTab(
              "favorites"
            )
          }
        />

        <NavButton
          active={
            tab ===
            "finished"
          }
          icon={
            <CalendarDays />
          }
          text="Encerrados"
          onClick={() =>
            setTab(
              "finished"
            )
          }
        />

        <NavButton
          active={
            tab ===
            "leagues"
          }
          icon={
            <Trophy />
          }
          text="Ligas"
          onClick={() =>
            setTab(
              "leagues"
            )
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
          <i>
            {badge}
          </i>
        )}
      </span>

      <span>
        {text}
      </span>
    </button>
  );
}

createRoot(
  document.getElementById(
    "root"
  )
).render(<App />);
