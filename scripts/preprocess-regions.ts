import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  renameSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { geometry, skia } from "../packages/flag-engine/src/skia";
import paper from "paper";
import { JSDOM } from "jsdom";
import { preprocess, svg } from "../packages/flag-engine/src/index";

const svgNS = "http://www.w3.org/2000/svg";
const paint = new Set([
  "fill",
  "stroke",
  "fill-rule",
  "clip-rule",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "fill-opacity",
  "stroke-opacity",
  "opacity",
  "clip-path",
]);
const geometryAttrs = new Set([
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
  "href",
  "clipPathUnits",
]);
function normalize(source: string) {
  const dom = new JSDOM(source, { contentType: "image/svg+xml" });
  try {
    const root = dom.window.document.documentElement;
    const notes = new Set<string>();
    // Mantieni i tracciati originali; rimuovi soltanto metadati e dati editor.
    for (const el of [...root.querySelectorAll("*")]) {
      if (
        el.namespaceURI !== svgNS ||
        ["metadata", "title", "desc"].includes(el.localName)
      )
        el.remove();
    }
    for (const text of [...root.querySelectorAll("text")]) {
      text.remove();
      notes.add(
        "Microtesti del libro del leone rimossi: la dimensione sorgente è inferiore a un pixel nel riquadro di gioco.",
      );
    }
    for (const sheet of [...root.querySelectorAll("style")]) {
      const css = (sheet.textContent ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const match of css.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
        for (const el of [...root.querySelectorAll(match[1].trim())]) {
          el.setAttribute(
            "style",
            `${match[2]};${el.getAttribute("style") ?? ""}`,
          );
        }
      }
      sheet.remove();
    }
    const gradientColor = (id: string, seen = new Set<string>()): string => {
      if (seen.has(id)) throw Error("Gradiente ricorsivo");
      seen.add(id);
      const gradient = root.querySelector(`[id="${id}"]`);
      if (!gradient) throw Error("Gradiente mancante: " + id);
      const stops = [...gradient.querySelectorAll("stop")];
      if (!stops.length) {
        const ref =
          gradient.getAttribute("href") ?? gradient.getAttribute("xlink:href");
        if (!ref?.startsWith("#")) throw Error("Stop gradiente assenti: " + id);
        return gradientColor(ref.slice(1), seen);
      }
      const stop = stops[Math.floor((stops.length - 1) / 2)];
      return (
        /(?:^|;)\s*stop-color\s*:\s*([^;]+)/
          .exec(stop.getAttribute("style") ?? "")?.[1]
          .trim() ??
        stop.getAttribute("stop-color") ??
        "#000000"
      );
    };
    const palette = new Map(
      [...root.querySelectorAll("linearGradient, radialGradient")].map((g) => [
        g.id,
        gradientColor(g.id),
      ]),
    );
    for (const el of [root, ...root.querySelectorAll("*")]) {
      const styles = new Map<string, string>();
      for (const item of (el.getAttribute("style") ?? "").split(";")) {
        const colon = item.indexOf(":");
        if (colon < 0) continue;
        styles.set(item.slice(0, colon).trim(), item.slice(colon + 1).trim());
      }
      if (
        styles.get("display") === "none" ||
        styles.get("visibility") === "hidden"
      ) {
        el.remove();
        continue;
      }
      for (const [key, value] of styles)
        if (paint.has(key)) el.setAttribute(key, value);
      for (const attr of [...el.attributes]) {
        if (attr.localName === "href" && attr.namespaceURI) {
          el.setAttribute("href", attr.value);
          el.removeAttributeNode(attr);
          continue;
        }
        if (!paint.has(attr.name) && !geometryAttrs.has(attr.name))
          el.removeAttributeNode(attr);
      }
      for (const key of ["fill", "stroke"]) {
        const value = el.getAttribute(key);
        const ref = /^url\(#([^)]*)\)$/.exec(value ?? "");
        if (ref) {
          el.setAttribute(key, palette.get(ref[1]) ?? gradientColor(ref[1]));
          notes.add(
            "Sfumature sostituite con un colore piatto da uno stop centrale del gradiente.",
          );
        }
      }
      for (const key of ["opacity", "fill-opacity", "stroke-opacity"]) {
        const value = el.getAttribute(key);
        if (value !== null && Number(value) !== 1) {
          if (Number(value) === 0) {
            if (key === "opacity") el.remove();
            else
              el.setAttribute(
                key === "fill-opacity" ? "fill" : "stroke",
                "none",
              );
          } else
            notes.add(
              "Semitrasparenze dello stemma rese opache per il motore a colori piatti.",
            );
          el.removeAttribute(key);
        }
      }
      if (styles.has("paint-order"))
        notes.add("Ordine di pittura uniformato a riempimento e poi contorno.");
      if (
        styles.get("stroke-dasharray") &&
        styles.get("stroke-dasharray") !== "none"
      )
        throw Error("Tratteggio non supportato");
    }
    for (const el of [
      ...root.querySelectorAll("linearGradient, radialGradient"),
    ])
      el.remove();
    const walker = dom.window.document.createTreeWalker(
      root,
      dom.window.NodeFilter.SHOW_COMMENT,
    );
    const comments: Node[] = [];
    while (walker.nextNode()) comments.push(walker.currentNode);
    comments.forEach((n) => n.parentNode?.removeChild(n));
    if (!root.hasAttribute("viewBox")) {
      const width = parseFloat(root.getAttribute("width") ?? ""),
        height = parseFloat(root.getAttribute("height") ?? "");
      if (!(width > 0 && height > 0)) throw Error("Dimensioni SVG mancanti");
      root.setAttribute("viewBox", `0 0 ${width} ${height}`);
    }
    root.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns", svgNS);
    return { source: root.outerHTML, notes: [...notes] };
  } finally {
    dom.window.close();
  }
}
function compactRegions(regions: ReturnType<typeof preprocess>) {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(300, 200));
  try {
    return regions.map((region) => {
      const path = new scope.CompoundPath({
        pathData: region.d,
        insert: false,
      });
      for (const child of path.children as paper.Path[])
        if (child.hasHandles()) child.flatten(0.03);
      const d = (
        path as unknown as { getPathData(m: null, p: number): string }
      ).getPathData(null, 4);
      path.remove();
      return { ...region, d };
    });
  } finally {
    scope.project.clear();
  }
}
function coverageArea(regions: ReturnType<typeof preprocess>) {
  const paths = regions.map((region) => {
    const p = geometry(region.d);
    p.setFillType(skia.FillType.EvenOdd);
    return p;
  });
  try {
    for (const path of paths) {
      const [left, top, right, bottom] = path.getBounds();
      if (left < -0.05 || top < -0.05 || right > 300.05 || bottom > 200.05)
        throw Error("Geometria fuori dal riquadro");
    }
    let covered = 0;
    for (let y = 0.5; y < 200; y++)
      for (let x = 0.5; x < 300; x++)
        if (paths.some((path) => path.contains(x, y))) covered++;
    return covered;
  } finally {
    paths.forEach((p) => p.delete());
  }
}
interface Manifest {
  code: string;
  name: string;
  en: string;
  source: string;
  metadata: Record<string, { value: string }>;
}
const manifest: Manifest[] = JSON.parse(
  readFileSync("assets/regions/manifest.json", "utf8"),
);
mkdirSync("assets/regions/flat", { recursive: true });
mkdirSync("assets/generated", { recursive: true });
const engineHash = createHash("sha256")
  .update(
    ["index", "preprocess", "skia"]
      .map((n) => readFileSync(`packages/flag-engine/src/${n}.ts`, "utf8"))
      .join(""),
  )
  .digest("hex");
const previous = existsSync("assets/generated/regions-catalog.json")
  ? JSON.parse(readFileSync("assets/generated/regions-catalog.json", "utf8"))
  : [];
const previousReport = existsSync("assets/generated/regions-report.json")
  ? JSON.parse(readFileSync("assets/generated/regions-report.json", "utf8"))
  : [];
const catalog = [],
  report = [];
for (const item of manifest) {
  const source = readFileSync(`assets/regions/source/${item.code}.svg`, "utf8");
  console.log("Preprocess regione", item.code, item.name);
  try {
    const normalized = normalize(source);
    const digest = createHash("sha256")
      .update(normalized.source + engineHash)
      .digest("hex");
    const assetPath = `assets/regions/flat/${item.code}.svg`;
    const cached = previousReport.find(
      (r: {
        code: string;
        digest: string;
        included: boolean;
        engineHash?: string;
        compactVersion?: number;
      }) =>
        r.code === item.code &&
        r.included &&
        r.compactVersion === 2 &&
        (r.digest === digest ||
          (r.engineHash === engineHash &&
            existsSync(assetPath) &&
            readFileSync(assetPath, "utf8") === normalized.source)),
    );
    const previousFlag = previous.find(
      (f: { code: string }) => f.code === item.code,
    );
    if (cached && previousFlag) {
      const regions =
        cached.compactVersion === 2
          ? previousFlag.regions
          : compactRegions(previousFlag.regions);
      catalog.push({
        ...previousFlag,
        regions,
        svg: svg(regions),
        name: item.name,
        en: item.en,
      });
      report.push({
        ...cached,
        digest,
        engineHash,
        area: coverageArea(regions),
        areaMethod:
          "Punti geometrici al centro delle celle 300×200; bounds dei tracciati verificati separatamente",
        compactVersion: 2,
        adaptations: [
          ...normalized.notes,
          "Curve finali convertite in segmenti vettoriali con tolleranza 0,03 px a 300×200 e coordinate a 4 decimali.",
        ],
      });
      continue;
    }
    writeFileSync(assetPath, normalized.source);
    const rawCache = `.cache/regions/${item.code}-${digest}.json`;
    const rawRegions = existsSync(rawCache)
      ? JSON.parse(readFileSync(rawCache, "utf8"))
      : preprocess(normalized.source);
    mkdirSync(".cache/regions", { recursive: true });
    if (!existsSync(rawCache))
      writeFileSync(rawCache, JSON.stringify(rawRegions));
    const regions = compactRegions(rawRegions),
      coverage = coverageArea(regions);
    if (!regions.length || !Number.isFinite(coverage) || coverage > 60000.2)
      throw Error("Area non valida: " + coverage);
    catalog.push({
      code: item.code,
      name: item.name,
      en: item.en,
      regions,
      svg: svg(regions),
    });
    report.push({
      code: item.code,
      included: true,
      digest,
      engineHash,
      compactVersion: 2,
      assetPath,
      source: item.source,
      license: item.metadata.LicenseShortName.value,
      regions: regions.length,
      area: coverage,
      areaMethod:
        "Punti geometrici al centro delle celle 300×200; bounds dei tracciati verificati separatamente",
      adaptations: [
        ...normalized.notes,
        "Curve finali convertite in segmenti vettoriali con tolleranza 0,03 px a 300×200 e coordinate a 4 decimali.",
      ],
    });
    console.log(
      "Inclusa",
      item.code,
      regions.length,
      "regioni geometriche",
      normalized.notes,
    );
  } catch (error) {
    report.push({
      code: item.code,
      included: false,
      reason: (error as Error).message,
    });
    console.log("ERRORE", item.code, (error as Error).message);
  }
}
writeFileSync(
  "assets/generated/regions-report.json",
  JSON.stringify(report, null, 2) + "\n",
);
if (catalog.length !== 20 || report.some((r) => !r.included))
  throw Error("Catalogo regioni incompleto: " + catalog.length + "/20");
writeFileSync(
  "assets/generated/regions-catalog.json.tmp",
  JSON.stringify(catalog),
);
renameSync(
  "assets/generated/regions-catalog.json.tmp",
  "assets/generated/regions-catalog.json",
);
console.log("20/20 regioni incluse");
