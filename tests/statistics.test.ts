import { DatabaseSync } from "node:sqlite";
import { it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Statistics } from "../apps/server/src/statistics";
import { Game, defaults, type Flag } from "../apps/server/src/game";
import type { Command } from "../packages/shared/src/index";
import { oklab } from "../packages/flag-engine/src/index";
import { statsQuerySchema } from "../apps/server/src/statistics-http";
const catalog: Flag[] = ["#ff0000", "#ffffff", "#0000ff"].map((color, i) => ({
  code: ["aa", "bb", "cc"][i],
  name: ["A", "B", "C"][i],
  en: "Test",
  svg: `<svg>${color}</svg>`,
  regions: [{ d: "M0 0H300V200H0Z", color, lab: oklab(color) }],
}));
let serial = 0;
const startTime = Date.UTC(2026, 10, 1);
function action(
  stats: Statistics,
  g: Game,
  type: Command["type"],
  args: Partial<Command> = {},
  id = g.active || g.hostId,
  at = startTime + ++serial * 1000,
) {
  const before = { version: g.version, round: g.round, phase: g.phase };
  const command = {
    type,
    ...args,
    version: g.version,
    actionId: `statistics-${++serial}`,
  } satisfies Command;
  g.command(id, command);
  stats.observe(g, id, command, before, at);
  return { command, before, id };
}
function game(
  stats: Statistics,
  secret = 0,
  mode: "pvp" | "solo" = "pvp",
  maxProbes = 6,
  coin = 0,
  experimental = false,
) {
  const g = new Game(
    "ABC",
    catalog,
    { ...defaults, maxProbes },
    () => secret,
    () => coin,
  );
  g.add("Ada");
  if (mode === "pvp") g.add("Bruno");
  else action(stats, g, "set_mode", { mode });
  if (experimental)
    action(stats, g, "set_experiments", {
      experiments: { colorShift: true, noMemory: true },
    });
  action(stats, g, "start");
  return g;
}
function dataset(stats: Statistics) {
  let g = game(stats);
  action(stats, g, "probe", { country: "aa" });
  g = game(stats, 0, "pvp", 6, 1);
  action(stats, g, "probe", { country: "bb" });
  action(stats, g, "solve", { country: "aa" });
  g = game(stats, 1);
  action(stats, g, "probe", { country: "cc" });
  action(stats, g, "pass");
  action(stats, g, "probe", { country: "bb" });
  g = game(stats);
  action(stats, g, "probe", { country: "bb" });
  action(stats, g, "solve", { country: "cc" });
  g = game(stats, 1, "pvp", 2);
  action(stats, g, "probe", { country: "cc" });
  action(stats, g, "pass");
  action(stats, g, "probe", { country: "aa" });
  action(stats, g, "pass");
  g = game(stats, 2, "pvp", 6, 0, true);
  action(stats, g, "draw");
  action(stats, g, "draw", {}, g.players[1].id);
  g = game(stats, 0, "solo");
  action(stats, g, "probe", { country: "aa" });
  g = game(stats, 1, "solo", 1);
  action(stats, g, "probe", { country: "cc" });
  g = game(stats, 2);
  stats.abandon(g, startTime + 100000);
  g = game(stats);
  action(stats, g, "probe", { country: "cc" });
  stats.recoverInterrupted(startTime + 200000);
  game(stats, 2);
}
it("statistiche: frequenze, successo condizionato, mani non concluse e medie note", () => {
  const stats = new Statistics(":memory:", catalog);
  try {
    dataset(stats);
    const s = stats.summary();
    expect(s.totals).toMatchObject({
      draws: 11,
      completed: 8,
      found: 4,
      notFound: 4,
      inProgress: 1,
      abandoned: 1,
      interrupted: 1,
      agreedDraws: 1,
      limitReached: 2,
      wrongDefinitives: 1,
      meanGuessesFound: 1.5,
      meanProbesFound: 1.25,
      medianGuessesFound: 1.5,
      meanGuessesCompleted: 11 / 8,
      notFoundPct: 50,
      decisivePvp: 4,
      completedPvp: 6,
      winsFirst: 2,
      winsSecond: 2,
      winsFirstDecisivePct: 50,
      winsSecondDecisivePct: 50,
      wrongDefinitiveLossPct: 25,
      definitiveErrorPct: 50,
    });
    expect(s.totals.winsFirstPct).toBeCloseTo(100 / 3);
    expect(s.totals.winsSecondPct).toBeCloseTo(100 / 3);
    const a = s.countries.find((f) => f.code === "aa")!,
      b = s.countries.find((f) => f.code === "bb")!,
      c = s.countries.find((f) => f.code === "cc")!;
    expect(a).toMatchObject({
      draws: 5,
      completed: 4,
      found: 3,
      notFound: 1,
      unfinished: 1,
      notFoundPct: 25,
      meanGuessesCompleted: 1.5,
    });
    expect(a.meanGuessesFound).toBeCloseTo(4 / 3);
    expect(a.occurrencePct).toBeCloseTo(500 / 11);
    expect(a.expectedDraws).toBeCloseTo(11 / 3);
    expect(b.notFoundPct).toBeCloseTo(200 / 3);
    expect(b.meanGuessesFound).toBe(2);
    expect(c).toMatchObject({
      draws: 3,
      completed: 1,
      found: 0,
      notFound: 1,
      unfinished: 2,
      meanGuessesFound: null,
      meanProbesFound: null,
      meanGuessesCompleted: 0,
      notFoundPct: 100,
    });
    expect(
      s.countries.reduce((n, f) => n + (f.occurrencePct ?? 0), 0),
    ).toBeCloseTo(100);
    expect(s.histogram).toEqual([
      { guesses: 0, found: 0, notFound: 1 },
      { guesses: 1, found: 2, notFound: 1 },
      { guesses: 2, found: 2, notFound: 2 },
    ]);
  } finally {
    stats.close();
  }
});
it("vittorie per metodo e probabilità condizionate sul vincitore della mano", () => {
  const stats = new Statistics(":memory:", catalog);
  try {
    dataset(stats);
    const s = stats.summary();
    expect(s.methods.all).toEqual({
      wins: 5,
      probe: 3,
      definitive: 1,
      opponentWrong: 1,
      probePct: 60,
      definitivePct: 20,
      opponentWrongPct: 20,
    });
    expect(s.methods.first).toEqual({
      wins: 2,
      probe: 1,
      definitive: 1,
      opponentWrong: 0,
      probePct: 50,
      definitivePct: 50,
      opponentWrongPct: 0,
    });
    expect(s.methods.second).toEqual({
      wins: 2,
      probe: 1,
      definitive: 0,
      opponentWrong: 1,
      probePct: 50,
      definitivePct: 0,
      opponentWrongPct: 50,
    });
    // La seconda mano è iniziata dal secondo membro della stanza: resta G1.
    expect(
      stats.rounds().rows.filter((r) => r.first_room_seat === 2)[0]
        .winner_order,
    ).toBe(1);
    const solo = stats.summary({ mode: "solo" });
    expect(solo.totals.decisivePvp).toBe(0);
    expect(solo.totals.winsFirstPct).toBeNull();
    expect(solo.methods.first.probePct).toBeNull();
  } finally {
    stats.close();
  }
});
it("classifica esplicita: tutte le scelte, sonde, definitive e aperture hanno denominatori distinti", () => {
  const stats = new Statistics(":memory:", catalog);
  try {
    dataset(stats);
    const s = stats.summary();
    expect(s.selections[0]).toMatchObject({
      code: "cc",
      probes: 4,
      definitives: 1,
      total: 5,
      probePct: 40,
      definitivePct: 50,
    });
    expect(s.selections[0].totalPct).toBeCloseTo(500 / 12);
    expect(s.selections.reduce((n, r) => n + r.probes, 0)).toBe(10);
    expect(s.selections.reduce((n, r) => n + r.definitives, 0)).toBe(2);
    expect(s.selections.reduce((n, r) => n + (r.totalPct ?? 0), 0)).toBeCloseTo(
      100,
    );
    expect(s.openings[0]).toMatchObject({ code: "cc", uses: 4, pct: 50 });
  } finally {
    stats.close();
  }
});
it("filtri esatti separano modalità, esperimenti, tolleranza, limite, versione e date", () => {
  const stats = new Statistics(":memory:", catalog);
  try {
    dataset(stats);
    const both = stats.summary({ mode: "pvp", experiment: "both" });
    expect(both.totals.draws).toBe(1);
    expect(both.totals.agreedDraws).toBe(1);
    expect(both.configurations.length).toBeGreaterThan(1);
    expect(stats.summary({ mode: "solo" }).totals.draws).toBe(2);
    expect(stats.summary({ maxProbes: null }).totals.draws).toBe(1);
    expect(stats.summary({ maxProbes: 2 }).totals.draws).toBe(1);
    expect(stats.summary({ tolerance: 0.1 }).totals.draws).toBe(0);
    expect(
      stats.summary({ catalogVersion: "0000000000000000" }).totals.draws,
    ).toBe(0);
    expect(stats.summary({ from: "2026-11-02" }).totals.draws).toBe(0);
    expect(stats.summary({ to: "2026-11-01" }).totals.draws).toBe(11);
    const g = game(stats); // una nuova mano standard non cambia i dati degli esperimenti
    expect(stats.summary({ experiment: "both" }).totals.draws).toBe(1);
    expect(g.mode).toBe("pvp");
  } finally {
    stats.close();
  }
});
it("DB vuoto: dati mancanti sono null, tutte le bandiere restano consultabili", () => {
  const stats = new Statistics(":memory:", catalog);
  try {
    const s = stats.summary();
    expect(s.totals.draws).toBe(0);
    expect(s.totals.notFoundPct).toBeNull();
    expect(s.totals.meanGuessesFound).toBeNull();
    expect(s.totals.medianGuessesFound).toBeNull();
    expect(s.countries).toHaveLength(3);
    expect(
      s.countries.every(
        (c) =>
          c.draws === 0 &&
          c.occurrencePct === null &&
          c.meanGuessesFound === null,
      ),
    ).toBe(true);
    expect(s.selections).toEqual([]);
    expect(s.openings).toEqual([]);
  } finally {
    stats.close();
  }
});
it("registrazione idempotente, comandi respinti esclusi e ricostruzione della sequenza", () => {
  const stats = new Statistics(":memory:", catalog);
  try {
    const g = game(stats);
    const move = action(stats, g, "probe", { country: "bb" });
    g.command(move.id, move.command);
    stats.observe(g, move.id, move.command, {
      version: g.version,
      round: g.round,
      phase: g.phase,
    });
    expect(() => action(stats, g, "probe", { country: "cc" })).toThrow();
    action(stats, g, "solve", { country: "aa" });
    const row = stats.rounds().rows[0],
      detail = stats.detail(row.id)!;
    expect(row).toMatchObject({
      guesses_count: 2,
      probes_count: 1,
      definitive_count: 1,
      found: 1,
      outcome: "solve_correct",
    });
    expect(detail.moves.map((m) => [m.kind, m.country, m.correct])).toEqual([
      ["probe", "bb", 0],
      ["solve", "aa", 1],
    ]);
    expect(stats.detail("not-existing")).toBeNull();
  } finally {
    stats.close();
  }
});
it("G1 ruota a ogni mano; la risposta definitiva sbagliata registra chi perde", () => {
  const stats = new Statistics(":memory:", catalog);
  try {
    const g = game(stats);
    action(stats, g, "probe", { country: "aa" });
    for (const p of g.players) action(stats, g, "ready", {}, p.id);
    expect(stats.rounds().total).toBe(2);
    action(stats, g, "probe", { country: "bb" });
    action(stats, g, "solve", { country: "cc" });
    const r = stats.rounds().rows.find((r) => r.round_no === 2)!;
    expect(r).toMatchObject({
      first_room_seat: 2,
      winner_order: 2,
      solver_order: 1,
      outcome: "solve_wrong",
      found: 0,
    });
  } finally {
    stats.close();
  }
});
it("file SQLite persiste, URL stabile, recupero delle interruzioni e codici stanza riusati non collidono", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "flag-duel-stats-")),
    filename = path.join(directory, "stats.sqlite");
  let stats = new Statistics(filename, catalog);
  const address = stats.accessPath;
  try {
    const a = game(stats);
    action(stats, a, "probe", { country: "bb" });
    stats.close();
    stats = new Statistics(filename, catalog);
    expect(stats.accessPath).toBe(address);
    expect(stats.rounds().rows[0].status).toBe("in_progress");
    stats.recoverInterrupted();
    expect(stats.rounds().rows[0].status).toBe("interrupted");
    expect(stats.detail(stats.rounds().rows[0].id)!.moves).toHaveLength(1);
    const b = game(stats);
    action(stats, b, "probe", { country: "aa" });
    expect(stats.rounds().total).toBe(2);
    expect(new Set(stats.rounds().rows.map((r) => r.game_id)).size).toBe(2);
  } finally {
    stats.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
it("query e date malformate sono respinte prima di eseguire SQL", () => {
  for (const query of [
    { mode: "pvp' OR 1=1--" },
    { mode: ["solo", "pvp"] },
    { from: "2026-02-30" },
    { from: "2026-11-03", to: "2026-11-01" },
    { page: "0" },
    { page: "2.5" },
    { tolerance: ".04" },
    { maxProbes: "0" },
    { extra: "unexpected" },
  ])
    expect(statsQuerySchema.safeParse(query).success).toBe(false);
  expect(
    statsQuerySchema.safeParse({
      mode: "solo",
      experiment: "both",
      tolerance: "0.04",
      maxProbes: "unlimited",
      from: "2024-02-29",
    }).success,
  ).toBe(true);
});

it("le otto configurazioni di gioco restano distinte, comprese le opzioni indipendenti", () => {
  const stats = new Statistics(":memory:", catalog);
  try {
    for (const mode of ["pvp", "solo"] as const)
      for (const experiment of [
        "standard",
        "color_shift",
        "no_memory",
        "both",
      ] as const) {
        const g = new Game(
          "ABC",
          catalog,
          defaults,
          () => 0,
          () => 0,
        );
        g.add("A");
        if (mode === "pvp") g.add("B");
        else action(stats, g, "set_mode", { mode });
        action(stats, g, "set_experiments", {
          experiments: {
            colorShift: experiment === "color_shift" || experiment === "both",
            noMemory: experiment === "no_memory" || experiment === "both",
          },
        });
        action(stats, g, "set_tolerance", { tolerance: "broad" });
        action(stats, g, "start");
        action(stats, g, "probe", { country: "aa" });
        const filtered = stats.summary({ mode, experiment, tolerance: 0.1 });
        expect(filtered.totals.completed).toBe(1);
        expect(filtered.totals.found).toBe(1);
        expect(filtered.totals.meanGuessesFound).toBe(1);
      }
    expect(stats.summary().configurations).toHaveLength(8);
    expect(stats.summary({ tolerance: 0.04 }).totals.draws).toBe(0);
  } finally {
    stats.close();
  }
});

it("uno schema futuro non viene aperto o retrocesso", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "flag-duel-schema-")),
    filename = path.join(directory, "future.sqlite");
  try {
    const stats = new Statistics(filename, catalog);
    stats.db.exec("PRAGMA user_version=2");
    stats.close();
    expect(() => new Statistics(filename, catalog)).toThrow("non supportata");
    const db = new DatabaseSync(filename);
    expect(db.prepare("PRAGMA user_version").get()!.user_version).toBe(2);
    db.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
