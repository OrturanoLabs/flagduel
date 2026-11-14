import { test, expect, type Page } from "@playwright/test";
const statsPath = "/insights/e2e-statistics-access";
async function guess(page: Page, name: string, label = "Scegli una bandiera") {
  const input = page.getByRole("combobox", { name: label });
  await input.fill(name);
  await input.press("Enter");
  await expect(input).toHaveValue(name);
  await input.press("Enter");
}
test("statistiche: pagina non collegata, filtri, classifica scelte, esiti condizionati e dettaglio", async ({
  browser,
  request,
}) => {
  const host = await browser.newContext({
      viewport: { width: 1280, height: 850 },
    }),
    guest = await browser.newContext();
  const a = await host.newPage(),
    b = await guest.newPage(),
    admin = await host.newPage();
  const errors: string[] = [];
  admin.on("pageerror", (e) => errors.push(e.message));
  try {
    await a.goto("/");
    await expect(a.locator('a[href*="insights"]')).toHaveCount(0);
    await a.getByRole("button", { name: "Crea stanza" }).click();
    await a.getByLabel("Nickname").fill("Ada");
    await a.getByLabel("Nickname").press("Enter");
    const invite = await a
      .getByLabel("Link d'invito selezionabile")
      .inputValue();
    await b.goto(invite);
    await b.getByLabel("Nickname").fill("Bruno");
    await b.getByLabel("Nickname").press("Enter");
    await expect(a.locator(".lobby-players")).toContainText("Bruno");
    await a.getByText("Impostazioni avanzate", { exact: true }).click();
    await a.getByRole("radio", { name: /Precisa/ }).click();
    await expect(a.getByRole("radio", { name: /Precisa/ })).toBeChecked();
    await a.getByRole("button", { name: "Inizia la partita" }).click();
    await guess(a, "Francia");
    await a.getByRole("button", { name: "Risolvi", exact: true }).click();
    await guess(a, "Bangladesh", "La tua risposta");
    await expect(
      a.getByRole("button", { name: "Prossima mano" }),
    ).toBeVisible();
    await a.getByRole("button", { name: "Prossima mano" }).click();
    await b.getByRole("button", { name: "Prossima mano" }).click();
    await guess(b, "Russia");
    await b.getByRole("button", { name: "Risolvi", exact: true }).click();
    await guess(b, "Italia", "La tua risposta");
    await expect(
      a.getByRole("button", { name: "Prossima mano" }),
    ).toBeVisible();
    expect((await request.get("/stats.html")).status()).toBe(404);
    expect((await request.get("/api/stats")).status()).toBe(404);
    expect(
      (await request.get("/insights/incorrect/api/summary")).status(),
    ).toBe(404);
    await admin.goto(statsPath);
    await expect(
      admin.getByRole("heading", { name: "Statistiche di gioco", exact: true }),
    ).toBeVisible();
    await admin.getByLabel("Tolleranza", { exact: true }).selectOption("0.02");
    await expect(admin.getByRole("status")).toContainText(
      "2 estrazioni · 2 mani concluse",
    );
    await expect(
      admin
        .locator(".stat")
        .filter({ hasText: "Tentativi medi · risolte" })
        .locator("strong"),
    ).toHaveText("2,00");
    const countries = admin.getByTestId("countries-table");
    await expect(countries.locator("tbody tr")).toHaveCount(195);
    await admin.getByLabel("Cerca bandiera").fill("Bangladesh");
    await expect(countries.locator("tbody tr")).toHaveCount(1);
    await expect(countries.locator("tbody tr")).toContainText("50,0%");
    const choices = admin.getByTestId("selections-table");
    await expect(choices.locator("tbody tr")).toHaveCount(4);
    for (const name of ["Francia", "Russia", "Bangladesh", "Italia"])
      await expect(
        choices.getByRole("row", { name: new RegExp(name) }),
      ).toContainText("25,0%");
    const methods = admin
      .locator("section")
      .filter({
        has: admin.getByRole("heading", {
          name: "Come si vince, anche condizionando sul vincitore",
        }),
      })
      .getByRole("table");
    await expect(
      methods.locator("tbody tr").nth(1).locator("td").nth(1),
    ).toContainText("100,0%");
    await expect(
      methods.locator("tbody tr").nth(2).locator("td").nth(2),
    ).toContainText("100,0%");
    await admin
      .getByTestId("rounds-table")
      .locator("tbody tr")
      .first()
      .getByRole("button", { name: "Dettagli" })
      .click();
    await expect(admin.locator(".round-detail")).toContainText(
      "Definitiva sbagliata",
    );
    await expect(admin.locator(".round-detail")).toContainText("Italia");
    const [download] = await Promise.all([
      admin.waitForEvent("download"),
      admin.getByRole("link", { name: "Esporta CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("flag-duel-statistiche.csv");
    await admin.reload();
    await expect(admin.getByLabel("Tolleranza", { exact: true })).toHaveValue(
      "0.02",
    );
    await expect(admin.getByRole("status")).toContainText("2 estrazioni");
    await admin.getByLabel("Gioco", { exact: true }).selectOption("solo");
    await expect(admin.getByRole("status")).toContainText("0 estrazioni");
    await expect(
      admin.getByText("Nessuna mano per questi filtri.", { exact: false }),
    ).toBeVisible();
    await admin.getByLabel("Gioco", { exact: true }).selectOption("pvp");
    await expect(admin.getByRole("status")).toContainText("2 estrazioni");
    await admin.setViewportSize({ width: 390, height: 844 });
    await expect(
      admin.getByRole("heading", { name: "Statistiche di gioco", exact: true }),
    ).toBeVisible();
    expect(
      await admin.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await admin.evaluate(() => window.scrollTo(0, 0));
    await admin.screenshot({ path: "test-results/statistics-mobile.png" });
    expect(errors).toEqual([]);
  } finally {
    await Promise.allSettled([host.close(), guest.close()]);
  }
});
