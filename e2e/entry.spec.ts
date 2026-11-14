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
  } finally {
    await host.close();
    await guest.close();
  }
});
