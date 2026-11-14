import { expect, it } from "vitest";
import { Game, defaults, type Flag } from "../apps/server/src/game";
import {
  randomColorShift,
  shiftColor,
  type ColorShift,
} from "../apps/server/src/color-shift";
import { area, oklab, preprocess } from "../packages/flag-engine/src/index";
import {
  commandSchema,
  type Command,
  type Experiments,
} from "../packages/shared/src/index";

const flag = (code: string, left: string, right: string): Flag => ({
  code,
  name: code,
  en: code,
  svg: "",
  regions: preprocess(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><path d="M0 0H150V200H0Z" fill="${left}"/><path d="M150 0H300V200H150Z" fill="${right}"/></svg>`,
  ),
});
const catalog = [
  flag("aa", "#ff0000", "#0000ff"),
  flag("ab", "#ff0000", "#00ff00"),
  flag("ac", "#00ff00", "#0000ff"),
  ...["ad", "ae", "af", "ag", "ah", "ai", "aj", "ak"].map((code) =>
    flag(code, "#00ff00", "#00ff00"),
  ),
];
const combinations: Experiments[] = [
  { colorShift: false, noMemory: false },
  { colorShift: true, noMemory: false },
  { colorShift: false, noMemory: true },
  { colorShift: true, noMemory: true },
];
let serial = 0;
function act(
  g: Game,
  type: Command["type"],
  args: Partial<Command> = {},
  id = g.active || g.hostId,
) {
  g.command(id, {
    type,
    ...args,
    version: g.version,
    actionId: `experimental-${++serial}`,
  });
}
function game(
  experiments: Experiments,
  mode: "pvp" | "solo" = "pvp",
  generate?: () => ColorShift,
) {
  const g = new Game(
    "ABC",
    catalog,
    defaults,
    () => 0,
    () => 0,
    generate ?? (() => ({ hue: 120, lightness: 0.04 })),
  );
  g.add("Ada");
  if (mode === "pvp") g.add("Bruno");
  else act(g, "set_mode", { mode });
  act(g, "set_experiments", { experiments });
  act(g, "start");
  return g;
}
const visibleArea = (g: Game) =>
  area(g.snapshot().reveal.map((r) => ({ ...r, lab: oklab(r.color) })));

it.each(combinations)(
  "geometria originale, accumulo e cronologia: %j",
  (experiments) => {
    const g = game(experiments);
    const untouched = JSON.stringify(catalog);
    act(g, "probe", { country: "ab" });
    expect(visibleArea(g)).toBeCloseTo(30000, 3);
    expect(g.revealed[0].color).toBe("#ff0000");
    expect(g.snapshot().reveal[0].color).toBe(
      experiments.colorShift
        ? shiftColor("#ff0000", g.roundColorShift!)
        : "#ff0000",
    );
    const beforePass = g.snapshot().reveal;
    act(g, "pass");
    expect(g.snapshot().reveal).toEqual(beforePass);
    act(g, "probe", { country: "ac" });
    expect(visibleArea(g)).toBeCloseTo(experiments.noMemory ? 30000 : 60000, 3);
    if (experiments.noMemory)
      expect(g.revealed.map((r) => r.color)).toEqual(["#0000ff"]);
    act(g, "pass");
    act(g, "probe", { country: "ad" });
    expect(visibleArea(g)).toBeCloseTo(experiments.noMemory ? 0 : 60000, 3);
    expect(g.snapshot().history.map((h) => h.country)).toEqual([
      "ab",
      "ac",
      "ad",
    ]);
    if (g.experimental)
      expect(g.snapshot().history.every((h) => h.reveal.length === 0)).toBe(
        true,
      );
    else expect(g.snapshot().history[0].reveal).not.toHaveLength(0);
    expect(g.snapshot().solution).toBeUndefined();
    expect(JSON.stringify(catalog)).toBe(untouched);
  },
);

for (const mode of ["pvp", "solo"] as const) {
  it.each(combinations)(
    `${mode}: limite normale o oltre sei tentativi: %j`,
    (experiments) => {
      const g = game(experiments, mode);
      expect(g.snapshot().maxProbes).toBe(g.experimental ? null : 6);
      const countries = catalog.slice(1, 10).map((f) => f.code);
      for (const [i, country] of countries.entries()) {
        if (!g.experimental && i >= 6) break;
        act(g, "probe", { country });
        expect(g.history).toHaveLength(i + 1);
        if (mode === "pvp") act(g, "pass");
      }
      if (g.experimental) {
        expect(g.phase).toBe("playing");
        expect(g.history).toHaveLength(9);
        expect(g.snapshot().history.map((h) => h.country)).toEqual(countries);
        expect(() => act(g, "probe", { country: countries[0] })).toThrow(
          "Sonda non consentita",
        );
        expect(g.history).toHaveLength(9);
        act(g, "probe", { country: "aa" });
        expect(g.phase).toBe("between_rounds");
        expect(g.players.find((p) => p.score === 1)).toBeDefined();
      } else {
        expect(g.phase).toBe("between_rounds");
        expect(g.history).toHaveLength(6);
        expect(g.results[0].winner).toBeNull();
      }
    },
  );
}

it("Color Shift è stabile nel round, viene rigenerato e termina con colori originali", () => {
  let generated = 0;
  const g = game({ colorShift: true, noMemory: true }, "pvp", () => ({
    hue: ++generated * 90,
    lightness: 0.02,
  }));
  expect(generated).toBe(1);
  const firstShift = { ...g.roundColorShift! };
  act(g, "probe", { country: "ab" });
  const shown = g.snapshot().reveal;
  expect(g.snapshot().reveal).toEqual(shown);
  act(g, "pass");
  expect(g.roundColorShift).toEqual(firstShift);
  expect(g.snapshot().reveal).toEqual(shown);
  act(g, "probe", { country: "ac" });
  expect(generated).toBe(1);
  act(g, "solve", { country: "aa" });
  expect(g.snapshot().solution).toBe("aa");
  expect(g.snapshot().reveal.map((r) => r.color)).toEqual(
    g.revealed.map((r) => r.color),
  );
  act(g, "ready", {}, g.players[0].id);
  act(g, "ready", {}, g.players[1].id);
  expect(generated).toBe(2);
  expect(g.roundColorShift).not.toEqual(firstShift);
  expect(g.snapshot().reveal).toEqual([]);
  expect(g.history).toEqual([]);
  expect(g.experiments).toEqual({ colorShift: true, noMemory: true });
});

it("opzioni indipendenti, solo host nella lobby e copie isolate", () => {
  const g = new Game("ABC", catalog),
    other = new Game("DEF", catalog);
  const host = g.add("Ada"),
    guest = g.add("Bruno");
  expect(() =>
    act(g, "set_experiments", { experiments: combinations[3] }, guest.id),
  ).toThrow("Solo il creatore");
  expect(() => act(g, "set_experiments")).toThrow("validi");
  for (const experiments of [...combinations, combinations[0]]) {
    act(g, "set_experiments", { experiments });
    expect(g.snapshot().experiments).toEqual(experiments);
    expect(g.snapshot().maxProbes).toBe(g.experimental ? null : 6);
  }
  const snapshot = g.snapshot();
  snapshot.experiments.colorShift = true;
  expect(g.experiments.colorShift).toBe(false);
  expect(other.experiments).toEqual(combinations[0]);
  act(g, "start", {}, host.id);
  expect(g.roundColorShift).toBeNull();
  expect(() =>
    act(g, "set_experiments", { experiments: combinations[3] }, host.id),
  ).toThrow("lobby");
  act(g, "probe", { country: "aa" });
  expect(() =>
    act(g, "set_experiments", { experiments: combinations[3] }, host.id),
  ).toThrow("lobby");
  for (const experiments of [
    { colorShift: "true", noMemory: false },
    { colorShift: true },
    { colorShift: true, noMemory: false, other: true },
  ]) {
    expect(
      commandSchema.safeParse({
        type: "set_experiments",
        experiments,
        actionId: "invalid-experiments",
      }).success,
    ).toBe(false);
  }
});

it("trasformazione cromatica deterministica, valida anche per bianco/nero e senza identità casuale", () => {
  expect(shiftColor("#ff0000", { hue: 120, lightness: 0 })).toBe("#00ff00");
  expect(shiftColor("#000000", { hue: 120, lightness: 0 })).not.toBe("#000000");
  expect(shiftColor("#ffffff", { hue: 120, lightness: 0 })).not.toBe("#ffffff");
  for (let i = 0; i < 100; i++) {
    const shift = randomColorShift();
    expect(shift.hue).toBeGreaterThanOrEqual(45);
    expect(shift.hue).toBeLessThanOrEqual(315);
    expect(shift.lightness).toBeGreaterThanOrEqual(-0.06);
    expect(shift.lightness).toBeLessThanOrEqual(0.06);
    for (const color of ["#ff0000", "#ffffff", "#000000", "#123456"]) {
      expect(shiftColor(color, shift)).toMatch(/^#[a-f0-9]{6}$/);
    }
  }
});
