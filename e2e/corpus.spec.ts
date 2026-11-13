import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import type { Flag } from "../apps/server/src/game";
test("confronto visivo di195SVG: sorgente browser e superfici vettoriali preprocessate", async ({
  page,
}) => {
  test.setTimeout(120000);
  const catalog: Flag[] = JSON.parse(
    readFileSync("assets/generated/catalog.json", "utf8"),
  );
  const report: { code: string; assetPath: string }[] = JSON.parse(
    readFileSync("assets/generated/report.json", "utf8"),
  );
  const cases = catalog.map((f) => ({
    code: f.code,
    source: readFileSync(
      report.find((r) => r.code === f.code)!.assetPath,
      "utf8",
    ),
    output: f.svg,
  }));
  await page.goto("/");
  const results = await page.evaluate(async (cases) => {
    const load = (source: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const xml = new DOMParser().parseFromString(source, "image/svg+xml");
        const root = xml.documentElement;
        root.setAttribute("width", "300");
        root.setAttribute("height", "200");
        root.setAttribute("preserveAspectRatio", "none");
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(Error("SVG non renderizzabile"));
        img.src =
          "data:image/svg+xml;charset=utf-8," +
          encodeURIComponent(new XMLSerializer().serializeToString(xml));
      });
    const canvas = () => {
      const c = document.createElement("canvas");
      c.width = 300;
      c.height = 200;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#a3a5a4";
      ctx.fillRect(0, 0, 300, 200);
      return { c, ctx };
    };
    const output = [];
    for (const f of cases) {
      const [a, b] = await Promise.all([load(f.source), load(f.output)]);
      const ref = canvas(),
        got = canvas();
      ref.ctx.drawImage(a, 0, 0, 300, 200);
      got.ctx.drawImage(b, 0, 0, 300, 200);
      const x = ref.ctx.getImageData(0, 0, 300, 200).data,
        y = got.ctx.getImageData(0, 0, 300, 200).data;
      let checked = 0,
        mismatched = 0;
      for (let row = 1; row < 199; row++)
        for (let col = 1; col < 299; col++) {
          const i = (row * 300 + col) * 4;
          const boundary = [i - 4, i + 4, i - 1200, i + 1200].some((j) =>
            [0, 1, 2].some((k) => Math.abs(x[i + k] - x[j + k]) > 16),
          );
          if (boundary) continue;
          checked++;
          if ([0, 1, 2].some((k) => Math.abs(x[i + k] - y[i + k]) > 24))
            mismatched++;
        }
      output.push({
        code: f.code,
        checked,
        mismatched,
        fraction: mismatched / checked,
      });
    }
    return output;
  }, cases);
  mkdirSync("test-results", { recursive: true });
  writeFileSync(
    "test-results/svg-visual-audit.json",
    JSON.stringify(results, null, 2),
  );
  expect(results.filter((r) => r.fraction > 0.005)).toEqual([]);
});
