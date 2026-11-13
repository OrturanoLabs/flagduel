import CanvasKitInit, { type Path } from "canvaskit-wasm";
import paper from "paper";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
export const skia = await CanvasKitInit({
  locateFile: () => require.resolve("canvaskit-wasm/bin/canvaskit.wasm"),
});
export type { Path };
export function geometry(d: string): Path {
  if (!d.trim()) {
    const b = new skia.PathBuilder();
    try {
      return b.detach();
    } finally {
      b.delete();
    }
  }
  const p = skia.Path.MakeFromSVGString(d);
  if (!p) throw Error("Path SVG non valido");
  return p;
}
export function boolean(
  a: Path,
  b: Path,
  op: "Union" | "Intersect" | "Difference",
): Path {
  const p = skia.Path.MakeFromOp(a, b, skia.PathOp[op]);
  if (p) return p;
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(300, 200));
  try {
    const x = new scope.CompoundPath({
        pathData: a.toSVGString(),
        insert: false,
      }),
      y = new scope.CompoundPath({ pathData: b.toSVGString(), insert: false });
    x.fillRule =
      a.getFillType() === skia.FillType.EvenOdd ? "evenodd" : "nonzero";
    y.fillRule =
      b.getFillType() === skia.FillType.EvenOdd ? "evenodd" : "nonzero";
    const result =
      op === "Union"
        ? x.unite(y, { insert: false })
        : op === "Intersect"
          ? x.intersect(y, { insert: false })
          : x.subtract(y, { insert: false });
    const repaired = skia.Path.MakeFromSVGString(result.pathData);
    if (!repaired) throw Error("Operazione vettoriale fallita");
    return repaired;
  } finally {
    scope.project.clear();
  }
}
export function winding(p: Path): string {
  return p.toSVGString();
}
