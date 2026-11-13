import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  preprocess,
  reveal,
  area,
  svg,
} from "../packages/flag-engine/src/index";
import type { Flag } from "../apps/server/src/game";
const catalog: Flag[] = JSON.parse(
  readFileSync("assets/generated/catalog.json", "utf8"),
);
const report: {
  code: string;
  included: boolean;
  assetPath: string;
  variant: string;
}[] = JSON.parse(readFileSync("assets/generated/report.json", "utf8"));
const manifest: { members: string[]; observers: string[] } = JSON.parse(
  readFileSync("assets/metadata/un-states.json", "utf8"),
);
it("tutti i193 membri ONU e i due osservatori, senza territori o esclusioni", () => {
  expect(manifest.members).toHaveLength(193);
  expect(manifest.observers.sort()).toEqual(["ps", "va"]);
  expect(catalog.map((f) => f.code).sort()).toEqual(
    [...manifest.members, ...manifest.observers].sort(),
  );
  expect(report).toHaveLength(195);
  expect(report.every((r) => r.included)).toBe(true);
  expect(new Set(catalog.map((f) => f.code)).size).toBe(195);
});
it("ogni bandiera: self-match, roundtrip SVG e colori originali", () => {
  for (const f of catalog) {
    const r = reveal(f.regions, f.regions, [], 0);
    expect(Math.abs(area(r) - area(f.regions)), f.code).toBeLessThan(0.2);
    const exported = preprocess(svg(r));
    expect(Math.abs(area(exported) - area(r)), f.code).toBeLessThan(0.2);
    expect(
      r.every((region) => f.regions.some((s) => s.color === region.color)),
    ).toBe(true);
  }
}, 120000);
it("Nepal reale: esterno trasparente e nessuna superficie bianca inventata", () => {
  const f = catalog.find((f) => f.code === "np")!;
  expect(report.find((r) => r.code === "np")!.variant).toBe("detailed");
  expect(area(f.regions)).toBeGreaterThan(5000);
  expect(area(f.regions)).toBeLessThan(40000);
  const white = preprocess(
    '<svg viewBox="0 0 300 200"><path fill="#fff" d="M0 0H300V200H0Z"/></svg>',
  );
  const r = reveal(white, f.regions, [], 0);
  expect(area(r)).toBeCloseTo(
    area(f.regions.filter((x) => x.color === "#ffffff")),
    1,
  );
});
it("sorgenti reali semplici, clipping, stroke e stemmi complessi riproducibili", () => {
  for (const code of [
    "fr",
    "ru",
    "ch",
    "np",
    "es",
    "pt",
    "af",
    "ir",
    "us",
    "va",
    "gt",
    "mx",
  ]) {
    const f = catalog.find((f) => f.code === code)!;
    const row = report.find((r) => r.code === code)!;
    const original = preprocess(readFileSync(row.assetPath, "utf8"));
    expect(Math.abs(area(original) - area(f.regions)), code).toBeLessThan(0.2);
  }
}, 120000);
it("ogni segreta contro sonde rappresentative: rivelazione finita, monotona e limitata", () => {
  const probes = ["fr", "ru", "ch", "np"].map((c) =>
    catalog.find((f) => f.code === c)!,
  );
  for (const f of catalog) {
    let before = 0;
    let r: ReturnType<typeof reveal> = [];
    for (const p of probes) {
      r = reveal(p.regions, f.regions, r);
      const now = area(r);
      expect(now + 0.2, f.code).toBeGreaterThanOrEqual(before);
      expect(now, f.code).toBeLessThanOrEqual(area(f.regions) + 0.2);
      for (const region of r) {
        expect(region.d).not.toMatch(/NaN|Infinity/);
        expect(f.regions.some((s) => s.color === region.color)).toBe(true);
      }
      before = now;
    }
  }
}, 120000);
