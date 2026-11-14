import { z } from "zod";
export const colorTolerances = {
  precise: 0.02,
  standard: 0.04,
  broad: 0.1,
} as const;
export const catalogSetSchema = z.enum(["world", "italian_regions"]);
export type CatalogSet = z.infer<typeof catalogSetSchema>;
export type ColorTolerance = keyof typeof colorTolerances;
export const experimentsSchema = z
  .object({
    colorShift: z.boolean(),
    noMemory: z.boolean(),
  })
  .strict();
export type Experiments = z.infer<typeof experimentsSchema>;
export const commandSchema = z
  .object({
    type: z.enum([
      "create",
      "join",
      "resume",
      "start",
      "set_mode",
      "set_catalog",
      "set_tolerance",
      "set_experiments",
      "probe",
      "solve",
      "pass",
      "ready",
      "draw",
      "decline_draw",
    ]),
    catalogSet: catalogSetSchema.optional(),
    experiments: experimentsSchema.optional(),
    tolerance: z.enum(["precise", "standard", "broad"]).optional(),
    mode: z.enum(["pvp", "solo"]).optional(),
    nickname: z.string().trim().min(1).max(24).optional(),
    code: z
      .string()
      .regex(/^[A-Z0-9]{3}$/)
      .optional(),
    token: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    country: z
      .string()
      .regex(/^(?:[a-z]{2}|it-[0-9]{2})$/)
      .optional(),
    actionId: z.string().min(8).max(80),
    version: z.number().int().nonnegative().optional(),
  })
  .strict();
export type Command = z.infer<typeof commandSchema>;
export interface Player {
  id: string;
  nickname: string;
  connected: boolean;
  score: number;
  ready: boolean;
}
export interface Region {
  d: string;
  color: string;
}
export interface Result {
  country: string;
  winner: string | null;
  reason: string;
}
export type GameMode = "pvp" | "solo";
export interface Snapshot {
  mode: GameMode;
  catalogSet: CatalogSet;
  experiments: Experiments;
  tolerance: ColorTolerance;
  code: string;
  version: number;
  phase: "waiting" | "playing" | "between_rounds";
  hostId: string;
  players: Player[];
  round: number;
  active: string;
  drawOffer: string | null;
  subphase: "choose_probe" | "choose_action";
  reveal: Region[];
  history: { country: string; playerId: string; reveal: Region[] }[];
  results: Result[];
  solution?: string;
  maxProbes: number | null;
  turn: number;
}
export interface Ack {
  ok: boolean;
  error?: string;
  token?: string;
  playerId?: string;
  state?: Snapshot;
}
