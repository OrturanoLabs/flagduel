import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  MethodStats,
  StatsMove,
  StatsRound,
  StatsRoundPage,
  StatsSummary,
} from "../../../packages/shared/src/statistics";
import "./stats.css";
const base = location.pathname.replace(/\/$/, "");
const number = (value: number | null | undefined, digits = 0) =>
  value == null
    ? "—"
    : value.toLocaleString("it-IT", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      });
const pct = (value: number | null | undefined) =>
  value == null ? "—" : number(value, 1) + "%";
const outcomeLabels: Record<string, string> = {
  probe_correct: "Sonda esatta",
  solve_correct: "Definitiva corretta",
  solve_wrong: "Definitiva sbagliata",
  probe_limit: "Limite tentativi",
  draw: "Patta",
};
const statusLabels: Record<string, string> = {
  completed: "Conclusa",
  in_progress: "In corso",
  abandoned: "Abbandonata",
  interrupted: "Interrotta",
};
const kindLabels: Record<string, string> = {
  probe: "Sonda",
  solve: "Definitiva",
  pass: "Passa",
  draw: "Proposta/accordo di patta",
  decline_draw: "Rifiuto/ritiro patta",
};
const defaults = {
  mode: "pvp",
  experiment: "standard",
  tolerance: "0.04",
  maxProbes: "",
  catalogVersion: "",
  from: "",
  to: "",
};
type Filters = typeof defaults;
function Statistic({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
function Methods({ value }: { value: StatsSummary["methods"] }) {
  const cells = (
    key: keyof Pick<
      MethodStats,
      "probePct" | "definitivePct" | "opponentWrongPct"
    >,
    count: keyof Pick<MethodStats, "probe" | "definitive" | "opponentWrong">,
  ) =>
    [value.all, value.first, value.second].map((m, i) => (
      <td key={i}>
        {pct(m[key])}
        <small>
          {number(m[count])} / {number(m.wins)}
        </small>
      </td>
    ));
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Origine della vittoria</th>
            <th>Tutte le vittorie</th>
            <th>Dato che vince G1</th>
            <th>Dato che vince G2</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>Sonda corretta</th>
            {cells("probePct", "probe")}
          </tr>
          <tr>
            <th>Definitiva corretta</th>
            {cells("definitivePct", "definitive")}
          </tr>
          <tr>
            <th>Definitiva sbagliata dell'avversario</th>
            {cells("opponentWrongPct", "opponentWrong")}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
function StatisticsPage() {
  const [filters, setFilters] = useState<Filters>(() => {
      const params = new URLSearchParams(location.search);
      return Object.fromEntries(
        Object.entries(defaults).map(([key, value]) => [
          key,
          params.has(key) ? params.get(key)! : value,
        ]),
      ) as Filters;
    }),
    [summary, setSummary] = useState<
      (StatsSummary & { writeErrors?: number }) | null
    >(null),
    [rounds, setRounds] = useState<StatsRoundPage | null>(null),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [search, setSearch] = useState(""),
    [countrySort, setCountrySort] = useState("draws"),
    [allChoices, setAllChoices] = useState(false),
    [detail, setDetail] = useState<{
      round: StatsRound;
      moves: StatsMove[];
    } | null>(null),
    [detailError, setDetailError] = useState("");
  const query = useMemo(() => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) q.set(k, v);
    return q.toString();
  }, [filters]);
  useEffect(() => {
    history.replaceState(
      null,
      "",
      `${base}?${new URLSearchParams(filters).toString()}`,
    );
    const controller = new AbortController();
    setLoading(true);
    setError("");
    async function load() {
      try {
        const results = await Promise.all([
          fetch(`${base}/api/summary?${query}`, { signal: controller.signal }),
          fetch(`${base}/api/rounds?${query}&page=${page}`, {
            signal: controller.signal,
          }),
        ]);
        if (results.some((r) => !r.ok))
          throw Error(
            "Impossibile leggere i dati: controlla i filtri e l'indirizzo della pagina.",
          );
        const [s, r] = await Promise.all(results.map((r) => r.json()));
        if (!controller.signal.aborted) {
          setSummary(s);
          setRounds(r);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setError((e as Error).message);
          setSummary(null);
          setRounds(null);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [query, page, refresh]);
  const update = (key: keyof Filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
    setDetail(null);
  };
  const countries = useMemo(() => {
    const rows = (summary?.countries ?? []).filter((r) =>
      `${r.name} ${r.code}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
    );
    const sort = countrySort as "draws" | "notFoundPct" | "meanGuessesFound";
    return [...rows].sort(
      (a, b) =>
        (b[sort] ?? -1) - (a[sort] ?? -1) || a.name.localeCompare(b.name, "it"),
    );
  }, [summary, search, countrySort]);
  const name = (code: string) =>
    summary?.countries.find((r) => r.code === code)?.name ?? code;
  async function openRound(id: string) {
    setDetailError("");
    try {
      const response = await fetch(
        `${base}/api/round/${encodeURIComponent(id)}`,
      );
      if (!response.ok) throw Error("Dettaglio non disponibile");
      setDetail(await response.json());
    } catch (e) {
      setDetailError((e as Error).message);
    }
  }
  const configurations = summary?.configurations ?? [];
  function chooseConfig(c: StatsSummary["configurations"][number]) {
    setFilters((f) => ({
      ...f,
      mode: c.mode,
      experiment: c.colorShift
        ? c.noMemory
          ? "both"
          : "color_shift"
        : c.noMemory
          ? "no_memory"
          : "standard",
      tolerance: String(c.tolerance),
      maxProbes: c.maxProbes === null ? "unlimited" : String(c.maxProbes),
      catalogVersion: c.catalogVersion,
    }));
    setPage(1);
    setDetail(null);
  }
  const total = summary?.totals;
  return (
    <main className="statistics-page">
      <header className="stats-header">
        <div>
          <p className="eyebrow">FLAG DUEL</p>
          <h1>Statistiche di gioco</h1>
          <p>Estrazioni, difficoltà e scelte dei giocatori.</p>
        </div>
        <button disabled={loading} onClick={() => setRefresh((n) => n + 1)}>
          {loading ? "Aggiornamento…" : "Aggiorna"}
        </button>
      </header>
      <form
        className="filters"
        onSubmit={(e) => e.preventDefault()}
        aria-label="Filtri statistiche"
      >
        <label>
          Gioco
          <select
            aria-label="Gioco"
            value={filters.mode}
            onChange={(e) => update("mode", e.target.value)}
          >
            <option value="pvp">PvP</option>
            <option value="solo">Singolo</option>
            <option value="">Tutti</option>
          </select>
        </label>
        <label>
          Modalità
          <select
            aria-label="Modalità"
            value={filters.experiment}
            onChange={(e) => update("experiment", e.target.value)}
          >
            <option value="standard">Standard</option>
            <option value="color_shift">Color Shift</option>
            <option value="no_memory">No Memory</option>
            <option value="both">Color Shift + No Memory</option>
            <option value="">Tutte</option>
          </select>
        </label>
        <label>
          Tolleranza
          <select
            aria-label="Tolleranza"
            value={filters.tolerance}
            onChange={(e) => update("tolerance", e.target.value)}
          >
            <option value="0.02">Precisa · 0,02</option>
            <option value="0.04">Standard · 0,04</option>
            <option value="0.1">Ampia · 0,1</option>
            <option value="">Tutte</option>
          </select>
        </label>
        <label>
          Limite sonde
          <select
            aria-label="Limite sonde"
            value={filters.maxProbes}
            onChange={(e) => update("maxProbes", e.target.value)}
          >
            <option value="">Tutti i limiti</option>
            {[
              ...new Set([
                6,
                ...configurations.flatMap((c) =>
                  c.maxProbes === null ? [] : [c.maxProbes],
                ),
              ]),
            ]
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            <option value="unlimited">Senza limite</option>
          </select>
        </label>
        <label>
          Versione bandiere
          <select
            aria-label="Versione bandiere"
            value={filters.catalogVersion}
            onChange={(e) => update("catalogVersion", e.target.value)}
          >
            <option value="">Tutte le versioni</option>
            {[...new Set(configurations.map((c) => c.catalogVersion))].map(
              (v) => (
                <option key={v} value={v}>
                  {v.slice(0, 8)}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          Dal (UTC)
          <input
            type="date"
            value={filters.from}
            onChange={(e) => update("from", e.target.value)}
          />
        </label>
        <label>
          Al (UTC)
          <input
            type="date"
            value={filters.to}
            onChange={(e) => update("to", e.target.value)}
          />
        </label>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!!summary?.writeErrors && (
        <p className="error" role="alert">
          {summary.writeErrors} errori di scrittura in questa sessione: i dati
          possono essere incompleti.
        </p>
      )}
      {summary && total && (
        <>
          <p className="sample" role="status">
            {number(total.draws)} estrazioni · {number(total.completed)} mani
            concluse · {number(total.inProgress)} in corso ·{" "}
            {number(total.abandoned)} abbandonate · {number(total.interrupted)}{" "}
            interrotte. Aggiornato{" "}
            {new Date(summary.generatedAt).toLocaleTimeString("it-IT")}.
          </p>
          {!total.draws && (
            <p className="empty">
              Nessuna mano per questi filtri. Le statistiche iniziano dalle
              nuove partite registrate.
            </p>
          )}
          <section aria-labelledby="overview-title">
            <h2 id="overview-title">Risultati della selezione</h2>
            <div className="stats-grid">
              <Statistic
                label="Bandiere non indovinate"
                value={pct(total.notFoundPct)}
                note={`${number(total.notFound)} / ${number(total.completed)} mani concluse`}
              />
              <Statistic
                label="Tentativi medi · risolte"
                value={number(total.meanGuessesFound, 2)}
                note={`${number(total.found)} mani risolte · sonde + definitiva`}
              />
              <Statistic
                label="Sonde medie · risolte"
                value={number(total.meanProbesFound, 2)}
                note="Senza contare la risposta definitiva"
              />
              <Statistic
                label="Mediana · risolte"
                value={number(total.medianGuessesFound, 1)}
                note="Sonde + eventuale definitiva corretta"
              />
              <Statistic
                label="Tentativi medi · tutte le concluse"
                value={number(total.meanGuessesCompleted, 2)}
                note="Comprende anche errori, limiti e patte"
              />
              <Statistic
                label="Errori sulle definitive"
                value={pct(total.definitiveErrorPct)}
                note="Definitive sbagliate / definitive inviate"
              />
            </div>
            <p className="explanation">
              La media delle mani risolte è condizionata al successo: leggila
              insieme alla percentuale non indovinata. Patte, limite sonde e
              definitive sbagliate sono conclusioni senza bandiera trovata;
              abbandoni e interruzioni restano separati. Per confronti omogenei
              scegli una configurazione esatta nella tabella in fondo.
            </p>
            <div className="outcome-counts">
              <span>
                Patte concordate: <b>{number(total.agreedDraws)}</b>
              </span>
              <span>
                Limite raggiunto: <b>{number(total.limitReached)}</b>
              </span>
              <span>
                Definitive sbagliate: <b>{number(total.wrongDefinitives)}</b>
              </span>
            </div>
          </section>
          <section aria-labelledby="order-title">
            <h2 id="order-title">Chi comincia la mano</h2>
            <p>
              G1 è chi gioca per primo in quella mano; G2 è l'avversario. Le
              statistiche di posizione escludono il singolo.
            </p>
            <div className="stats-grid order-grid">
              <Statistic
                label="Vince G1 · tutte le concluse PvP"
                value={pct(total.winsFirstPct)}
                note={`${number(total.winsFirst)} / ${number(total.completedPvp)}`}
              />
              <Statistic
                label="Vince G2 · tutte le concluse PvP"
                value={pct(total.winsSecondPct)}
                note={`${number(total.winsSecond)} / ${number(total.completedPvp)}`}
              />
              <Statistic
                label="Vince G1 · mani con vincitore"
                value={pct(total.winsFirstDecisivePct)}
                note={`${number(total.winsFirst)} / ${number(total.decisivePvp)}`}
              />
              <Statistic
                label="Sconfitte per definitiva sbagliata"
                value={pct(total.wrongDefinitiveLossPct)}
                note="Su tutte le sconfitte PvP con un vincitore"
              />
            </div>
            <h3>Come si vince, anche condizionando sul vincitore</h3>
            <Methods value={summary.methods} />
            <p className="explanation">
              Ogni cella mostra percentuale e numeratore/denominatore. Se vince
              G1, una definitiva sbagliata è una sconfitta di G2; se vince G2, è
              una sconfitta di G1. Una vittoria per errore avversario non
              significa che la bandiera sia stata indovinata.
            </p>
          </section>
          <section aria-labelledby="countries-title">
            <div className="section-heading">
              <h2 id="countries-title">Per ogni bandiera</h2>
              <a className="button" href={`${base}/countries.csv?${query}`}>
                Esporta CSV
              </a>
            </div>
            <div className="table-tools">
              <input
                aria-label="Cerca bandiera"
                placeholder="Cerca bandiera…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                aria-label="Ordina bandiere"
                value={countrySort}
                onChange={(e) => setCountrySort(e.target.value)}
              >
                <option value="draws">Più estratte</option>
                <option value="notFoundPct">Più spesso non indovinate</option>
                <option value="meanGuessesFound">
                  Più tentativi per risolvere
                </option>
              </select>
            </div>
            <div className="table-scroll">
              <table data-testid="countries-table">
                <thead>
                  <tr>
                    <th>Bandiera</th>
                    <th>Estratta</th>
                    <th>Occorrenza</th>
                    <th>Attese uniformi</th>
                    <th>Concluse</th>
                    <th>Non indovinata</th>
                    <th>Media tentativi · risolte</th>
                    <th>Media sonde · risolte</th>
                    <th>Media tentativi · concluse</th>
                    <th>Non concluse</th>
                  </tr>
                </thead>
                <tbody>
                  {countries.map((c) => (
                    <tr key={c.code}>
                      <th>
                        {c.name}
                        <small>{c.code.toUpperCase()}</small>
                      </th>
                      <td>{number(c.draws)}</td>
                      <td>{pct(c.occurrencePct)}</td>
                      <td>
                        {number(c.expectedDraws, 2)}
                        <small>{pct(c.expectedOccurrencePct)}</small>
                      </td>
                      <td>{number(c.completed)}</td>
                      <td>
                        {pct(c.notFoundPct)}
                        <small>
                          {number(c.notFound)} / {number(c.completed)}
                        </small>
                      </td>
                      <td>
                        {number(c.meanGuessesFound, 2)}
                        <small>n = {number(c.found)}</small>
                      </td>
                      <td>{number(c.meanProbesFound, 2)}</td>
                      <td>{number(c.meanGuessesCompleted, 2)}</td>
                      <td>{number(c.unfinished)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="explanation">
              Occorrenza = estrazioni della bandiera / tutte le estrazioni
              filtrate, incluse le mani non concluse. Il numero atteso usa la
              dimensione e la versione del catalogo di ogni estrazione. Numeri
              piccoli possono produrre oscillazioni ampie.
            </p>
          </section>
          <section aria-labelledby="selections-title">
            <h2 id="selections-title">Bandiere più scelte dai giocatori</h2>
            <p>
              Scelte effettivamente inviate: sonde e risposte definitive,
              incluse le mani non concluse. I comandi rifiutati o duplicati non
              contano.
            </p>
            <div className="table-scroll">
              <table data-testid="selections-table">
                <thead>
                  <tr>
                    <th>Bandiera</th>
                    <th>Totale scelte</th>
                    <th>% di tutte le scelte</th>
                    <th>Sonde</th>
                    <th>% delle sonde</th>
                    <th>Definitive</th>
                    <th>% delle definitive</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.selections
                    .slice(0, allChoices ? undefined : 20)
                    .map((c) => (
                      <tr key={c.code}>
                        <th>{c.name}</th>
                        <td>{number(c.total)}</td>
                        <td>
                          <div className="frequency">
                            <span style={{ width: `${c.totalPct ?? 0}%` }} />
                            {pct(c.totalPct)}
                          </div>
                        </td>
                        <td>{number(c.probes)}</td>
                        <td>{pct(c.probePct)}</td>
                        <td>{number(c.definitives)}</td>
                        <td>{pct(c.definitivePct)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!summary.selections.length && (
              <p className="empty">Nessuna scelta registrata.</p>
            )}
            {summary.selections.length > 20 && (
              <button onClick={() => setAllChoices((v) => !v)}>
                {allChoices ? "Prime 20" : "Mostra tutte"}
              </button>
            )}
            <details>
              <summary>Prime sonde più frequenti</summary>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Prima sonda della mano</th>
                      <th>Usi</th>
                      <th>Percentuale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.openings.map((c) => (
                      <tr key={c.code}>
                        <th>{c.name}</th>
                        <td>{number(c.uses)}</td>
                        <td>{pct(c.pct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
          <section>
            <h2>Distribuzione dei tentativi</h2>
            <p>
              Sonde + eventuale risposta definitiva. Risolte e non risolte sono
              mostrate separatamente.
            </p>
            <div className="histogram" aria-label="Distribuzione dei tentativi">
              {summary.histogram.map((h) => (
                <div className="histogram-row" key={h.guesses}>
                  <b>{h.guesses}</b>
                  <div className="bars">
                    <span
                      className="found-bar"
                      style={{
                        width: `${(h.found / Math.max(1, ...summary.histogram.map((x) => x.found + x.notFound))) * 100}%`,
                      }}
                    />
                    <span
                      className="not-found-bar"
                      style={{
                        width: `${(h.notFound / Math.max(1, ...summary.histogram.map((x) => x.found + x.notFound))) * 100}%`,
                      }}
                    />
                  </div>
                  <small>
                    {h.found} risolte · {h.notFound} non risolte
                  </small>
                </div>
              ))}
            </div>
          </section>
          <section aria-labelledby="rounds-title">
            <h2 id="rounds-title">Mani registrate</h2>
            <div className="table-scroll">
              <table data-testid="rounds-table">
                <thead>
                  <tr>
                    <th>Data locale</th>
                    <th>Bandiera estratta</th>
                    <th>Stato / risultato</th>
                    <th>Vincitore</th>
                    <th>Sonde</th>
                    <th>Definitive</th>
                    <th>Sequenza</th>
                  </tr>
                </thead>
                <tbody>
                  {rounds?.rows.map((r) => (
                    <tr key={r.id}>
                      <td>{new Date(r.started_at).toLocaleString("it-IT")}</td>
                      <th>{name(r.secret)}</th>
                      <td>
                        {r.outcome
                          ? outcomeLabels[r.outcome]
                          : statusLabels[r.status]}
                      </td>
                      <td>{r.winner_order ? `G${r.winner_order}` : "—"}</td>
                      <td>{r.probes_count}</td>
                      <td>{r.definitive_count}</td>
                      <td>
                        <button
                          className="small-button"
                          onClick={() => void openRound(r.id)}
                        >
                          Dettagli
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <button
                disabled={page === 1 || loading}
                onClick={() => setPage((n) => n - 1)}
              >
                Precedenti
              </button>
              <span>
                Pagina {page} · {number(rounds?.total)} mani
              </span>
              <button
                disabled={
                  !rounds || page * rounds.pageSize >= rounds.total || loading
                }
                onClick={() => setPage((n) => n + 1)}
              >
                Successive
              </button>
            </div>
            {detailError && (
              <p role="alert" className="error">
                {detailError}
              </p>
            )}
            {detail && (
              <div className="round-detail">
                <div className="section-heading">
                  <h3>
                    {name(detail.round.secret)} · mano {detail.round.round_no}
                  </h3>
                  <button onClick={() => setDetail(null)}>
                    Chiudi dettaglio
                  </button>
                </div>
                <p>
                  {statusLabels[detail.round.status]} ·{" "}
                  {detail.round.outcome
                    ? outcomeLabels[detail.round.outcome]
                    : "In attesa di conclusione"}
                </p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Giocatore nella mano</th>
                        <th>Azione</th>
                        <th>Bandiera scelta</th>
                        <th>Corrisponde alla segreta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.moves.map((m) => (
                        <tr key={m.seq}>
                          <td>{m.seq}</td>
                          <td>G{m.actor_order}</td>
                          <td>{kindLabels[m.kind]}</td>
                          <td>{m.country ? name(m.country) : "—"}</td>
                          <td>
                            {m.correct === null ? "—" : m.correct ? "Sì" : "No"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
          <section>
            <h2>Configurazioni registrate</h2>
            <p>
              Ogni riga è un gruppo omogeneo. “Analizza” imposta tutti i filtri
              della configurazione, mantenendo l'eventuale intervallo date.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Gioco</th>
                    <th>Esperimenti</th>
                    <th>Tolleranza</th>
                    <th>Limite</th>
                    <th>Catalogo</th>
                    <th>Estratte</th>
                    <th>Concluse</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {configurations.map((c, i) => (
                    <tr key={i}>
                      <td>{c.mode === "pvp" ? "PvP" : "Singolo"}</td>
                      <td>
                        {[
                          c.colorShift && "Color Shift",
                          c.noMemory && "No Memory",
                        ]
                          .filter(Boolean)
                          .join(" + ") || "Standard"}
                      </td>
                      <td>{number(c.tolerance, 2)}</td>
                      <td>{c.maxProbes ?? "∞"}</td>
                      <td title={c.catalogVersion}>
                        {c.catalogVersion.slice(0, 8)} · {c.catalogSize}
                      </td>
                      <td>{c.draws}</td>
                      <td>{c.completed}</td>
                      <td>
                        <button
                          className="small-button"
                          onClick={() => chooseConfig(c)}
                        >
                          Analizza
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <footer>
            Le statistiche descrivono le partite registrate: non misurano da
            sole la forza dei giocatori né dimostrano uno sbilanciamento. Nessun
            nickname, indirizzo IP o token di sessione è salvato nei dati
            statistici.
          </footer>
        </>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<StatisticsPage />);
