import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
interface PackageInfo {
  name: string;
  version: string;
  license?: string;
  repository?: string | { url: string };
}
interface Notice {
  name: string;
  version: string;
  license: string;
  source: string;
  text: string;
}
const lock = JSON.parse(readFileSync("package-lock.json", "utf8")) as {
  packages: Record<string, { dev?: boolean; link?: boolean }>;
};
const notices = new Map<string, Notice>();
function sourceUrl(p: PackageInfo) {
  let source =
    typeof p.repository === "string" ? p.repository : (p.repository?.url ?? "");
  if (!source) return `https://www.npmjs.com/package/${p.name}`;
  if (/^[\w.-]+\/[\w.-]+$/.test(source))
    source = "https://github.com/" + source;
  return source
    .replace(/^git\+https?:/, "https:")
    .replace(/^git:\/\//, "https://")
    .replace(/^git\+ssh:\/\/git@github.com\//, "https://github.com/")
    .replace(/\.git$/, "");
}
for (const [dir, meta] of Object.entries(lock.packages)) {
  if (
    !dir.startsWith("node_modules/") ||
    meta.dev ||
    meta.link ||
    !existsSync(path.join(dir, "package.json"))
  )
    continue;
  const p = JSON.parse(
    readFileSync(path.join(dir, "package.json"), "utf8"),
  ) as PackageInfo;
  const key = `${p.name}@${p.version}`;
  if (notices.has(key)) continue;
  const files = readdirSync(dir, { withFileTypes: true })
    .filter(
      (f) =>
        f.isFile() &&
        /^(licen[sc]e|copying|notice|copyright)([-_.]|$)/i.test(f.name),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  let text = files
    .map((f) =>
      readFileSync(path.join(dir, f.name), "utf8")
        .replace(/\r\n/g, "\n")
        .trim(),
    )
    .join("\n\n");
  if (!text && p.name === "saxes")
    text = readFileSync(
      "third_party/upstream/saxes-6.0.0-LICENSE",
      "utf8",
    ).trim();
  if (!text) throw Error(`Testo della licenza mancante: ${key}`);
  const license =
    p.license ??
    (p.name === "xmlhttprequest-ssl" ? "MIT" : "Consultare il testo originale");
  notices.set(key, {
    name: p.name,
    version: p.version,
    license,
    source: sourceUrl(p),
    text,
  });
}
for (const [name, file] of [
  ["flag-icons", "assets/flags/LICENSE"],
  ["country-flag-icons", "assets/flags-flat/LICENSE"],
]) {
  const p = JSON.parse(
    readFileSync(`node_modules/${name}/package.json`, "utf8"),
  ) as PackageInfo;
  notices.set(`${name}@${p.version}`, {
    name,
    version: p.version,
    license: "MIT",
    source: sourceUrl(p),
    text: readFileSync(file, "utf8").trim(),
  });
}
notices.set("feather@4.29.2", {
  name: "feather (parti incluse in Lucide)",
  version: "4.29.2",
  license: "MIT",
  source: "https://github.com/feathericons/feather",
  text: readFileSync(
    "third_party/upstream/feather-4.29.2-LICENSE",
    "utf8",
  ).trim(),
});
const regionalAssets: {
  code: string;
  name: string;
  file: string;
  source: string;
  timestamp: string;
  metadata: Record<string, { value: string }>;
}[] = JSON.parse(readFileSync("assets/regions/manifest.json", "utf8"));
const textOnly = (html: string) =>
  JSDOM.fragment(html).textContent?.replace(/\s+/g, " ").trim() ?? "";
for (const asset of regionalAssets) {
  const license = asset.metadata.LicenseShortName.value;
  const version = license.includes("4.0")
    ? "4.0"
    : license.includes("3.0")
      ? "3.0"
      : null;
  const attribution = [
    `Opera: ${asset.file}`,
    `Autore/i: ${textOnly(asset.metadata.Artist?.value ?? "Vedere pagina sorgente")}`,
    `Fonte: ${asset.source}`,
    `Versione Commons: ${asset.timestamp}`,
    `Licenza: ${license}`,
    asset.metadata.LicenseUrl?.value ??
      "Dominio pubblico come indicato nella pagina sorgente Commons.",
    "Adattamenti Flag Duel: stili espansi, metadati editor rimossi, geometria normalizzata a 300x200; eventuali sfumature/semitrasparenze appiattite, curve convertite in segmenti vettoriali e microtesti rimossi. Dettagli per bandiera in assets/generated/regions-report.json.",
    "Originali e metadati completi conservati in assets/regions/. La licenza del singolo asset vale anche per la relativa versione normalizzata e le superfici SVG derivate; non viene sostituita dalla MIT del codice.",
    ...(version
      ? [
          readFileSync(
            `third_party/upstream/CC-BY-SA-${version}.txt`,
            "utf8",
          ).trim(),
        ]
      : []),
  ].join("\n\n");
  notices.set(`italian-region-${asset.code}`, {
    name: `Bandiera ${asset.name}`,
    version: asset.timestamp,
    license,
    source: asset.source,
    text: attribution,
  });
}
const sorted = [...notices.values()].sort((a, b) =>
  `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`),
);
const combined =
  "Flag Duel — avvisi di terze parti / Third-party notices\n\nIl codice originale di Flag Duel è MIT (vedere LICENSE).\nI componenti sotto conservano le rispettive licenze e copyright.\nGenerato da npm run licenses usando package-lock.json e i testi originali.\n\n" +
  sorted
    .map(
      (n) =>
        `${"=".repeat(72)}\n${n.name} ${n.version} — ${n.license}\n${n.source}\n\n${n.text}`,
    )
    .join("\n\n") +
  "\n";
mkdirSync("third_party", { recursive: true });
mkdirSync("apps/web/public", { recursive: true });
writeFileSync("third_party/THIRD_PARTY_LICENSES.txt", combined);
writeFileSync("apps/web/public/THIRD_PARTY_LICENSES.txt", combined);
const heading = [
  "# Attribuzioni e licenze di terze parti",
  "",
  "Il codice originale di Flag Duel è distribuito sotto [MIT](LICENSE). Asset e dipendenze conservano le proprie licenze: la MIT del progetto non le sostituisce.",
  "",
  "Testi integrali di copyright e licenze: [THIRD_PARTY_LICENSES.txt](third_party/THIRD_PARTY_LICENSES.txt). Una copia è inclusa nel frontend compilato e servita su `/THIRD_PARTY_LICENSES.txt`.",
  "",
  "Questo indice si rigenera con `npm run licenses` dopo `npm ci`; include le dipendenze di produzione installate e gli asset vendorizzati. I pacchetti di sviluppo restano disciplinati dalle licenze originali distribuite da npm.",
  "",
  "| Componente | Versione | Licenza | Fonte |",
  "| --- | --- | --- | --- |",
  ...sorted.map(
    (n) =>
      `| ${n.name} | ${n.version} | ${n.license} | [Origine](${n.source}) |`,
  ),
  "",
  "## Sorgenti aggiuntive degli avvisi",
  "",
  "Il pacchetto npm saxes 6.0.0 omette il testo completo: è conservato da [upstream v6.0.0](https://github.com/lddubeau/saxes/blob/v6.0.0/LICENSE) in third_party/upstream/. Anche il testo MIT di [Feather](https://github.com/feathericons/feather/blob/v4.29.2/LICENSE), richiamato dalla licenza ISC di Lucide, è incluso integralmente.",
  "",
];
writeFileSync("THIRD_PARTY_NOTICES.md", heading.join("\n"));
console.log(
  `Licenze e copyright conservati per ${sorted.length} componenti/asset.`,
);
