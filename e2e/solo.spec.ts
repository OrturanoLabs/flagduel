import { test, expect, type Page } from "@playwright/test";
async function guess(page: Page, name: string) {
  const input = page.getByRole("combobox", { name: "Indovina la bandiera" });
  await input.fill(name);
  await input.press("Enter");
  await expect(input).toHaveValue(name);
  await expect(input).toBeFocused();
  await input.press("Enter");
}
test("giocatore singolo: scelta lobby, sei tentativi, sconfitta, vittoria e refresh", async ({
  browser,
}) => {
  const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
    }),
    intruder = await browser.newContext();
  const page = await context.newPage(),
    other = await intruder.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto("/");
    await expect(
      page.getByText("Una bandiera. Due giocatori.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Crea stanza" }).click();
    await page.getByLabel("Nickname").fill("Solo");
    await page.getByRole("button", { name: "Crea", exact: true }).click();
    const invite = await page
      .getByLabel("Link d'invito selezionabile")
      .inputValue();
    await expect(
      page.getByRole("radio", { name: "PvP", exact: true }),
    ).toBeChecked();
    await page
      .getByRole("radio", { name: "Giocatore singolo", exact: true })
      .click();
    await expect(
      page.getByRole("radio", { name: "Giocatore singolo", exact: true }),
    ).toBeChecked();
    await expect(page.getByLabel("Link d'invito selezionabile")).toHaveCount(0);
    await other.goto(invite);
    await other.getByLabel("Nickname").fill("Intruso");
    await other
      .getByRole("button", { name: "Entra in stanza", exact: true })
      .click();
    await expect(other.getByRole("alert")).toContainText("singolo");
    await expect(other.getByTestId("game")).toHaveCount(0);
    await page.getByText("Impostazioni avanzate", { exact: true }).click();
    await expect(page.getByRole("radio", { name: /Standard/ })).toBeChecked();
    await page.getByRole("radio", { name: /Ampia/ }).click();
    await expect(page.getByRole("radio", { name: /Ampia/ })).toBeChecked();
    await page.reload();
    await page.getByText("Impostazioni avanzate", { exact: true }).click();
    await expect(page.getByRole("radio", { name: /Ampia/ })).toBeChecked();
    await page.getByRole("button", { name: "Inizia la partita" }).click();
    await expect(page.getByTestId("solo-attempts")).toHaveText("6");
    const bar = page.getByRole("combobox", { name: "Indovina la bandiera" });
    await bar.fill("a");
    const secondOption = await page.getByRole("option").nth(1).innerText();
    await bar.press("ArrowDown");
    await bar.press("ArrowDown");
    await expect(page.getByRole("option").nth(1)).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await bar.press("ArrowUp");
    await expect(page.getByRole("option").first()).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await bar.press("ArrowDown");
    await bar.press("Enter");
    await expect(bar).toHaveValue(secondOption);
    await expect(page.getByTestId("attempt")).toHaveCount(0);
    await bar.fill("");

    await page.evaluate(() => {
      (document.activeElement as HTMLElement)?.blur();
    });
    await page.keyboard.press("Enter");
    await expect(bar).toHaveValue("");
    await expect(page.getByTestId("attempt")).toHaveCount(0);
    await bar.focus();
    await bar.press("Enter");
    await expect(bar).toHaveValue("");
    await expect(page.getByTestId("attempt")).toHaveCount(0);
    await page.getByRole("button", { name: "Menu stanza" }).click();
    const menu = page.getByRole("dialog", { name: "Menu giocatore singolo" });
    await expect(menu).not.toContainText("STANZA");
    await expect(menu.getByRole("button")).toHaveCount(2);
    await expect(
      menu.getByRole("button", { name: "Esci dalla stanza" }),
    ).toBeVisible();
    await expect(menu.getByText("Copia invito")).toHaveCount(0);
    await page.keyboard.type("Italia");
    await expect(bar).toHaveValue("");
    await menu.getByRole("button", { name: "Chiudi menu" }).click();

    const countries = [
      "Francia",
      "Russia",
      "Italia",
      "Germania",
      "Paesi Bassi",
      "Austria",
    ];
    for (let i = 0; i < countries.length; i++) {
      if (i === 0) {
        // Digitazione senza focus, cancellazione e completamento dopo blur.
        await page.evaluate(() => {
          (document.activeElement as HTMLElement)?.blur();
        });
        await page.keyboard.type("Franz");
        await expect(bar).toHaveValue("Franz");
        await page.locator(".scorebar").click({ position: { x: 8, y: 5 } });
        await expect(page.getByRole("listbox")).toHaveCount(0);
        await page.keyboard.press("Backspace");
        await expect(bar).toHaveValue("Fran");
        await page.locator(".scorebar").click({ position: { x: 8, y: 5 } });
        await expect(page.getByRole("listbox")).toHaveCount(0);
        await expect(bar).toHaveValue("Fran");
        await page.keyboard.press("Enter");
        await expect(bar).toHaveValue("Francia");
        await expect(page.getByTestId("attempt")).toHaveCount(0);
        await page.keyboard.press("Enter");
      } else await guess(page, countries[i]);
      await expect(page.getByTestId("attempt")).toHaveCount(i + 1);
      await expect(
        page.getByRole("button", { name: "Risolvi", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Passa", exact: true }),
      ).toHaveCount(0);
      await expect(page.getByTestId("solo-attempts")).toHaveText(String(5 - i));
      if (i === 0) {
        await page.reload();
        await expect(page.getByTestId("solo-attempts")).toHaveText("5");
        await expect(page.getByTestId("attempt")).toHaveCount(1);
        await expect(
          page.getByRole("combobox", { name: "Indovina la bandiera" }),
        ).toHaveValue("");
      }
    }
    await expect(
      page.getByRole("button", { name: "Prossima mano" }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Tentativi esauriti");
    await expect(page.getByTestId("own-player")).toContainText("0");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= window.innerHeight + 1,
      ),
    ).toBe(true);
    await page.screenshot({ path: "test-results/solo-six-attempts.png" });
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("solo-attempts")).toHaveText("6");
    await guess(page, "Bangladesh");
    await expect(page.getByRole("status")).toContainText("Indovinata");
    await expect(page.getByTestId("own-player")).toContainText("1");
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("solo-attempts")).toHaveText("6");
    await expect(page.getByTestId("own-player")).toContainText("1");
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await intruder.close();
  }
});
