import { test, expect, type Page } from "@playwright/test";
async function guess(page: Page, name: string, solo: boolean) {
  const input = page.getByRole("combobox", {
    name: solo ? "Indovina la bandiera" : "Scegli una bandiera",
  });
  await input.fill(name);
  await input.press("Enter");
  await expect(input).toHaveValue(name);
  await input.press("Enter");
}
for (const solo of [false, true])
  test(`Regioni italiane: ${solo ? "singolo" : "PvP con Color Shift e No Memory"}`, async ({
    browser,
  }) => {
    const host = await browser.newContext({
        viewport: { width: 375, height: 667 },
      }),
      guest = await browser.newContext({
        viewport: { width: 375, height: 667 },
      });
    const a = await host.newPage(),
      b = await guest.newPage();
    const errors: string[] = [];
    for (const page of [a, b])
      page.on("pageerror", (e) => errors.push(e.message));
    try {
      await a.goto("/");
      await a.getByRole("button", { name: "Crea stanza" }).click();
      await a.getByLabel("Nickname").fill("Ada");
      await a.getByLabel("Nickname").press("Enter");
      const invite = await a
        .getByLabel("Link d'invito selezionabile")
        .inputValue();
      if (solo)
        await a
          .getByRole("radio", { name: "Giocatore singolo", exact: true })
          .click();
      else {
        await b.goto(invite);
        await b.getByLabel("Nickname").fill("Bruno");
        await b.getByLabel("Nickname").press("Enter");
      }
      await a.getByText("Impostazioni avanzate", { exact: true }).click();
      const toggle = a.getByRole("switch", {
        name: "Regioni italiane",
        exact: true,
      });
      await expect(toggle).not.toBeChecked();
      await toggle.click();
      await expect(toggle).toBeChecked();
      await toggle.click();
      await expect(toggle).not.toBeChecked();
      await toggle.click();
      if (!solo) {
        await expect(b.getByTestId("lobby-settings-summary")).toContainText(
          "Regioni italiane",
        );
        await a
          .getByRole("switch", { name: "Color Shift", exact: true })
          .click();
        await a.getByRole("switch", { name: "No Memory", exact: true }).click();
        await expect(b.getByTestId("lobby-settings-summary")).toContainText(
          "No Memory",
        );
      }
      await a.reload();
      await a.getByText("Impostazioni avanzate", { exact: true }).click();
      await expect(
        a.getByRole("switch", { name: "Regioni italiane", exact: true }),
      ).toBeChecked();
      await a.getByRole("button", { name: "Inizia la partita" }).click();
      const input = a.getByRole("combobox", {
        name: solo ? "Indovina la bandiera" : "Scegli una bandiera",
      });
      await input.focus();
      await expect(a.getByRole("option")).toHaveCount(20);
      await input.fill("Italia");
      await expect(a.getByRole("option")).toHaveCount(0);
      const guesses = solo
        ? ["Piemonte"]
        : [
            "Piemonte",
            "Valle d'Aosta",
            "Toscana",
            "Umbria",
            "Lazio",
            "Marche",
            "Abruzzo",
          ];
      for (const [i, name] of guesses.entries()) {
        const active = solo || i % 2 === 0 ? a : b;
        await guess(active, name, solo);
        await expect(a.getByTestId("attempt")).toHaveCount(i + 1);
        if (!solo) {
          await expect(
            a.getByTestId("attempts").locator("img,svg"),
          ).toHaveCount(0);
          await active
            .getByRole("button", { name: "Passa", exact: true })
            .click();
        }
      }
      if (!solo)
        await a.screenshot({ path: "test-results/italian-regions-game.png" });
      else await expect(a.getByTestId("solo-attempts")).toHaveText("5");
      const final = solo || guesses.length % 2 === 0 ? a : b;
      await guess(final, "Lombardia", solo);
      await expect(a.locator(".target > img")).toHaveAttribute(
        "src",
        "/api/flags/it-25.svg",
      );
      await expect(
        a.getByRole("button", { name: "Prossima mano" }),
      ).toBeVisible();
      const winner = solo ? a : b;
      await expect(
        winner.getByTestId("own-player").locator("strong"),
      ).toHaveText("1");
      await a.getByRole("button", { name: "Prossima mano" }).click();
      if (!solo) await b.getByRole("button", { name: "Prossima mano" }).click();
      const next = solo ? a : b;
      await expect(next.getByRole("combobox")).toBeEnabled();
      await next.getByRole("combobox").focus();
      await expect(next.getByRole("option")).toHaveCount(20);
      expect(errors).toEqual([]);
    } finally {
      await host.close();
      await guest.close();
    }
  });
