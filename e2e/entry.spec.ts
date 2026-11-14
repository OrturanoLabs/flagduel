import { test, expect } from "@playwright/test";

test("mobile: crea e raggiunge una stanza con Invio dalla tastiera", async ({
  browser,
  browserName,
}) => {
  const host = await browser.newContext({
    viewport: { width: 375, height: 667 },
    hasTouch: true,
    ...(browserName === "chromium" ? { isMobile: true } : {}),
  });
  const guest = await browser.newContext({
    viewport: { width: 375, height: 667 },
    hasTouch: true,
    ...(browserName === "chromium" ? { isMobile: true } : {}),
  });
  try {
    const a = await host.newPage(),
      b = await guest.newPage();
    await a.goto("/");
    await a.getByRole("button", { name: "Crea stanza" }).tap();
    await a.getByLabel("Nickname").fill("Creatore");
    await a.getByLabel("Nickname").press("Enter");
    const code = await a.getByTestId("room-code").innerText();
    await b.goto("/");
    await b.getByRole("button", { name: "Entra", exact: true }).tap();
    await b.getByLabel("Nickname").fill("Ospite");
    await b.getByLabel("Codice stanza").fill(code);
    await b.getByLabel("Codice stanza").press("Enter");
    await expect(b.getByTestId("room-code")).toHaveText(code);
    await expect(b.getByTestId("lobby-settings-summary")).toHaveText(
      "PvP · Tolleranza Standard",
    );
    await expect(a.locator(".lobby-players")).toContainText("Ospite");
    await expect(b.locator(".entry-form-shell")).toHaveCount(0);
    const exit = await b
      .getByRole("button", { name: "Esci", exact: true })
      .boundingBox();
    expect(exit!.y).toBeGreaterThanOrEqual(0);
    expect(exit!.y + exit!.height).toBeLessThanOrEqual(667);
    await b.setViewportSize({ width: 320, height: 480 });
    await expect(b.getByTestId("lobby-settings-summary")).toBeInViewport();
    await expect(
      b.getByRole("button", { name: "Esci", exact: true }),
    ).toBeInViewport();
    await expect(
      b.locator(".guest-lobby input,.guest-lobby details"),
    ).toHaveCount(0);
    expect(
      await b.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight + 1,
      ),
    ).toBe(true);
    // Secondo ingresso: il campo perde il focus prima del tocco su Entra.
    await a.getByRole("button", { name: "Esci", exact: true }).click();
    await b.getByRole("button", { name: "Esci", exact: true }).click();
    await a.getByRole("button", { name: "Crea stanza" }).click();
    await a.getByLabel("Nickname").fill("Creatore");
    await a.getByLabel("Nickname").press("Enter");
    const secondCode = await a.getByTestId("room-code").innerText();
    await b.setViewportSize({ width: 375, height: 667 });
    await b.getByRole("button", { name: "Entra", exact: true }).click();
    await b.getByLabel("Nickname").fill("Ospite");
    await b.getByLabel("Codice stanza").fill(secondCode);
    await b.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await expect(b.getByLabel("Codice stanza")).not.toBeFocused();
    await b.getByRole("button", { name: "Entra in stanza", exact: true }).tap();
    await expect(b.getByTestId("room-code")).toHaveText(secondCode);
    const exitButton = b.getByRole("button", { name: "Esci", exact: true });
    await expect(exitButton).toBeInViewport();
    expect(
      await exitButton.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return el.contains(
          document.elementFromPoint(
            box.x + box.width / 2,
            box.y + box.height / 2,
          ),
        );
      }),
    ).toBe(true);
    await b.screenshot({
      path: "test-results/guest-lobby-closed-keyboard.png",
    });
  } finally {
    await host.close();
    await guest.close();
  }
});
