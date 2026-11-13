import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Game, defaults, type Flag } from "../apps/server/src/game";
import type { Command } from "../packages/shared/src/index";
const catalog: Flag[] = JSON.parse(
  readFileSync("assets/generated/catalog.json", "utf8"),
);
let seq = 0;
function setup(config = {}) {
  const g = new Game(
    "ABC",
    catalog,
    { ...defaults, ...config },
    () => 0,
    () => 0,
  );
  g.add("Ada");
  g.add("Bruno");
  act(g, "start");
  return g;
}
function act(
  g: Game,
  type: Command["type"],
  country?: string,
  id = g.active || g.players[0].id,
) {
  g.command(
    id,
    { type, country, version: g.version, actionId: "action-" + ++seq },
    100,
  );
}
it("mani illimitate: alternanza e punteggio conservati oltre la quinta", () => {
  const g = setup();
  for (let n = 1; n <= 12; n++) {
    expect(g.active).toBe(g.players[(n - 1) % 2].id);
    act(g, "probe", catalog[0].code);
    expect(g.phase).toBe("between_rounds");
    expect(g.results).toHaveLength(n);
    act(g, "ready", undefined, g.players[0].id);
    act(g, "ready", undefined, g.players[1].id);
  }
  expect(g.round).toBe(13);
  expect(g.players.map((p) => p.score)).toEqual([6, 6]);
});
it("solo il creatore può avviare anche dopo il rientro", () => {
  const g = new Game("ABC", catalog);
  const host = g.add("Ada"),
    guest = g.add("Bruno");
  expect(g.snapshot().hostId).toBe(host.id);
  expect(() => act(g, "start", undefined, guest.id)).toThrow(
    "Solo il creatore",
  );
  expect(g.phase).toBe("waiting");
  act(g, "start", undefined, host.id);
  expect(g.phase).toBe("playing");
});
it("risposta errata/corretta, sottofasi, turno e deduplicazione", () => {
  const g = setup();
  expect(() => act(g, "solve", catalog[0].code)).toThrow();
  expect(() => act(g, "probe", catalog[1].code, g.players[1].id)).toThrow();
  const c: Command = {
    type: "probe",
    country: catalog[1].code,
    version: g.version,
    actionId: "unique-action",
  };
  g.command(g.active, c, 100);
  const version = g.version;
  g.command(g.active, c, 100);
  expect(g.version).toBe(version);
  act(g, "solve", catalog[1].code);
  expect(g.players[1].score).toBe(1);
  const h = setup();
  act(h, "probe", catalog[1].code);
  act(h, "solve", catalog[0].code);
  expect(h.players[0].score).toBe(1);
});
it("sei sonde: si può risolvere dopo l'ultima, passare pareggia", () => {
  const h = setup();
  for (let i = 1; i <= 6; i++) {
    act(h, "probe", catalog[i].code);
    expect(h.phase).toBe("playing");
    act(h, "pass");
  }
  expect(h.results[0].reason).toContain("sonde");
  const k = setup({ maxProbes: 1 });
  act(k, "probe", catalog[1].code);
  act(k, "solve", catalog[0].code);
  expect(k.results[0].winner).toBe(k.players[0].id);
});
it("non espone segreta e bandiere identiche con codici diversi non vincono", () => {
  const g = new Game(
    "ABC",
    [catalog[0], { ...catalog[0], code: "xx" }],
    defaults,
    () => 0,
    () => 0,
  );
  g.add("A");
  g.add("B");
  act(g, "start");
  act(g, "probe", "xx");
  const s = g.snapshot();
  expect(s.phase).toBe("playing");
  expect(s.solution).toBeUndefined();
  const values = (v: unknown): unknown[] =>
    v && typeof v === "object" ? Object.values(v).flatMap(values) : [v];
  expect(values(s)).not.toContain(catalog[0].code);
  expect(s).not.toHaveProperty("secret");
  expect(s).not.toHaveProperty("catalog");
  expect(s.history[0].country).toBe("xx");
});
it("nessun timeout: anche un'azione dopo un giorno resta valida, le versioni obsolete no", () => {
  const g = setup(),
    id = g.active;
  const old = g.version;
  g.command(
    id,
    {
      type: "probe",
      country: catalog[1].code,
      actionId: "no-timeout-action",
      version: old,
    },
    100 + 86400000,
  );
  expect(g.active).toBe(id);
  expect(g.subphase).toBe("choose_action");
  expect(g.snapshot()).not.toHaveProperty("deadline");
  expect(() =>
    g.command(id, { type: "pass", actionId: "stale-action", version: old }),
  ).toThrow("Stato aggiornato");
});
