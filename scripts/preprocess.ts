import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { preprocess, area, svg } from "../packages/flag-engine/src/index";
const manifest = JSON.parse(
  readFileSync("assets/metadata/un-states.json", "utf8"),
) as { members: string[]; observers: string[] };
const codes = [...manifest.members, ...manifest.observers];
mkdirSync("assets/generated", { recursive: true });
const it = new Intl.DisplayNames(["it"], { type: "region" }),
  en = new Intl.DisplayNames(["en"], { type: "region" });
const flatVariants = JSON.parse(
  readFileSync("assets/flags-flat/variants.json", "utf8"),
) as Record<string, string>;
const engineHash = createHash("sha256")
  .update(
    ["index", "preprocess", "skia"]
      .map((n) => readFileSync(`packages/flag-engine/src/${n}.ts`, "utf8"))
      .join(""),
  )
  .digest("hex");
const previousCatalog = existsSync("assets/generated/catalog.json")
  ? JSON.parse(readFileSync("assets/generated/catalog.json", "utf8"))
  : [];
const previousReport = existsSync("assets/generated/report.json")
  ? JSON.parse(readFileSync("assets/generated/report.json", "utf8"))
  : [];
const catalog = [];
const report = [];
for (const code of codes) {
  const assetPath = flatVariants[code]
    ? `assets/flags-flat/${code}.svg`
    : `assets/flags/${code}.svg`;
  const source = readFileSync(assetPath, "utf8");
  const digest = createHash("sha256")
    .update(source + engineHash + assetPath)
    .digest("hex");
  const cached = previousReport.find(
    (r: { code: string; digest?: string; included: boolean }) =>
      r.code === code && r.digest === digest && r.included,
  );
  const cachedFlag = previousCatalog.find(
    (f: { code: string }) => f.code === code,
  );
  if (cached && cachedFlag) {
    catalog.push(cachedFlag);
    report.push(cached);
    continue;
  }
  console.log("Preprocess", code);
  try {
    const regions = preprocess(source);
    const coverage = area(regions);
    if (!regions.length || !Number.isFinite(coverage) || coverage > 60000.2)
      throw Error("Area non valida");
    catalog.push({
      code,
      name: code === "ps" ? "Palestina" : it.of(code.toUpperCase())!,
      en: en.of(code.toUpperCase())!,
      regions,
      svg: svg(regions),
    });
    report.push({
      code,
      included: true,
      assetPath,
      digest,
      variant: flatVariants[code] ? "flat-simplified" : "detailed",
      ...(flatVariants[code] ? { originalLimitation: flatVariants[code] } : {}),
      regions: regions.length,
      area: coverage,
    });
  } catch (e) {
    report.push({ code, included: false, reason: (e as Error).message });
  }
}
writeFileSync("assets/generated/catalog.json", JSON.stringify(catalog));
writeFileSync("assets/generated/report.json", JSON.stringify(report, null, 2));
console.log(`${catalog.length}/${codes.length} bandiere incluse`);
console.log(report.filter((r) => !r.included));

if (catalog.length !== 195 || report.some((r) => !r.included))
  throw Error(
    "Corpus ONU incompleto: correggere gli asset segnalati prima della build",
  );
