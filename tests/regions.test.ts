import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Game, defaults, type Flag } from "../apps/server/src/game";
import { commandSchema, type Command } from "../packages/shared/src/index";
import { reveal } from "../packages/flag-engine/src/index";
import { geometry, skia } from "../packages/flag-engine/src/skia";
const regions: Flag[] = JSON.parse(
  readFileSync("assets/generated/regions-catalog.json", "utf8"),
);
const world: Flag[] = JSON.parse(
  readFileSync("assets/generated/catalog.json", "utf8"),
);
const manifest = JSON.parse(
  readFileSync("assets/regions/manifest.json", "utf8"),
) as {
  code: string;
  name: string;
  sha1: string;
  metadata: Record<string, { value: string }>;
}[];
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
    actionId: `regions-test-${++serial}`,
  });
}
function room() {
  return new Game(
    "ABC",
    world,
    defaults,
    () => 0,
    () => 0,
    undefined,
    { italian_regions: regions },
  );
}

it("20 regioni distinte con originali verificati, licenze e geometrie incluse", () => {
  expect(regions).toHaveLength(20);
  expect(regions.map((f) => f.name).sort()).toEqual(
    [
      "Abruzzo",
      "Basilicata",
      "Calabria",
      "Campania",
      "Emilia-Romagna",
      "Friuli-Venezia Giulia",
      "Lazio",
      "Liguria",
      "Lombardia",
      "Marche",
      "Molise",
      "Piemonte",
      "Puglia",
      "Sardegna",
      "Sicilia",
      "Toscana",
      "Trentino-Alto Adige",
      "Umbria",
      "Valle d'Aosta",
      "Veneto",
    ].sort(),
  );
  expect(new Set(regions.map((f) => f.code)).size).toBe(20);
  const report = JSON.parse(
    readFileSync("assets/generated/regions-report.json", "utf8"),
  );
  for (const f of regions) {
    expect(f.code).toMatch(/^it-\d{2}$/);
    expect(f.regions.length).toBeGreaterThan(0);
    const source = manifest.find((m) => m.code === f.code)!;
    expect(
      createHash("sha1")
        .update(readFileSync(`assets/regions/source/${f.code}.svg`))
        .digest("hex"),
    ).toBe(source.sha1);
    expect(source.metadata.LicenseShortName.value).toMatch(
      /Public domain|CC BY-SA (3|4)\.0/,
    );
    const result = report.find((r: { code: string }) => r.code === f.code);
    expect(result.included).toBe(true);
    expect(result.area).toBeGreaterThan(10000);
    expect(result.area).toBeLessThanOrEqual(60000.2);
    expect(f.svg).not.toMatch(/<(script|image|text|foreignObject)\b/);
  }
});

it("SVG regionali: self-match esatto sui punti interni senza mutare colori o geometrie", () => {
  for (const flag of regions) {
    const original = JSON.stringify(flag.regions);
    const matched = reveal(flag.regions, flag.regions, [], 0);
    for (const region of flag.regions) {
      const match = matched.find((r) => r.color === region.color);
      expect(match, flag.code + " " + region.color).toBeDefined();
      const a = geometry(region.d),
        b = geometry(match!.d);
      a.setFillType(skia.FillType.EvenOdd);
      b.setFillType(skia.FillType.EvenOdd);
      try {
        for (let x = 3.5; x < 300; x += 13)
          for (let y = 3.5; y < 200; y += 13)
            expect(
              b.contains(x, y),
              flag.code + " " + region.color + " " + x + "," + y,
            ).toBe(a.contains(x, y));
      } finally {
        a.delete();
        b.delete();
      }
    }
    expect(JSON.stringify(flag.regions)).toBe(original);
  }
}, 120000);

for (const mode of ["pvp", "solo"] as const)
  for (const experiments of [
    { colorShift: false, noMemory: false },
    { colorShift: true, noMemory: false },
    { colorShift: false, noMemory: true },
    { colorShift: true, noMemory: true },
  ]) {
    it(`regioni ${mode}, esperimenti ${JSON.stringify(experiments)}: isolamento, punteggi e round`, () => {
      const g = room();
      const host = g.add("Ada");
      if (mode === "solo") act(g, "set_mode", { mode });
      else g.add("Bruno");
      act(g, "set_catalog", { catalogSet: "italian_regions" });
      act(g, "set_experiments", { experiments });
      act(g, "start");
      expect(g.catalog).toHaveLength(20);
      expect(g.secret).toBe("it-65");
      expect(g.snapshot().catalogSet).toBe("italian_regions");
      expect(g.snapshot().maxProbes).toBe(g.experimental ? null : 6);
      expect(() => act(g, "probe", { country: "it" })).toThrow(
        "Bandiera non valida",
      );
      expect(g.history).toHaveLength(0);
      act(g, "probe", { country: "it-25" });
      if (mode === "pvp") act(g, "pass");
      act(g, "probe", { country: g.secret });
      expect(g.snapshot().solution).toBe("it-65");
      expect(g.players.reduce((n, p) => n + p.score, 0)).toBe(1);
      for (const p of g.players) act(g, "ready", {}, p.id);
      expect(g.round).toBe(2);
      expect(g.catalogSet).toBe("italian_regions");
      expect(() =>
        act(g, "set_catalog", { catalogSet: "world" }, host.id),
      ).toThrow("lobby");
      if (g.experimental) {
        act(g, "draw", {}, host.id);
        if (mode === "pvp") act(g, "draw", {}, g.players[1].id);
        expect(g.results.at(-1)?.reason).toBe("Patta");
      } else expect(() => act(g, "draw", {}, host.id)).toThrow("sperimentale");
    });
  }

it("cataloghi: solo host, scelta reversibile nella lobby e payload rigorosi", () => {
  const g = room(),
    a = g.add("Ada"),
    b = g.add("Bruno");
  expect(g.catalog).toHaveLength(195);
  expect(() =>
    act(g, "set_catalog", { catalogSet: "italian_regions" }, b.id),
  ).toThrow("Solo il creatore");
  expect(() => act(g, "set_catalog", {}, a.id)).toThrow("non disponibile");
  act(g, "set_catalog", { catalogSet: "italian_regions" }, a.id);
  expect(g.experiments).toEqual({ colorShift: false, noMemory: false });
  act(g, "set_catalog", { catalogSet: "world" }, a.id);
  expect(g.catalog).toHaveLength(195);
  expect(room().catalogSet).toBe("world");
  expect(
    commandSchema.safeParse({
      type: "probe",
      country: "it-25",
      actionId: "valid-regional-code",
    }).success,
  ).toBe(true);
  for (const country of ["../it-25", "it-250", "IT-25", "it-xx"])
    expect(
      commandSchema.safeParse({
        type: "probe",
        country,
        actionId: "invalid-regional-code",
      }).success,
    ).toBe(false);
  expect(
    commandSchema.safeParse({
      type: "set_catalog",
      catalogSet: "anything",
      actionId: "invalid-catalog",
    }).success,
  ).toBe(false);
});
