import paper from "paper";
import colorString from "color-string";
import { preprocess } from "./preprocess";
export { preprocess };
import { geometry, boolean, winding, skia, type Path } from "./skia";
export type Lab = [number, number, number];
export interface Region {
  d: string;
  color: string;
  lab: Lab;
}
const scope = new paper.PaperScope();
scope.setup(new scope.Size(300, 200));
function colorHex(c: string): string {
  const parsed = colorString.get.rgb(c);
  if (!parsed || parsed[3] !== 1) throw Error("Colore opaco non valido: " + c);
  return (
    "#" +
    parsed
      .slice(0, 3)
      .map((x) => Math.round(x).toString(16).padStart(2, "0"))
      .join("")
  );
}
export function oklab(hex: string): Lab {
  const c = new scope.Color(colorHex(hex));
  const [r, g, b] = [c.red, c.green, c.blue].map((x) =>
    x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4,
  );
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
    m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
    s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
export const delta = (a: Lab, b: Lab) =>
  Math.hypot(...a.map((x, i) => x - b[i]));
export const matches = (a: Lab, b: Lab, t = 0.04) => delta(a, b) <= t;
function data(p: paper.PathItem): string {
  return (
    p as unknown as { getPathData(m: null, p: number): string }
  ).getPathData(null, 12);
}
type Shape = paper.Path | paper.CompoundPath;
function path(d: string): Shape {
  return new scope.CompoundPath({ pathData: d, insert: false });
}
const areas = new WeakMap<Region[], number>();
export function area(regions: Region[]) {
  const cached = areas.get(regions);
  if (cached !== undefined) return cached;
  const total = regions.reduce((sum, r) => {
    const compound = path(r.d);
    const contours =
      compound instanceof scope.CompoundPath
        ? (compound.children as paper.Path[])
        : [compound as paper.Path];
    compound.fillRule='evenodd';
    let result=0;
    for(const contour of contours){const a=Math.abs(contour.area);if(a<1e-10)continue;let sign:number|undefined;
      for(const fraction of [.37,.13,.61,.83]){const point=contour.getPointAt(contour.length*fraction),normal=contour.getNormalAt(contour.length*fraction);if(!point||!normal)continue;
        for(const direction of [1,-1]){const inside=point.add(normal.multiply(direction*.0001));if(contour.contains(inside)){sign=compound.contains(inside)?1:-1;break;}}
        if(sign!==undefined)break;
      }
      if(sign===undefined)sign=compound.contains(contour.interiorPoint)?1:-1;
      result+=sign*a;
    }
    return sum + result;
  }, 0);
  areas.set(regions, total);
  return total;
}
export function svg(regions: Region[]) {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200">' +
    regions
      .map((r) => `<path fill-rule="evenodd" fill="${r.color}" d="${r.d}"/>`)
      .join("") +
    "</svg>"
  );
}
export function reveal(
  probe: Region[],
  secret: Region[],
  previous: Region[] = [],
  t = 0.04,
): Region[] {
  const paths: Path[] = [];
  const load = (d: string) => {
    const p = geometry(d);
    p.setFillType(skia.FillType.EvenOdd);
    return p;
  };
  const keep = (p: Path) => {
    paths.push(p);
    return p;
  };
  try {
    return secret.flatMap((s) => {
      const target = keep(load(s.d));
      let combined = keep(geometry(""));
      for (const old of previous)
        if (old.color === s.color)
          combined = keep(
            boolean(
              combined,
              keep(boolean(keep(load(old.d)), target, "Intersect")),
              "Union",
            ),
          );
      for (const p of probe)
        if (matches(p.lab, s.lab, t))
          combined = keep(
            boolean(
              combined,
              keep(boolean(keep(load(p.d)), target, "Intersect")),
              "Union",
            ),
          );
      return combined.isEmpty() ? [] : [{ ...s, d: winding(combined) }];
    });
  } finally {
    paths.forEach((p) => p.delete());
  }
}
