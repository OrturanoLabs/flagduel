import { z } from "zod";
export const commandSchema = z
  .object({
    type: z.enum([
      "create",
      "join",
      "resume",
      "start",
      "probe",
      "solve",
      "pass",
      "ready",
    ]),
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
      .regex(/^[a-z]{2}$/)
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
export interface Snapshot {
  code: string;
  version: number;
  phase: "waiting" | "playing" | "between_rounds";
  hostId: string;
  players: Player[];
  round: number;
  active: string;
  subphase: "choose_probe" | "choose_action";
  reveal: Region[];
  history: { country: string; playerId: string; reveal: Region[] }[];
  results: Result[];
  solution?: string;
  maxProbes: number;
  turn: number;
}
export interface Ack {
  ok: boolean;
  error?: string;
  token?: string;
  playerId?: string;
  state?: Snapshot;
}
