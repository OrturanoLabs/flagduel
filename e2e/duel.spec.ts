import { test, expect, type Page } from "@playwright/test";
async function withinScreen(p: Page) {
  const viewport = p.viewportSize()!;
  await expect
    .poll(() =>
      p
        .locator(".game-screen")
        .evaluate((el) => el.getBoundingClientRect().height),
    )
    .toBeLessThanOrEqual(viewport.height + 1);
  const boxes = await p
    .locator(".scorebar,.target,.attempts,.controls")
    .evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      }),
    );
  for (const b of boxes) {
    expect(b.top).toBeGreaterThanOrEqual(0);
    expect(b.bottom).toBeLessThanOrEqual(viewport.height + 1);
    expect(b.left).toBeGreaterThanOrEqual(0);
    expect(b.right).toBeLessThanOrEqual(viewport.width + 1);
  }
  expect(
    await p.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight + 1,
    ),
  ).toBe(true);
  const attempts = await p
    .getByTestId("attempt")
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  for (const height of attempts) expect(height).toBeGreaterThan(22);
}
async function pick(
  p: Page,
  country: string,
  placeholder = "Scegli una bandiera",
) {
  await p.getByRole("combobox", { name: placeholder }).fill(country);
  await expect(p.getByRole("listbox").locator("img,svg")).toHaveCount(0);
  await p.getByRole("option", { name: new RegExp(country) }).click();
}
test("obsidian mobile: creatore, codice breve, sei tentativi, nessuno scroll, sette mani e rientro", async ({
  browser,
  request,
}) => {
  const a = await browser.newContext({ viewport: { width: 390, height: 844 } }),
    b = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const pageA = await a.newPage(),
    pageB = await b.newPage();
  const errors: string[] = [];
  for (const p of [pageA, pageB])
    p.on("pageerror", (e) => errors.push(e.message));
  await pageA.goto("/");
  await pageA.screenshot({ path: "test-results/obsidian-home.png" });
  await pageA.getByRole("button", { name: "Crea stanza" }).click();
  await pageA.getByLabel("Nickname").fill("Ada");
  await pageA.getByRole("button", { name: "Crea", exact: true }).click();
  await expect(pageA.getByTestId("room-code")).toHaveText(/^[A-Z0-9]{3}$/);
  const invite = await pageA
    .getByLabel("Link d'invito selezionabile")
    .inputValue();
  await pageB.goto(invite);
  await pageB.getByLabel("Nickname").fill("Bruno");
  await pageB
    .getByRole("button", { name: "Entra in stanza", exact: true })
    .click();
  await expect(
    pageB.getByRole("button", { name: "Inizia la partita" }),
  ).toHaveCount(0);
  await pageA.getByRole("button", { name: "Inizia la partita" }).click();
  await expect(pageA.getByTestId("own-player")).toContainText("Ada");
  await expect(pageB.getByTestId("own-player")).toContainText("Bruno");
  await expect(pageA.getByTestId("opponent-player")).toContainText("Bruno");
  const probes = [
    "Francia",
    "Russia",
    "Italia",
    "Germania",
    "Paesi Bassi",
    "Austria",
  ];
  for (let i = 0; i < probes.length; i++) {
    const p = i % 2 === 0 ? pageA : pageB;
    if (i === 0) {
      const input = p.getByRole("combobox", { name: "Scegli una bandiera" });
      await input.fill("Fran");
      await input.press("Enter");
      await expect(input).toHaveValue("Francia");
      await expect(input).toBeFocused();
      await expect(input).toHaveAttribute("aria-expanded", "false");
      await expect(pageA.getByTestId("attempt")).toHaveCount(0);
      await input.dispatchEvent("keydown", { key: "Enter", repeat: true });
      await expect(pageA.getByTestId("attempt")).toHaveCount(0);
      await input.fill("nessunpaesecorrispondente");
      await input.press("Enter");
      await expect(pageA.getByTestId("attempt")).toHaveCount(0);
      await input.fill("Fran");
      await input.press("Enter");
      await input.press("Enter");
    } else {
      await pick(p, probes[i]);
      await p.getByRole("button", { name: "Sonda", exact: true }).click();
    }
    await expect(pageA.getByTestId("attempt")).toHaveCount(i + 1);
    await expect(pageB.getByTestId("attempt")).toHaveCount(i + 1);
    await withinScreen(pageA);
    await withinScreen(pageB);
    if (i < 5)
      await p.getByRole("button", { name: "Passa", exact: true }).click();
  }
  await pageA.screenshot({ path: "test-results/obsidian-six-attempts.png" });
  await pageB.screenshot({ path: "test-results/obsidian-small-phone.png" });
  await pageB.setViewportSize({ width: 320, height: 568 });
  await withinScreen(pageB);
  await pageB.screenshot({ path: "test-results/obsidian-320.png" });
  // Simula la riduzione del viewport provocata dalla tastiera virtuale.
  await pageB.setViewportSize({ width: 375, height: 350 });
  await withinScreen(pageB);
  await pageB.setViewportSize({ width: 375, height: 667 });
  await pageB.getByRole("button", { name: "Risolvi", exact: true }).click();
  const answer = pageB.getByRole("combobox", { name: "La tua risposta" });
  await answer.fill("Bangla");
  await answer.press("Enter");
  await expect(answer).toHaveValue("Bangladesh");
  await expect(answer).toBeFocused();
  await expect(
    pageB.getByRole("button", { name: "Prossima mano" }),
  ).toHaveCount(0);
  await answer.press("Enter");
  await expect(
    pageB.getByRole("button", { name: "Prossima mano" }),
  ).toBeVisible();
  await pageA.reload();
  await expect(
    pageA.getByRole("button", { name: "Prossima mano" }),
  ).toBeVisible();
  await expect(pageA.getByTestId("own-player")).toContainText("Ada");
  await expect(pageA.getByTestId("opponent-player")).toContainText("1");
  for (let round = 2; round <= 7; round++) {
    await pageA.getByRole("button", { name: "Prossima mano" }).click();
    await pageB.getByRole("button", { name: "Prossima mano" }).click();
    const p = round % 2 === 0 ? pageB : pageA;
    await pick(p, "Bangladesh");
    await p.getByRole("button", { name: "Sonda", exact: true }).click();
    await expect(
      pageA.getByRole("button", { name: "Prossima mano" }),
    ).toBeVisible();
  }
  await expect(pageA.getByTestId("own-player")).toContainText("3");
  await expect(pageB.getByTestId("own-player")).toContainText("4");
  expect(
    (
      await request.post("/api/lab", {
        data: { a: "fr", b: "it", tolerance: 0.04 },
      })
    ).status(),
  ).toBe(404);
  expect((await request.get("/api/report")).status()).toBe(404);
  const notices = await request.get("/THIRD_PARTY_LICENSES.txt");
  expect(notices.status()).toBe(200);
  const licenseText = await notices.text();
  expect(licenseText).toContain("Panayiotis Lipiridis");
  expect(licenseText).toContain("@catamphetamine");
  expect(licenseText).toContain("Google Inc.");
  await pageA.getByRole("button", { name: "Menu stanza" }).click();
  await pageA.getByRole("button", { name: "Esci dalla stanza" }).click();
  await expect(
    pageA.getByRole("button", { name: "Crea stanza" }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
  await a.close();
  await b.close();
});
