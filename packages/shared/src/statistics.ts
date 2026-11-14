export interface StatsFilters {
  mode?: "pvp" | "solo";
  experiment?: "standard" | "color_shift" | "no_memory" | "both";
  tolerance?: number;
  maxProbes?: number | null;
  catalogVersion?: string;
  from?: string;
  to?: string;
}
export interface MethodStats {
  wins: number;
  probe: number;
  definitive: number;
  opponentWrong: number;
  probePct: number | null;
  definitivePct: number | null;
  opponentWrongPct: number | null;
}
export interface CountryStats {
  code: string;
  name: string;
  draws: number;
  occurrencePct: number | null;
  expectedDraws: number;
  expectedOccurrencePct: number | null;
  completed: number;
  found: number;
  notFound: number;
  unfinished: number;
  notFoundPct: number | null;
  meanGuessesFound: number | null;
  meanProbesFound: number | null;
  meanGuessesCompleted: number | null;
}
export interface StatsSummary {
  generatedAt: number;
  filters: StatsFilters;
  totals: {
    draws: number;
    completed: number;
    found: number;
    notFound: number;
    inProgress: number;
    abandoned: number;
    interrupted: number;
    agreedDraws: number;
    limitReached: number;
    wrongDefinitives: number;
    notFoundPct: number | null;
    meanGuessesFound: number | null;
    meanProbesFound: number | null;
    meanGuessesCompleted: number | null;
    medianGuessesFound: number | null;
    decisivePvp: number;
    completedPvp: number;
    winsFirst: number;
    winsSecond: number;
    winsFirstPct: number | null;
    winsSecondPct: number | null;
    winsFirstDecisivePct: number | null;
    winsSecondDecisivePct: number | null;
    wrongDefinitiveLossPct: number | null;
    definitiveErrorPct: number | null;
  };
  methods: { all: MethodStats; first: MethodStats; second: MethodStats };
  countries: CountryStats[];
  histogram: { guesses: number; found: number; notFound: number }[];
  openings: { code: string; name: string; uses: number; pct: number | null }[];
  selections: {
    code: string;
    name: string;
    probes: number;
    definitives: number;
    total: number;
    probePct: number | null;
    definitivePct: number | null;
    totalPct: number | null;
  }[];
  configurations: {
    mode: string;
    colorShift: boolean;
    noMemory: boolean;
    tolerance: number;
    maxProbes: number | null;
    catalogVersion: string;
    catalogSize: number;
    draws: number;
    completed: number;
  }[];
}
export interface StatsRound {
  id: string;
  game_id: string;
  round_no: number;
  started_at: number;
  ended_at: number | null;
  status: "in_progress" | "completed" | "abandoned" | "interrupted";
  mode: "pvp" | "solo";
  color_shift: number;
  no_memory: number;
  tolerance: number;
  max_probes: number | null;
  catalog_version: string;
  catalog_size: number;
  secret: string;
  first_room_seat: number;
  winner_order: number | null;
  solver_order: number | null;
  outcome:
    | "probe_correct"
    | "solve_correct"
    | "solve_wrong"
    | "probe_limit"
    | "draw"
    | null;
  found: number | null;
  probes_count: number;
  definitive_count: number;
  guesses_count: number;
}
export interface StatsMove {
  seq: number;
  kind: string;
  country: string | null;
  actor_order: number;
  correct: number | null;
  at: number;
}
export interface StatsRoundPage {
  rows: StatsRound[];
  total: number;
  page: number;
  pageSize: number;
}
