import { JSDOM } from "jsdom";
import paper from "paper";
import colorString from "color-string";
import { oklab, type Region } from "./index";
import { skia, geometry, boolean, winding, type Path } from "./skia";
const scope = new paper.PaperScope();
scope.setup(new scope.Size(300, 200));
type Style = Record<string, string>;
const defaults: Style = {
  fill: "#000000",
  stroke: "none",
  "fill-rule": "nonzero",
  "clip-rule": "nonzero",
  "stroke-width": "1",
  "stroke-linecap": "butt",
  "stroke-linejoin": "miter",
  "stroke-miterlimit": "4",
  "fill-opacity": "1",
  "stroke-opacity": "1",
};
const paints = new Set([...Object.keys(defaults), "opacity", "clip-path"]);
const attrs = new Set([
  "xmlns",
  "xmlns:xlink",
  "id",
  "viewBox",
  "width",
  "height",
  "d",
  "transform",
  "x",
  "y",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "points",
  "version",
  "preserveAspectRatio",
  "href",
  "xlink:href",
  "clipPathUnits",
  "style",
  "class",
  "overflow",
  "color",
  "font-family",
  "font-weight",
  "font-size",
  "letter-spacing",
  "text-anchor",
  "word-spacing",
  "xml:space",
  "aria-label",
  ...paints,
]);
function matrix(parent: paper.Matrix, tr: string) {
  const m = parent.clone();
  let residue = tr;
  const regex = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]+)\)/g;
  let hit;
  while ((hit = regex.exec(tr))) {
    const v = hit[2].trim().split(/[ ,]+/).map(Number);
    if (!v.every(Number.isFinite)) throw Error("Transform non valida");
    const name = hit[1];
    if (name === "matrix") {
      if (v.length !== 6) throw Error("Matrix non valida");
      m.append(
        new scope.Matrix(
          ...(v as [number, number, number, number, number, number]),
        ),
      );
    } else if (name === "translate") m.translate(v[0], v[1] ?? 0);
    else if (name === "scale") m.scale(v[0], v[1] ?? v[0]);
    else if (name === "rotate")
      m.rotate(v[0], new scope.Point(v[1] ?? 0, v[2] ?? 0));
    else
      m.append(
        new scope.Matrix(
          1,
          name === "skewY" ? Math.tan((v[0] * Math.PI) / 180) : 0,
          name === "skewX" ? Math.tan((v[0] * Math.PI) / 180) : 0,
          1,
          0,
          0,
        ),
      );
    residue = residue.replace(hit[0], "");
  }
  if (residue.trim()) throw Error("Transform non supportata");
  return m;
}
export function preprocess(source: string): Region[] {
  if (
    /<!|<\s*(script|foreignObject|image|text|style|linearGradient|radialGradient|mask|pattern)\b|\bon\w+\s*=/i.test(
      source,
    )
  )
    throw Error("Elemento attivo o paint non piatto non supportato");
  const dom = new JSDOM(source, { contentType: "image/svg+xml" }),
    root = dom.window.document.documentElement;
  const resources: Path[] = [];
  const keep = (p: Path | null) => {
    if (!p) throw Error("Geometria non valida");
    resources.push(p);
    return p;
  };
  try {
    const tags = new Set([
      "svg",
      "g",
      "defs",
      "clipPath",
      "use",
      "path",
      "rect",
      "circle",
      "ellipse",
      "polygon",
      "polyline",
      "line",
    ]);
    for (const el of [root, ...root.querySelectorAll("*")]) {
      if (!tags.has(el.localName))
        throw Error("Elemento non supportato: " + el.localName);
      if (el !== root && el.localName === "svg") throw Error("SVG annidato");
      for (const a of [...el.attributes]) {
        if (!attrs.has(a.name))
          throw Error("Attributo non supportato: " + a.name);
        if (
          /url\s*\(/i.test(a.value) &&
          !(a.name === "clip-path" && /^url\(#[\w-]+\)$/.test(a.value))
        )
          throw Error("URL non autorizzato");
        if (/^(?:xlink:)?href$/.test(a.name) && !/^#[\w-]+$/.test(a.value))
          throw Error("Riferimento esterno");
      }
    }
    const vb = (root.getAttribute("viewBox") || "")
      .trim()
      .split(/[ ,]+/)
      .map(Number);
    if (
      vb.length !== 4 ||
      !vb.every(Number.isFinite) ||
      vb[2] <= 0 ||
      vb[3] <= 0
    )
      throw Error("viewBox non valido");
    const ids = new Map<string, Element>();
    for (const e of root.querySelectorAll("[id]")) {
      const id = e.getAttribute("id")!;
      if (ids.has(id)) throw Error("ID duplicato");
      ids.set(id, e);
    }
    const canvas = keep(geometry("M0 0H300V200H0Z"));
    const draw: { shape: Path; color: string }[] = [];
    let visits = 0;
    function num(el: Element, k: string, def = 0) {
      const raw = el.getAttribute(k);
      if (raw === null) return def;
      const match = /^([-+.\deE]+)(px|pt|mm|cm|in)?$/.exec(raw);
      if (!match) throw Error("Lunghezza non supportata: " + raw);
      const n =
        Number(match[1]) *
        { px: 1, pt: 96 / 72, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 }[
          match[2] ?? "px"
        ]!;
      if (!Number.isFinite(n)) throw Error("Numero non valido");
      return n;
    }
    function shape(el: Element): Path {
      const n = (k: string, d = 0) => num(el, k, d);
      let p: paper.PathItem;
      if (el.localName === "path")
        return keep(geometry(el.getAttribute("d") || ""));
      if (el.localName === "rect")
        p = new scope.Path.Rectangle({
          point: [n("x"), n("y")],
          size: [n("width"), n("height")],
          radius: [n("rx", n("ry")), n("ry", n("rx"))],
          insert: false,
        });
      else if (el.localName === "circle" || el.localName === "ellipse")
        p = new scope.Path.Ellipse({
          center: [n("cx"), n("cy")],
          radius:
            el.localName === "circle" ? [n("r"), n("r")] : [n("rx"), n("ry")],
          insert: false,
        });
      else if (el.localName === "line")
        p = new scope.Path({
          segments: [
            [n("x1"), n("y1")],
            [n("x2"), n("y2")],
          ],
          insert: false,
        });
      else {
        const pts = (el.getAttribute("points") || "")
          .trim()
          .split(/[ ,]+/)
          .map(Number);
        if (!pts.length || pts.length % 2 || !pts.every(Number.isFinite))
          throw Error("Punti non validi");
        p = new scope.Path({
          segments: Array.from({ length: pts.length / 2 }, (_, i) => [
            pts[2 * i],
            pts[2 * i + 1],
          ]),
          closed: el.localName === "polygon",
          insert: false,
        });
      }
      const d = (
        p as unknown as { getPathData(m: null, p: number): string }
      ).getPathData(null, 12);
      return keep(geometry(d));
    }
    function transformed(p: Path, m: paper.Matrix) {
      const b = new skia.PathBuilder();
      try {
        b.setFillType(p.getFillType());
        b.addPath(p);
        b.transform([m.a, m.c, m.tx, m.b, m.d, m.ty, 0, 0, 1]);
        return keep(b.detach());
      } finally {
        b.delete();
      }
    }
    function style(el: Element, parent: Style) {
      const s = { ...parent };
      delete s["clip-path"];
      delete s.opacity;
      for (const a of [...el.attributes])
        if (paints.has(a.name)) s[a.name] = a.value;
      for (const decl of (el.getAttribute("style") || "").split(";")) {
        if (!decl.trim()) continue;
        const i = decl.indexOf(":");
        const k = decl.slice(0, i).trim(),
          v = decl.slice(i + 1).trim();
        if (paints.has(k)) s[k] = v;
        else if (
          ![
            "line-height",
            "text-indent",
            "text-align",
            "text-decoration-line",
            "text-transform",
            "marker",
          ].includes(k)
        )
          throw Error("CSS non supportato: " + k);
        else if (k === "marker" && v !== "none")
          throw Error("Marker non supportato");
      }
      for (const k of ["fill-opacity", "stroke-opacity"])
        if (Number(s[k]) !== 1) {
          /* La verifica alpha avviene solo se il paint è usato. */
        }
      if (s.opacity !== undefined && Number(s.opacity) !== 1)
        throw Error("Opacità gruppo non supportata");
      return s;
    }
    function clipGeometry(
      el: Element,
      m: paper.Matrix,
      stack: Set<Element>,
    ): Path {
      if (stack.has(el)) throw Error("Riferimento ciclico");
      const next = new Set(stack).add(el);
      const tr = matrix(m, el.getAttribute("transform") || "");
      if (el.localName === "use") {
        const id = (
          el.getAttribute("href") ||
          el.getAttribute("xlink:href") ||
          ""
        ).slice(1);
        const target = ids.get(id);
        if (!target) throw Error("Riferimento mancante");
        tr.translate(num(el, "x"), num(el, "y"));
        return clipGeometry(target, tr, next);
      }
      if (["clipPath", "g"].includes(el.localName)) {
        if (el.getAttribute("clipPathUnits") === "objectBoundingBox")
          throw Error("Clip objectBoundingBox non supportato");
        let union = keep(geometry(""));
        for (const child of [...el.children])
          union = keep(boolean(union, clipGeometry(child, tr, next), "Union"));
        return union;
      }
      const p = shape(el);
      p.setFillType(
        (el.getAttribute("clip-rule") || el.getAttribute("fill-rule")) ===
          "evenodd"
          ? skia.FillType.EvenOdd
          : skia.FillType.Winding,
      );
      return transformed(p, tr);
    }
    function color(value: string, alpha: string) {
      const c = colorString.get.rgb(value);
      if (!c || c[3] !== 1 || Number(alpha) !== 1)
        throw Error("Paint semitrasparente non supportato");
      return (
        "#" +
        c
          .slice(0, 3)
          .map((x) => Math.round(x).toString(16).padStart(2, "0"))
          .join("")
      );
    }
    function walk(
      el: Element,
      parent: Style,
      m: paper.Matrix,
      clip: Path,
      stack: Set<Element>,
    ) {
      if (++visits > 100000) throw Error("SVG troppo complesso");
      if (stack.has(el)) throw Error("Riferimento ciclico");
      const next = new Set(stack).add(el);
      if (["defs", "clipPath"].includes(el.localName)) return;
      const s = style(el, parent),
        tr = matrix(m, el.getAttribute("transform") || "");
      let clipping = clip;
      if (s["clip-path"] && s["clip-path"] !== "none") {
        const id = /^url\(#([\w-]+)\)$/.exec(s["clip-path"])?.[1],
          def = id ? ids.get(id) : undefined;
        if (!def) throw Error("Clip mancante");
        clipping = keep(
          boolean(clip, clipGeometry(def, tr, new Set()), "Intersect"),
        );
      }
      if (el.localName === "use") {
        const id = (
            el.getAttribute("href") ||
            el.getAttribute("xlink:href") ||
            ""
          ).slice(1),
          target = ids.get(id);
        if (!target) throw Error("Riferimento mancante");
        tr.translate(num(el, "x"), num(el, "y"));
        walk(target, s, tr, clipping, next);
        return;
      }
      if (el.localName === "svg" || el.localName === "g") {
        for (const child of [...el.children])
          walk(child, s, tr, clipping, next);
        return;
      }
      const original = shape(el);
      original.setFillType(
        s["fill-rule"] === "evenodd"
          ? skia.FillType.EvenOdd
          : skia.FillType.Winding,
      );
      function paint(p: Path, c: string) {
        const clipped = keep(
          boolean(transformed(p, tr), clipping, "Intersect"),
        );
        if (!clipped.isEmpty()) draw.push({ shape: clipped, color: c });
      }
      if (s.fill !== "none") paint(original, color(s.fill, s["fill-opacity"]));
      if (s.stroke !== "none") {
        const width = num(
          {
            getAttribute: (k: string) =>
              k === "width" ? s["stroke-width"] : null,
          } as Element,
          "width",
        );
        if (width > 0) {
          const cap = {
            butt: skia.StrokeCap.Butt,
            round: skia.StrokeCap.Round,
            square: skia.StrokeCap.Square,
          }[s["stroke-linecap"]];
          const join = {
            miter: skia.StrokeJoin.Miter,
            round: skia.StrokeJoin.Round,
            bevel: skia.StrokeJoin.Bevel,
          }[s["stroke-linejoin"]];
          if (!cap || !join) throw Error("Stroke cap/join non valido");
          paint(
            keep(
              original.makeStroked({
                width,
                cap,
                join,
                miter_limit: Number(s["stroke-miterlimit"]),
                precision: 8,
              }),
            ),
            color(s.stroke, s["stroke-opacity"]),
          );
        }
      }
    }
    walk(
      root,
      defaults,
      new scope.Matrix(
        300 / vb[2],
        0,
        0,
        200 / vb[3],
        (-vb[0] * 300) / vb[2],
        (-vb[1] * 200) / vb[3],
      ),
      canvas,
      new Set(),
    );
    // Paint order risolto dal davanti: una superficie già coperta non contribuisce.
    let covered = keep(geometry(""));
    const colors = new Map<string, Path>();
    for (let i = draw.length - 1; i >= 0; i--) {
      const { shape, color } = draw[i];
      const visible = keep(boolean(shape, covered, "Difference"));
      if (!visible.isEmpty())
        colors.set(
          color,
          keep(
            boolean(colors.get(color) ?? keep(geometry("")), visible, "Union"),
          ),
        );
      covered = keep(boolean(covered, shape, "Union"));
    }
    return [...colors].map(([color, p]) => ({
      color,
      d: winding(p),
      lab: oklab(color),
    }));
  } finally {
    resources.forEach((p) => p.delete());
    dom.window.close();
    scope.project.clear();
  }
}
