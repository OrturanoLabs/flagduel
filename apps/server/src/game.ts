import { randomInt, randomBytes } from "node:crypto";
import type {
  Command,
  Player,
  Snapshot,
  Result,
} from "../../../packages/shared/src/index";
import { reveal, type Region } from "../../../packages/flag-engine/src/index";
export interface Flag {
  code: string;
  name: string;
  en: string;
  svg: string;
  regions: Region[];
}
export interface Config {
  maxProbes: number;
  tolerance: number;
}
export const defaults: Config = {
  maxProbes: 6,
  tolerance: 0.04,
};
export class Game {
  version = 0;
  phase: Snapshot["phase"] = "waiting";
  players: Player[] = [];
  round = 0;
  active = "";
  hostId = "";
  subphase: Snapshot["subphase"] = "choose_probe";
  history: Snapshot["history"] = [];
  results: Result[] = [];
  revealed: Region[] = [];
  secret = "";
  turn = 0;
  first = 0;
  seen = new Map<string, Set<string>>();
  touched = Date.now();
  constructor(
    public code: string,
    public catalog: Flag[],
    public config: Config = defaults,
    private choose: () => number = () => randomInt(catalog.length),
    private coin: () => number = () => randomInt(2),
  ) {}
  add(nickname: string) {
    if (this.players.length >= 2) throw Error("Stanza piena");
    const p = {
      id: randomBytes(12).toString("hex"),
      nickname,
      connected: true,
      score: 0,
      ready: false,
    };
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    this.version++;
    return p;
  }
  snapshot(): Snapshot {
    return {
      code: this.code,
      version: this.version,
      phase: this.phase,
      players: this.players.map((p) => ({ ...p })),
      round: this.round,
      hostId: this.hostId,
      active: this.active,
      subphase: this.subphase,
      reveal: this.revealed.map(({ d, color }) => ({ d, color })),
      history: this.history.map((h) => ({ ...h })),
      results: this.results.map((r) => ({ ...r })),
      ...(this.phase === "between_rounds" ? { solution: this.secret } : {}),
      maxProbes: this.config.maxProbes,
      turn: this.turn,
    };
  }
  next() {
    this.round++;
    this.secret = this.catalog[this.choose()].code;
    this.active = this.players[(this.first + this.round - 1) % 2].id;
    this.phase = "playing";
    this.subphase = "choose_probe";
    this.turn = 1;
    this.history = [];
    this.revealed = [];
    this.players.forEach((p) => (p.ready = false));
  }
  end(winner: string | null, reason: string) {
    if (winner) this.players.find((p) => p.id === winner)!.score++;
    this.results.push({ country: this.secret, winner, reason });
    this.phase = "between_rounds";
    this.players.forEach((p) => (p.ready = false));
  }
  pass() {
    if (this.history.length >= this.config.maxProbes)
      this.end(null, "Limite sonde raggiunto");
    else {
      this.active = this.players.find((p) => p.id !== this.active)!.id;
      this.subphase = "choose_probe";
      this.turn++;
    }
  }
  command(id: string, c: Command, now = Date.now()) {
    const p = this.players.find((x) => x.id === id);
    if (!p) throw Error("Sessione non autorizzata");
    const seen = this.seen.get(id) ?? new Set<string>();
    this.seen.set(id, seen);
    if (seen.has(c.actionId)) return;
    if (c.version !== this.version) throw Error("Stato aggiornato: riprova");
    if (c.type === "start") {
      if (id !== this.hostId)
        throw Error("Solo il creatore può avviare la partita");
      if (
        this.phase !== "waiting" ||
        this.players.length !== 2 ||
        this.players.some((x) => !x.connected)
      )
        throw Error("Servono due giocatori connessi");
      this.first = this.coin();
      this.next();
    } else if (c.type === "ready") {
      if (this.phase !== "between_rounds") throw Error("Fase non valida");
      p.ready = true;
      if (this.players.every((x) => x.ready)) this.next();
    } else {
      if (this.phase !== "playing" || id !== this.active)
        throw Error("Non è il tuo turno");
      const country = c.country;
      if (c.type === "probe" || c.type === "solve") {
        if (!this.catalog.some((f) => f.code === country))
          throw Error("Paese non valido");
      }
      if (c.type === "probe") {
        if (
          this.subphase !== "choose_probe" ||
          this.history.some((h) => h.country === country) ||
          this.history.length >= this.config.maxProbes
        )
          throw Error("Sonda non consentita");
        const matched = reveal(
          this.catalog.find((f) => f.code === country)!.regions,
          this.catalog.find((f) => f.code === this.secret)!.regions,
          [],
          this.config.tolerance,
        );
        this.history.push({
          country: country!,
          playerId: id,
          reveal: matched.map(({ d, color }) => ({ d, color })),
        });
        if (country === this.secret) this.end(id, "Sonda esatta");
        else {
          this.revealed = reveal(
            this.catalog.find((f) => f.code === country)!.regions,
            this.catalog.find((f) => f.code === this.secret)!.regions,
            this.revealed,
            this.config.tolerance,
          );
          this.subphase = "choose_action";
        }
      } else if (c.type === "pass") {
        if (this.subphase !== "choose_action")
          throw Error("Scegli prima una sonda");
        this.pass();
      } else if (c.type === "solve") {
        if (this.subphase !== "choose_action")
          throw Error("Scegli prima una sonda");
        this.end(
          country === this.secret
            ? id
            : this.players.find((x) => x.id !== id)!.id,
          country === this.secret ? "Risposta corretta" : "Risposta errata",
        );
      } else throw Error("Comando non valido");
    }
    seen.add(c.actionId);
    if (seen.size > 512) seen.delete(seen.values().next().value!);
    this.version++;
    this.touched = now;
  }
}
