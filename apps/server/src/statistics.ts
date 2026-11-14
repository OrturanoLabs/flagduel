import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import {
  colorTolerances,
  type Command,
} from "../../../packages/shared/src/index";
import type {
  CountryStats,
  MethodStats,
  StatsFilters,
  StatsMove,
  StatsRound,
  StatsRoundPage,
  StatsSummary,
} from "../../../packages/shared/src/statistics";
import type { Flag, Game } from "./game";

export const percent = (n: number, d: number): number | null =>
  d ? (n / d) * 100 : null;
const averages = (rows: { guesses: number; found: number }[]) => {
  const total = rows.reduce((n, r) => n + r.found, 0);
  if (!total) return null;
  const middle = [Math.floor((total - 1) / 2), Math.floor(total / 2)];
  let consumed = 0;
  const values: number[] = [];
  for (const row of rows) {
    for (const p of middle)
      if (p >= consumed && p < consumed + row.found) values.push(row.guesses);
    consumed += row.found;
  }
  return values.reduce((n, x) => n + x, 0) / 2;
};
export interface ObservedState {
  version: number;
  round: number;
  phase: Game["phase"];
}
export class Statistics {
  readonly db: DatabaseSync;
  readonly accessPath: string;
  private readonly catalogVersion: string;
  private readonly gameIds = new WeakMap<Game, string>();
  writeErrors = 0;
  constructor(
    readonly filename: string,
    catalog: Flag[],
    key?: string,
  ) {
    if (filename !== ":memory:")
      mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
    this.db = new DatabaseSync(filename);
    const schemaVersion = (
      this.db.prepare("PRAGMA user_version").get() as { user_version: number }
    ).user_version;
    if (schemaVersion > 1) {
      this.db.close();
      throw Error(
        "Versione del database statistiche non supportata: " + schemaVersion,
      );
    }

    this.db
      .exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS flags(code TEXT PRIMARY KEY,name TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS catalog_entries(version TEXT NOT NULL,code TEXT NOT NULL,PRIMARY KEY(version,code)) STRICT;
      CREATE TABLE IF NOT EXISTS rounds(
        id TEXT PRIMARY KEY,game_id TEXT NOT NULL,round_no INTEGER NOT NULL,
        started_at INTEGER NOT NULL,ended_at INTEGER,status TEXT NOT NULL CHECK(status IN ('in_progress','completed','abandoned','interrupted')),
        mode TEXT NOT NULL CHECK(mode IN ('pvp','solo')),color_shift INTEGER NOT NULL,no_memory INTEGER NOT NULL,
        tolerance REAL NOT NULL,max_probes INTEGER,catalog_version TEXT NOT NULL,catalog_size INTEGER NOT NULL,
        secret TEXT NOT NULL,first_room_seat INTEGER NOT NULL,winner_order INTEGER,solver_order INTEGER,
        outcome TEXT CHECK(outcome IN ('probe_correct','solve_correct','solve_wrong','probe_limit','draw')),
        found INTEGER,probes_count INTEGER NOT NULL DEFAULT 0,definitive_count INTEGER NOT NULL DEFAULT 0,guesses_count INTEGER NOT NULL DEFAULT 0,
        UNIQUE(game_id,round_no)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS moves(
        round_id TEXT NOT NULL REFERENCES rounds(id),seq INTEGER NOT NULL,action_id TEXT NOT NULL,
        kind TEXT NOT NULL,country TEXT,actor_order INTEGER NOT NULL,correct INTEGER,at INTEGER NOT NULL,
        PRIMARY KEY(round_id,seq),UNIQUE(round_id,action_id)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS rounds_filters ON rounds(mode,color_shift,no_memory,tolerance,max_probes,catalog_version,started_at);
      CREATE INDEX IF NOT EXISTS rounds_country ON rounds(secret,status);
      PRAGMA user_version=1;
    `);
    this.catalogVersion = createHash("sha256")
      .update(catalog.map((f) => `${f.code}:${f.svg}`).join("\n"))
      .digest("hex")
      .slice(0, 16);
    this.db.exec("BEGIN");
    try {
      const insert = this.db.prepare(
        "INSERT INTO flags(code,name) VALUES(?,?) ON CONFLICT(code) DO UPDATE SET name=excluded.name",
      );
      const entry = this.db.prepare(
        "INSERT OR IGNORE INTO catalog_entries(version,code) VALUES(?,?)",
      );
      for (const flag of catalog) {
        insert.run(flag.code, flag.name);
        entry.run(this.catalogVersion, flag.code);
      }
      const saved = this.db
        .prepare("SELECT value FROM metadata WHERE key='access_key'")
        .get() as { value: string } | undefined;
      const selected = key || saved?.value || randomBytes(20).toString("hex");
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(selected))
        throw Error("STATS_KEY deve avere 1–100 caratteri alfanumerici, _ o -");
      this.db
        .prepare(
          "INSERT INTO metadata(key,value) VALUES('access_key',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .run(selected);
      this.accessPath = `/insights/${selected}`;
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      this.db.close();
      throw error;
    }
  }
  recoverInterrupted(now = Date.now()) {
    this.db
      .prepare(
        "UPDATE rounds SET status='interrupted',ended_at=? WHERE status='in_progress'",
      )
      .run(now);
  }
  observe(
    game: Game,
    actor: string,
    command: Command,
    before: ObservedState,
    now = Date.now(),
  ) {
    if (game.version === before.version || game.round === 0) return;
    const fresh = game.round !== before.round;
    if (
      !fresh &&
      !["probe", "solve", "pass", "draw", "decline_draw"].includes(command.type)
    )
      return;
    let gameId = this.gameIds.get(game);
    if (!gameId) {
      gameId = randomBytes(16).toString("hex");
      this.gameIds.set(game, gameId);
    }
    const roundId = `${gameId}:${game.round}`;
    const firstSeat = (game.first + game.round - 1) % game.players.length;
    const firstId = game.players[firstSeat].id;
    const order = (id: string) => (id === firstId ? 1 : 2);
    const maxProbes = game.experimental ? null : game.config.maxProbes;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO rounds(id,game_id,round_no,started_at,status,mode,color_shift,no_memory,tolerance,max_probes,catalog_version,catalog_size,secret,first_room_seat)
        VALUES(?,?,?,?,'in_progress',?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          roundId,
          gameId,
          game.round,
          now,
          game.mode,
          +game.experiments.colorShift,
          +game.experiments.noMemory,
          colorTolerances[game.tolerance],
          maxProbes,
          this.catalogVersion,
          game.catalog.length,
          game.secret,
          firstSeat + 1,
        );
      if (!fresh) {
        const country =
          command.type === "probe" || command.type === "solve"
            ? command.country!
            : null;
        this.db
          .prepare(
            `INSERT OR IGNORE INTO moves(round_id,seq,action_id,kind,country,actor_order,correct,at)
          SELECT ?,COALESCE(MAX(seq),0)+1,?,?,?,?,?,? FROM moves WHERE round_id=?`,
          )
          .run(
            roundId,
            command.actionId,
            command.type,
            country,
            order(actor),
            country === null ? null : +(country === game.secret),
            now,
            roundId,
          );
      }
      this.db
        .prepare(
          `UPDATE rounds SET probes_count=(SELECT COUNT(*) FROM moves WHERE round_id=? AND kind='probe'),
        definitive_count=(SELECT COUNT(*) FROM moves WHERE round_id=? AND kind='solve'),
        guesses_count=(SELECT COUNT(*) FROM moves WHERE round_id=? AND kind IN ('probe','solve')) WHERE id=?`,
        )
        .run(roundId, roundId, roundId, roundId);
      if (game.phase === "between_rounds" && before.phase === "playing") {
        const result = game.results.at(-1)!;
        const outcome: StatsRound["outcome"] =
          result.reason === "Patta"
            ? "draw"
            : command.type === "solve"
              ? command.country === game.secret
                ? "solve_correct"
                : "solve_wrong"
              : result.winner
                ? "probe_correct"
                : "probe_limit";
        this.db
          .prepare(
            `UPDATE rounds SET status='completed',ended_at=?,winner_order=?,solver_order=?,outcome=?,found=? WHERE id=? AND status='in_progress' `,
          )
          .run(
            now,
            result.winner ? order(result.winner) : null,
            command.type === "solve" || outcome === "probe_correct"
              ? order(actor)
              : null,
            outcome,
            +(outcome === "probe_correct" || outcome === "solve_correct"),
            roundId,
          );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  abandon(game: Game, now = Date.now()) {
    const id = this.gameIds.get(game);
    if (id)
      this.db
        .prepare(
          "UPDATE rounds SET status='abandoned',ended_at=? WHERE game_id=? AND status='in_progress'",
        )
        .run(now, id);
  }
  private where(filters: StatsFilters) {
    const conditions: string[] = [],
      values: SQLInputValue[] = [];
    const add = (sql: string, value: SQLInputValue) => {
      conditions.push(sql);
      values.push(value);
    };
    if (filters.mode) add("r.mode=?", filters.mode);
    if (filters.experiment) {
      const flags = {
        standard: [0, 0],
        color_shift: [1, 0],
        no_memory: [0, 1],
        both: [1, 1],
      }[filters.experiment];
      add("r.color_shift=?", flags[0]);
      add("r.no_memory=?", flags[1]);
    }
    if (filters.tolerance !== undefined)
      add("r.tolerance=?", filters.tolerance);
    if (filters.maxProbes === null) conditions.push("r.max_probes IS NULL");
    else if (filters.maxProbes !== undefined)
      add("r.max_probes=?", filters.maxProbes);
    if (filters.catalogVersion)
      add("r.catalog_version=?", filters.catalogVersion);
    if (filters.from)
      add("r.started_at>=?", Date.parse(filters.from + "T00:00:00Z"));
    if (filters.to)
      add("r.started_at<?", Date.parse(filters.to + "T00:00:00Z") + 86400000);
    return {
      sql: conditions.length ? conditions.join(" AND ") : "1=1",
      values,
    };
  }
  summary(filters: StatsFilters = {}): StatsSummary {
    const { sql, values } = this.where(filters);
    const aggregate = this.db
      .prepare(
        `SELECT COUNT(*) draws,
      SUM(status='completed') completed,SUM(found=1 AND status='completed') found,
      SUM(found=0 AND status='completed') notFound,SUM(status='in_progress') inProgress,
      SUM(status='abandoned') abandoned,SUM(status='interrupted') interrupted,
      SUM(outcome='draw') agreedDraws,SUM(outcome='probe_limit') limitReached,SUM(outcome='solve_wrong') wrongDefinitives,
      AVG(CASE WHEN found=1 AND status='completed' THEN guesses_count END) meanGuessesFound,
      AVG(CASE WHEN found=1 AND status='completed' THEN probes_count END) meanProbesFound,
      AVG(CASE WHEN status='completed' THEN guesses_count END) meanGuessesCompleted,
      SUM(mode='pvp' AND status='completed') completedPvp,
      SUM(mode='pvp' AND winner_order IS NOT NULL AND status='completed') decisivePvp,
      SUM(mode='pvp' AND winner_order=1 AND status='completed') winsFirst,
      SUM(mode='pvp' AND winner_order=2 AND status='completed') winsSecond,
      SUM(mode='pvp' AND outcome='solve_wrong') pvpWrong,
      SUM(outcome IN ('solve_correct','solve_wrong')) definitiveAttempts
      FROM rounds r WHERE ${sql}`,
      )
      .get(...values) as Record<string, number | null>;
    const n = (key: string) => aggregate[key] ?? 0;
    const histogram = this.db
      .prepare(
        `SELECT guesses_count guesses,SUM(found=1) found,SUM(found=0) notFound FROM rounds r WHERE ${sql} AND status='completed' GROUP BY guesses_count ORDER BY guesses_count`,
      )
      .all(...values) as { guesses: number; found: number; notFound: number }[];
    const methods = (
      extra: string,
      params: SQLInputValue[] = [],
    ): MethodStats => {
      const row = this.db
        .prepare(
          `SELECT COUNT(*) wins,SUM(outcome='probe_correct') probe,SUM(outcome='solve_correct') definitive,SUM(outcome='solve_wrong') opponentWrong FROM rounds r WHERE ${sql} AND status='completed' AND winner_order IS NOT NULL ${extra}`,
        )
        .get(...values, ...params) as {
        wins: number;
        probe: number | null;
        definitive: number | null;
        opponentWrong: number | null;
      };
      return {
        wins: row.wins,
        probe: row.probe ?? 0,
        definitive: row.definitive ?? 0,
        opponentWrong: row.opponentWrong ?? 0,
        probePct: percent(row.probe ?? 0, row.wins),
        definitivePct: percent(row.definitive ?? 0, row.wins),
        opponentWrongPct: percent(row.opponentWrong ?? 0, row.wins),
      };
    };
    const rows = this.db
      .prepare(
        `SELECT f.code,f.name,COUNT(r.id) draws,SUM(r.status='completed') completed,SUM(r.found=1 AND r.status='completed') found,SUM(r.found=0 AND r.status='completed') notFound,
      SUM(r.status IN ('in_progress','abandoned','interrupted')) unfinished,
      AVG(CASE WHEN r.found=1 AND r.status='completed' THEN r.guesses_count END) meanGuessesFound,
      AVG(CASE WHEN r.found=1 AND r.status='completed' THEN r.probes_count END) meanProbesFound,
      AVG(CASE WHEN r.status='completed' THEN r.guesses_count END) meanGuessesCompleted
      FROM flags f LEFT JOIN rounds r ON r.secret=f.code AND (${sql}) GROUP BY f.code ORDER BY draws DESC,f.name`,
      )
      .all(...values) as unknown as CountryStats[];
    const expectations = this.db
      .prepare(
        `SELECT ce.code,SUM(sample.draws*1.0/sample.catalog_size) expectedDraws FROM (SELECT r.catalog_version,r.catalog_size,COUNT(*) draws FROM rounds r WHERE ${sql} GROUP BY r.catalog_version,r.catalog_size) sample JOIN catalog_entries ce ON ce.version=sample.catalog_version GROUP BY ce.code`,
      )
      .all(...values) as { code: string; expectedDraws: number }[];
    const expected = new Map(
      expectations.map((row) => [row.code, row.expectedDraws]),
    );
    const countries = rows.map((row) => ({
      ...row,
      completed: row.completed ?? 0,
      found: row.found ?? 0,
      notFound: row.notFound ?? 0,
      unfinished: row.unfinished ?? 0,
      occurrencePct: percent(row.draws, n("draws")),
      expectedDraws: expected.get(row.code) ?? 0,
      expectedOccurrencePct: percent(expected.get(row.code) ?? 0, n("draws")),
      notFoundPct: percent(row.notFound ?? 0, row.completed ?? 0),
    }));
    const openings = this.db
      .prepare(
        `SELECT m.country code,f.name,COUNT(*) uses FROM moves m JOIN rounds r ON r.id=m.round_id JOIN flags f ON f.code=m.country WHERE ${sql} AND m.kind='probe' AND m.seq=(SELECT MIN(m2.seq) FROM moves m2 WHERE m2.round_id=m.round_id AND m2.kind='probe') GROUP BY m.country ORDER BY uses DESC,f.name`,
      )
      .all(...values) as { code: string; name: string; uses: number }[];
    const openingTotal = openings.reduce((sum, row) => sum + row.uses, 0);
    const choices = this.db
      .prepare(
        `SELECT m.country code,f.name,SUM(m.kind='probe') probes,SUM(m.kind='solve') definitives,COUNT(*) total FROM moves m JOIN rounds r ON r.id=m.round_id JOIN flags f ON f.code=m.country WHERE ${sql} AND m.kind IN ('probe','solve') GROUP BY m.country ORDER BY total DESC,f.name`,
      )
      .all(...values) as {
      code: string;
      name: string;
      probes: number;
      definitives: number;
      total: number;
    }[];
    const choiceTotals = choices.reduce(
      (a, r) => ({
        probes: a.probes + r.probes,
        definitives: a.definitives + r.definitives,
        total: a.total + r.total,
      }),
      { probes: 0, definitives: 0, total: 0 },
    );
    const selections = choices.map((r) => ({
      ...r,
      probePct: percent(r.probes, choiceTotals.probes),
      definitivePct: percent(r.definitives, choiceTotals.definitives),
      totalPct: percent(r.total, choiceTotals.total),
    }));
    const configurations = this.db
      .prepare(
        `SELECT mode,color_shift colorShift,no_memory noMemory,tolerance,max_probes maxProbes,catalog_version catalogVersion,catalog_size catalogSize,COUNT(*) draws,SUM(status='completed') completed FROM rounds GROUP BY mode,color_shift,no_memory,tolerance,max_probes,catalog_version,catalog_size ORDER BY mode,color_shift,no_memory,tolerance,max_probes`,
      )
      .all() as unknown as StatsSummary["configurations"];
    return {
      generatedAt: Date.now(),
      filters,
      totals: {
        draws: n("draws"),
        completed: n("completed"),
        found: n("found"),
        notFound: n("notFound"),
        inProgress: n("inProgress"),
        abandoned: n("abandoned"),
        interrupted: n("interrupted"),
        agreedDraws: n("agreedDraws"),
        limitReached: n("limitReached"),
        wrongDefinitives: n("wrongDefinitives"),
        notFoundPct: percent(n("notFound"), n("completed")),
        meanGuessesFound: aggregate.meanGuessesFound,
        meanProbesFound: aggregate.meanProbesFound,
        meanGuessesCompleted: aggregate.meanGuessesCompleted,
        medianGuessesFound: averages(histogram),
        completedPvp: n("completedPvp"),
        decisivePvp: n("decisivePvp"),
        winsFirst: n("winsFirst"),
        winsSecond: n("winsSecond"),
        winsFirstPct: percent(n("winsFirst"), n("completedPvp")),
        winsSecondPct: percent(n("winsSecond"), n("completedPvp")),
        winsFirstDecisivePct: percent(n("winsFirst"), n("decisivePvp")),
        winsSecondDecisivePct: percent(n("winsSecond"), n("decisivePvp")),
        wrongDefinitiveLossPct: percent(n("pvpWrong"), n("decisivePvp")),
        definitiveErrorPct: percent(
          n("wrongDefinitives"),
          n("definitiveAttempts"),
        ),
      },
      methods: {
        all: methods(""),
        first: methods("AND mode='pvp' AND winner_order=1"),
        second: methods("AND mode='pvp' AND winner_order=2"),
      },
      countries,
      histogram,
      openings: openings.map((row) => ({
        ...row,
        pct: percent(row.uses, openingTotal),
      })),
      selections,
      configurations: configurations.map((row) => ({
        ...row,
        colorShift: !!row.colorShift,
        noMemory: !!row.noMemory,
      })),
    };
  }
  rounds(filters: StatsFilters = {}, page = 1, pageSize = 25): StatsRoundPage {
    const { sql, values } = this.where(filters);
    const total = (
      this.db
        .prepare(`SELECT COUNT(*) count FROM rounds r WHERE ${sql}`)
        .get(...values) as { count: number }
    ).count;
    const rows = this.db
      .prepare(
        `SELECT * FROM rounds r WHERE ${sql} ORDER BY started_at DESC,id DESC LIMIT ? OFFSET ?`,
      )
      .all(
        ...values,
        pageSize,
        (page - 1) * pageSize,
      ) as unknown as StatsRound[];
    return { rows, total, page, pageSize };
  }
  detail(id: string): { round: StatsRound; moves: StatsMove[] } | null {
    const round = this.db
      .prepare("SELECT * FROM rounds WHERE id=?")
      .get(id) as unknown as StatsRound | undefined;
    if (!round) return null;
    return {
      round,
      moves: this.db
        .prepare(
          "SELECT seq,kind,country,actor_order,correct,at FROM moves WHERE round_id=? ORDER BY seq",
        )
        .all(id) as unknown as StatsMove[],
    };
  }
  close() {
    this.db.close();
  }
}
