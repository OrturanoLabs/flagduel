import { randomInt } from "node:crypto";

export interface ColorShift {
  hue: number;
  lightness: number;
}

export function randomColorShift(): ColorShift {
  return { hue: randomInt(45, 316), lightness: randomInt(-60, 61) / 1000 };
}

/** Solo presentazione: non modifica i colori o i Lab usati dal motore SVG. */
export function shiftColor(hex: string, shift: ColorShift): string {
  const [r, g, b] = [1, 3, 5].map(
    (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
  );
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    chroma = max - min;
  const originalLightness = (max + min) / 2;
  const saturation =
    chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * originalLightness - 1));
  let hue =
    chroma === 0
      ? 0
      : max === r
        ? ((g - b) / chroma) % 6
        : max === g
          ? (b - r) / chroma + 2
          : (r - g) / chroma + 4;
  hue = (((hue * 60 + shift.hue) % 360) + 360) % 360;
  // Comprimi gli estremi: anche bianco e nero cambiano aspetto.
  const lightness = Math.max(
    0,
    Math.min(1, 0.08 + 0.84 * originalLightness + shift.lightness),
  );
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1)),
    m = lightness - c / 2;
  const channels =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];
  return (
    "#" +
    channels
      .map((v) =>
        Math.round((v + m) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
