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
  for (const colorShift of [false, true])
    for (const noMemory of [false, true]) {
      const experimental = colorShift || noMemory;
      test(`${solo ? "singolo" : "PvP"}: Color Shift ${colorShift}, No Memory ${noMemory}`, async ({
        browser,
      }) => {
        const host = await browser.newContext({
          viewport: { width: 375, height: 667 },
        });
        const guest = await browser.newContext({
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
          await expect(
            a.getByRole("switch", { name: "Color Shift", exact: true }),
          ).not.toBeChecked();
          await expect(
            a.getByRole("switch", { name: "No Memory", exact: true }),
          ).not.toBeChecked();
          if (colorShift)
            await a
              .getByRole("switch", { name: "Color Shift", exact: true })
              .click();
          if (noMemory)
            await a
              .getByRole("switch", { name: "No Memory", exact: true })
              .click();
          await a.getByRole("radio", { name: /Ampia/ }).click();
          if (!solo) {
            const summary = b.getByTestId("lobby-settings-summary");
            if (colorShift) await expect(summary).toContainText("Color Shift");
            if (noMemory) await expect(summary).toContainText("No Memory");

            await expect(b.getByRole("switch")).toHaveCount(0);
            await expect(b.locator(".advanced-settings")).toHaveCount(0);
          }
          await a.getByRole("button", { name: "Inizia la partita" }).click();
          await expect(a.getByTestId("game")).toBeVisible();
          if (solo)
            await expect(a.getByTestId("solo-attempts")).toHaveText(
              experimental ? "∞" : "6",
            );
          const wrong = [
            "Portogallo",
            "Francia",
            "Russia",
            "Italia",
            "Germania",
            "Paesi Bassi",
            "Austria",
            "Svezia",
            "Norvegia",
          ].slice(0, experimental ? 9 : 1);
          for (const [i, country] of wrong.entries()) {
            const active = solo || i % 2 === 0 ? a : b;
            await guess(active, country, solo);
            await expect(a.getByTestId("attempt")).toHaveCount(i + 1);
            if (i === 0) {
              await expect(a.locator(".target path").first()).toBeVisible();
              const colors = await a
                .locator(".target path")
                .evaluateAll((paths) =>
                  paths.map((p) => p.getAttribute("fill")),
                );
              expect(
                colors.every((c) => c === "#006a4e" || c === "#f42a41"),
              ).toBe(!colorShift);
              const target = await a.locator(".target").innerHTML();
              if (!solo)
                await expect
                  .poll(() => b.locator(".target").innerHTML())
                  .toBe(target);
              await a.reload();
              await expect(a.getByTestId("attempt")).toHaveCount(1);
              await expect
                .poll(() => a.locator(".target").innerHTML())
                .toBe(target);
            }
            if (experimental) {
              await expect(
                a.getByTestId("attempts").locator("img,svg"),
              ).toHaveCount(0);
              await expect(a.getByTestId("attempt").first()).toHaveText(
                wrong[0],
              );
            } else
              await expect(
                a.getByTestId("attempt").first().locator("img,svg"),
              ).toHaveCount(2);
            if (!solo)
              await active
                .getByRole("button", { name: "Passa", exact: true })
                .click();
          }
          const history = a.getByTestId("attempts");
          const names = await history
            .locator(".attempt-name")
            .allTextContents();
          expect(names).toEqual(wrong);
          expect(
            await a.evaluate(
              () =>
                document.documentElement.scrollHeight <= window.innerHeight + 1,
            ),
          ).toBe(true);
          if (experimental) {
            await history.evaluate((el) => {
              el.scrollTop = 0;
            });
            await expect(a.getByTestId("attempt").first()).toBeInViewport();
            await history.evaluate((el) => {
              el.scrollTop = el.scrollHeight;
            });
            await expect(a.getByTestId("attempt").last()).toBeInViewport();
          }
          const final = solo || wrong.length % 2 === 0 ? a : b;
          await guess(final, "Bangladesh", solo);
          await expect(
            a.getByRole("button", { name: "Prossima mano" }),
          ).toBeVisible();
          await expect(a.locator(".target > img")).toHaveAttribute(
            "src",
            "/api/flags/bd.svg",
          );
          await expect(a.locator(".target")).toHaveCSS("filter", "none");
          if (experimental)
            await expect(
              a.getByTestId("attempts").locator("img,svg"),
            ).toHaveCount(0);
          if (solo)
            await expect(
              a.getByTestId("own-player").locator("strong"),
            ).toHaveText("1");
          await a.getByRole("button", { name: "Prossima mano" }).click();
          if (!solo)
            await b.getByRole("button", { name: "Prossima mano" }).click();
          await expect(a.getByTestId("attempt")).toHaveCount(0);
          await expect(a.locator(".target path")).toHaveCount(0);
          const scoresBefore = await a
            .locator(".player strong")
            .allTextContents();
          await a.getByRole("button", { name: "Menu stanza" }).click();
          if (experimental) {
            await a.getByRole("button", { name: "Patta", exact: true }).click();
            if (!solo) {
              await expect(b.getByRole("status")).toContainText(
                "Proposta di patta",
              );
              await expect(a.locator(".target img")).toHaveCount(0);
              await a.getByRole("button", { name: "Menu stanza" }).click();
              await a.getByRole("button", { name: "Annulla proposta" }).click();
              await a.getByRole("button", { name: "Menu stanza" }).click();
              await a
                .getByRole("button", { name: "Patta", exact: true })
                .click();
              await b.getByRole("button", { name: "Menu stanza" }).click();
              await b.getByRole("button", { name: "Rifiuta patta" }).click();
              await expect(a.locator(".target img")).toHaveCount(0);
              await a.getByRole("button", { name: "Menu stanza" }).click();
              await a
                .getByRole("button", { name: "Patta", exact: true })
                .click();
              await b.getByRole("button", { name: "Menu stanza" }).click();
              await b.getByRole("button", { name: "Accetta patta" }).click();
            }
            await expect(a.locator(".target > img")).toHaveAttribute(
              "src",
              "/api/flags/bd.svg",
            );
            await expect(
              a.getByRole("button", { name: "Prossima mano" }),
            ).toBeVisible();
            await expect(a.getByRole("status")).toContainText("Patta");
            expect(await a.locator(".player strong").allTextContents()).toEqual(
              scoresBefore,
            );
          } else {
            await expect(
              a.getByRole("button", { name: "Patta", exact: true }),
            ).toHaveCount(0);
            await a.getByRole("button", { name: "Chiudi menu" }).click();
          }
          expect(errors).toEqual([]);
        } finally {
          await host.close();
          await guest.close();
        }
      });
    }
