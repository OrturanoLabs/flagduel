import { describe, it, expect } from "vitest";
import {
  preprocess,
  area,
  reveal,
  oklab,
  delta,
  matches,
  svg,
} from "../packages/flag-engine/src/index";
const fixture = (s: string, v = "0 0 300 200") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${v}">${s}</svg>`;
const solid = (c: string) =>
  preprocess(fixture(`<path fill="${c}" d="M0 0H300V200H0Z"/>`));
describe("Motore vettoriale Skia/Paper.js", () => {
  it("intersezione strisce, unione e bordi coincidenti", () => {
    const a = preprocess(
      fixture(
        ["red", "white", "blue"]
          .map(
            (c, i) =>
              `<rect x="${i * 100}" width="100" height="200" fill="${c}"/>`,
          )
          .join(""),
      ),
    );
    const b = preprocess(
      fixture(
        ["red", "white", "blue"]
          .map(
            (c, i) =>
              `<rect y="${(i * 200) / 3}" width="300" height="${200 / 3}" fill="${c}"/>`,
          )
          .join(""),
      ),
    );
    const r = reveal(a, b);
    expect(area(r)).toBeCloseTo(20000, 2);
    expect(area(reveal(a, b, r))).toBeCloseTo(20000, 2);
    expect(area(reveal(b, b, r))).toBeCloseTo(60000, 2);
    expect(svg(r)).not.toContain("script");
  });
  it("paint order elimina superfici coperte", () => {
    const b = preprocess(
      fixture(
        '<rect width="300" height="200" fill="red"/><rect width="300" height="200" fill="blue"/>',
      ),
    );
    expect(area(reveal(solid("red"), b))).toBe(0);
  });
  it("normalizza viewBox, trasformazioni e sagoma trasparente", () => {
    const r = preprocess(
      fixture(
        '<g transform="translate(10 0)"><path fill="red" d="M0 0H100V100Z"/></g>',
        "10 0 100 100",
      ),
    );
    expect(area(r)).toBeCloseTo(30000);
  });
  it("rifiuta elementi non supportati e input attivo", () => {
    for (const x of [
      "<script/>",
      '<image href="https://a"/>',
      '<use href="https://example.com/a.svg#x"/>',
      '<path fill="url(https://example.com)"/>',
      '<g opacity=".5"><path d="M0 0h10v10z"/></g>',
    ])
      expect(() => preprocess(fixture(x))).toThrow();
  });
});
describe("OKLab", () => {
  it("vettore rosso di riferimento, identità, simmetria e positività", () => {
    const r = oklab("#ff0000");
    expect(r[0]).toBeCloseTo(0.62795536, 6);
    expect(r[1]).toBeCloseTo(0.22486306, 6);
    expect(r[2]).toBeCloseTo(0.1258463, 6);
    expect(delta(r, r)).toBe(0);
    expect(delta(r, oklab("blue"))).toBe(delta(oklab("blue"), r));
    expect(delta(r, oklab("blue"))).toBeGreaterThan(0.04);
  });
  it("soglia inclusiva, zero, nessun cluster transitivo e colore originale", () => {
    const a: [number, number, number] = [0.5, 0, 0],
      b: [number, number, number] = [0.53, 0, 0],
      c: [number, number, number] = [0.56, 0, 0];
    expect(matches(a, b)).toBe(true);
    expect(matches(b, c)).toBe(true);
    expect(matches(a, c)).toBe(false);
    expect(matches(a, b, delta(a, b))).toBe(true);
    expect(matches(a, a, 0)).toBe(true);
    expect(matches(a, b, 0)).toBe(false);
    const r = reveal(solid("#ff0000"), solid("#fa0000"));
    expect(r[0].color).toBe("#fa0000");
    expect(reveal(solid("blue"), solid("red"))).toHaveLength(0);
  });
});
it("POC path auto-intersecante: due triangoli visibili, non area algebrica nulla", () => {
  const r = preprocess(
    fixture('<path fill="#ff0000" d="M0 0L300 200L0 200L300 0Z"/>'),
  );
  expect(area(r)).toBeCloseTo(30000, 4);
});

it("stroke in contorno prima dello stretching e clipping locale con use", () => {
  const source = fixture(
    '<defs><path id="line" d="M50 100H250"/><clipPath id="clip"><rect x="100" width="100" height="200" fill-opacity=".3"/></clipPath></defs><use href="#line" fill="none" stroke="red" stroke-width="20" clip-path="url(#clip)"/>',
  );
  expect(area(preprocess(source))).toBeCloseTo(2000, 2);
});
it("curve e cap round: conversione dello stroke in superficie", () => {
  const r = preprocess(
    fixture(
      '<path fill="none" stroke="blue" stroke-width="10" stroke-linecap="round" d="M50 100H150"/>',
    ),
  );
  expect(Math.abs(area(r) - (1000 + Math.PI * 25))).toBeLessThan(0.1);
});
it("blocca cicli use e riferimenti locali mancanti", () => {
  expect(() => preprocess(fixture('<g id="a"><use href="#a"/></g>'))).toThrow();
  expect(() => preprocess(fixture('<use href="#missing"/>'))).toThrow();
});
it("conserva i fori evenodd anche dopo trasformazioni annidate", () => {
  const r = preprocess(
    fixture(
      '<g transform="translate(10 10) scale(.5)"><path fill="red" fill-rule="evenodd" d="M0 0H300V200H0Z M100 50H200V150H100Z"/></g>',
    ),
  );
  expect(area(r)).toBeCloseTo(12500, 2);
  expect(area(preprocess(svg(r)))).toBeCloseTo(12500, 2);
});
