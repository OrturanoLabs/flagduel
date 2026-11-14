import { area, oklab, delta } from "../packages/flag-engine/src/index";
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
function soloGame(maxProbes = 3) {
  const g = new Game(
    "SOL",
    catalog,
    { ...defaults, maxProbes },
    () => 0,
    () => 0,
  );
  const p = g.add("Ada");
  g.command(p.id, {
    type: "set_mode",
    mode: "solo",
    version: g.version,
    actionId: "solo-mode-" + ++seq,
  });
  act(g, "start");
  return g;
}
it("singolo: un giocatore, tentativi diretti e sconfitta automatica al limite", () => {
  const g = soloGame();
  const id = g.hostId;
  expect(g.snapshot().mode).toBe("solo");
  expect(g.players).toHaveLength(1);
  for (let i = 1; i <= 3; i++) {
    act(g, "probe", catalog[i].code);
    expect(g.history).toHaveLength(i);
    expect(g.active).toBe(id);
    if (i < 3) {
      expect(g.phase).toBe("playing");
      expect(g.subphase).toBe("choose_probe");
      expect(g.snapshot().solution).toBeUndefined();
    }
  }
  expect(g.phase).toBe("between_rounds");
  expect(g.results[0]).toEqual({
    country: catalog[0].code,
    winner: null,
    reason: "Tentativi esauriti",
  });
  expect(g.players[0].score).toBe(0);
  expect(() => act(g, "probe", catalog[0].code)).toThrow();
  act(g, "ready");
  expect(g.round).toBe(2);
  expect(g.history).toHaveLength(0);
  expect(g.active).toBe(id);
});
it("singolo: soluzione corretta nell’ultimo tentativo vince, punteggio cumulativo", () => {
  const g = soloGame();
  act(g, "probe", catalog[1].code);
  act(g, "probe", catalog[2].code);
  act(g, "probe", catalog[0].code);
  expect(g.results[0].winner).toBe(g.hostId);
  expect(g.results[0].reason).toBe("Risposta corretta");
  expect(g.players[0].score).toBe(1);
  act(g, "ready");
  act(g, "probe", catalog[0].code);
  expect(g.players[0].score).toBe(2);
});
it("singolo: niente ospiti, Passa/Risolvi o cambio modalità durante la partita", () => {
  const g = new Game("SOL", catalog);
  const host = g.add("Ada");
  g.command(host.id, {
    type: "set_mode",
    mode: "solo",
    version: g.version,
    actionId: "solo-lobby-action",
  });
  expect(() => g.add("Intruso")).toThrow("singolo");
  act(g, "start");
  expect(() => act(g, "pass")).toThrow("In singolo");
  expect(() => act(g, "solve", catalog[0].code)).toThrow("In singolo");
  expect(() =>
    g.command(host.id, {
      type: "set_mode",
      mode: "pvp",
      version: g.version,
      actionId: "mode-during-game",
    }),
  ).toThrow("lobby");
  expect(() => g.add("Intruso")).toThrow("singolo");
  expect(g.history).toHaveLength(0);
});
it("modalità nella lobby: solo il creatore, niente singolo con due giocatori", () => {
  const g = new Game("SOL", catalog),
    host = g.add("Ada"),
    guest = g.add("Bruno");
  expect(() =>
    g.command(guest.id, {
      type: "set_mode",
      mode: "solo",
      version: g.version,
      actionId: "guest-set-mode",
    }),
  ).toThrow("Solo il creatore");
  expect(() =>
    g.command(host.id, {
      type: "set_mode",
      mode: "solo",
      version: g.version,
      actionId: "host-two-players",
    }),
  ).toThrow("un solo giocatore");
  expect(g.mode).toBe("pvp");
  const one = new Game("ONE", catalog),
    owner = one.add("Ada");
  one.command(owner.id, {
    type: "set_mode",
    mode: "solo",
    version: one.version,
    actionId: "switch-to-solo",
  });
  one.command(owner.id, {
    type: "set_mode",
    mode: "pvp",
    version: one.version,
    actionId: "switch-back-pvp",
  });
  expect(one.add("Bruno")).toBeDefined();
  act(one, "start", undefined, owner.id);
  expect(one.mode).toBe("pvp");
  expect(one.phase).toBe("playing");
});
it("singolo: doppio invio e Paese già usato non consumano altri tentativi", () => {
  const g = soloGame();
  const command: Command = {
    type: "probe",
    country: catalog[1].code,
    version: g.version,
    actionId: "solo-duplicate-action",
  };
  g.command(g.hostId, command);
  const version = g.version;
  g.command(g.hostId, command);
  expect(g.version).toBe(version);
  expect(g.history).toHaveLength(1);
  expect(() => act(g, "probe", catalog[1].code)).toThrow(
    "Sonda non consentita",
  );
  expect(g.history).toHaveLength(1);
});

it("tolleranza: autorizzazioni, isolamento tra stanze e persistenza tra mani", () => {
  const g = new Game("ABC", catalog),
    other = new Game("DEF", catalog);
  const host = g.add("Ada"),
    guest = g.add("Bruno");
  const set = (id: string, tolerance?: Command["tolerance"]) =>
    g.command(id, {
      type: "set_tolerance",
      tolerance,
      version: g.version,
      actionId: "tolerance-" + ++seq,
    });
  expect(g.snapshot().tolerance).toBe("standard");
  expect(() => set(guest.id, "broad")).toThrow("Solo il creatore");
  expect(() => set(host.id)).toThrow("valida");
  set(host.id, "broad");
  expect(g.snapshot().tolerance).toBe("broad");
  expect(other.snapshot().tolerance).toBe("standard");
  expect(defaults.tolerance).toBe(0.04);
  act(g, "start");
  expect(() => set(host.id, "precise")).toThrow("lobby");
  act(g, "probe", g.secret);
  expect(() => set(host.id, "standard")).toThrow("lobby");
  act(g, "ready", undefined, host.id);
  act(g, "ready", undefined, guest.id);
  expect(g.snapshot().tolerance).toBe("broad");
});

it("tre tolleranze cambiano davvero le superfici SVG rivelate, in PvP e singolo", () => {
  for (const mode of ["pvp", "solo"] as const) {
    for (const [tolerance, expected] of [
      ["precise", [0, 0, 0]],
      ["standard", [60000, 0, 0]],
      ["broad", [60000, 60000, 60000]],
    ] as const) {
      const flags: Flag[] = ["#ff0000", "#f00000", "#e60000", "#db0000"].map(
        (color, i) => ({
          code: ["aa", "bb", "cc", "dd"][i],
          name: "Fixture",
          en: "Fixture",
          svg: "",
          regions: [{ d: "M0 0H300V200H0Z", color, lab: oklab(color) }],
        }),
      );
      expect(
        delta(flags[0].regions[0].lab, flags[1].regions[0].lab),
      ).toBeGreaterThan(0.02);
      expect(
        delta(flags[0].regions[0].lab, flags[1].regions[0].lab),
      ).toBeLessThan(0.04);
      expect(
        delta(flags[0].regions[0].lab, flags[2].regions[0].lab),
      ).toBeGreaterThan(0.04);
      expect(
        delta(flags[0].regions[0].lab, flags[2].regions[0].lab),
      ).toBeLessThan(0.1);
      const g = new Game(
        "ABC",
        flags,
        defaults,
        () => 0,
        () => 0,
      );
      const host = g.add("Ada");
      if (mode === "pvp") g.add("Bruno");
      else
        g.command(host.id, {
          type: "set_mode",
          mode,
          version: g.version,
          actionId: "mode-" + ++seq,
        });
      g.command(host.id, {
        type: "set_tolerance",
        tolerance,
        version: g.version,
        actionId: "preset-" + ++seq,
      });
      act(g, "start");
      act(g, "probe", "bb");
      if (mode === "pvp") act(g, "pass");
      act(g, "probe", "cc");
      if (mode === "pvp") act(g, "pass");
      act(g, "probe", "dd");
      expect(
        delta(flags[0].regions[0].lab, flags[3].regions[0].lab),
      ).toBeGreaterThan(0.06);
      expect(
        delta(flags[0].regions[0].lab, flags[3].regions[0].lab),
      ).toBeLessThan(0.1);
      expect(
        g.history.map((h) =>
          area(h.reveal.map((r) => ({ ...r, lab: oklab(r.color) }))),
        ),
      ).toEqual(expected);
      expect(area(g.revealed)).toBeCloseTo(Math.max(...expected), 4);
    }
  }
});
