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
  browserName,
  request,
}) => {
  const a = await browser.newContext({ viewport: { width: 390, height: 844 } }),
    b = await browser.newContext({
      viewport: { width: 375, height: 667 },
      hasTouch: true,
      ...(browserName === "chromium" ? { isMobile: true } : {}),
    });
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
  await expect(pageB.locator(".overlay")).toHaveCount(0);
  await expect(pageB.locator(".entry-form-shell")).toBeVisible();
  const formAncestors = await pageB.locator("#nickname").evaluate((el) => {
    const values = [];
    for (
      let current: Element | null = el;
      current;
      current = current.parentElement
    ) {
      const style = getComputedStyle(current);
      values.push({ position: style.position, backdrop: style.backdropFilter });
    }
    return values;
  });
  expect(
    formAncestors.some(
      (style) => style.position === "fixed" || style.backdrop !== "none",
    ),
  ).toBe(false);
  // Tastiera aperta al tocco; altezza e offset vengono ripristinati in ritardo.
  await pageB.evaluate(() => {
    let height = 280,
      offset = 70;
    const viewport = window.visualViewport!;
    Object.defineProperty(viewport, "height", {
      configurable: true,
      get: () => height,
    });
    Object.defineProperty(viewport, "offsetTop", {
      configurable: true,
      get: () => offset,
    });
    document.getElementById("nickname")!.addEventListener(
      "blur",
      () => {
        window.setTimeout(() => {
          height = window.innerHeight;
          offset = 0;
          document.documentElement.dataset.keyboardRestored = "true";
          // Volutamente senza evento resize: il browser può ometterlo.
        }, 550);
      },
      { once: true },
    );
  });
  await pageB
    .getByRole("button", { name: "Entra in stanza", exact: true })
    .tap();
  await expect(pageB.getByTestId("room-code")).toBeVisible();
  await expect(pageB.locator("html")).toHaveAttribute(
    "data-keyboard-restored",
    "true",
  );
  await expect(pageB.getByRole("dialog")).toHaveCount(0);
  await pageB.evaluate(() => {
    Reflect.deleteProperty(window.visualViewport!, "height");
    Reflect.deleteProperty(window.visualViewport!, "offsetTop");
  });
  // Verifica anche una misura obsoleta ricevuta dopo l'ingresso.

  await pageB.evaluate(() => {
    Object.defineProperty(window.visualViewport!, "height", {
      configurable: true,
      get: () => 280,
    });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });

  await expect(pageB.getByTestId("room-code")).toBeVisible();
  await expect
    .poll(() =>
      pageB
        .locator(".entry-screen")
        .evaluate((el) => el.getBoundingClientRect().height),
    )
    .toBeLessThan(480);
  await expect
    .poll(() =>
      pageB.evaluate(() =>
        document.documentElement.style.getPropertyValue("--viewport-height"),
      ),
    )
    .toBe("");
  const exitBox = await pageB
    .getByRole("button", { name: "Esci", exact: true })
    .boundingBox();
  expect(exitBox).not.toBeNull();
  expect(exitBox!.y).toBeGreaterThanOrEqual(0);
  expect(exitBox!.y + exitBox!.height).toBeLessThanOrEqual(667);
  await pageB.evaluate(() => {
    Reflect.deleteProperty(window.visualViewport!, "height");
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect(
    pageB.getByRole("button", { name: "Inizia la partita" }),
  ).toHaveCount(0);
  await expect(
    pageA.getByRole("radio", { name: "Giocatore singolo", exact: true }),
  ).toBeDisabled();
  await expect(
    pageB.getByRole("radio", { name: "PvP", exact: true }),
  ).toHaveCount(0);
  const guestSettings = pageB.getByTestId("lobby-settings-summary");
  await expect(guestSettings).toHaveText("PvP · Tolleranza Standard");
  await expect(pageA.getByTestId("lobby-settings-summary")).toHaveCount(0);
  await pageA.getByText("Impostazioni avanzate", { exact: true }).click();
  await pageA.getByRole("radio", { name: /Precisa/ }).click();
  await expect(guestSettings).toHaveText("PvP · Tolleranza Precisa");
  await expect(guestSettings).toBeVisible();
  await expect(pageB.locator(".advanced-settings")).toHaveCount(0);
  await pageA.getByRole("radio", { name: /Ampia/ }).click();
  await expect(guestSettings).toHaveText("PvP · Tolleranza Ampia");
  await pageA.getByRole("radio", { name: /Precisa/ }).click();
  await expect(guestSettings).toHaveText("PvP · Tolleranza Precisa");
  await expect(pageB.getByRole("radio")).toHaveCount(0);
  await pageA.getByRole("radio", { name: /Standard/ }).click();
  await expect(guestSettings).toHaveText("PvP · Tolleranza Standard");
  await pageA.getByRole("button", { name: "Inizia la partita" }).click();
  await expect(pageA.getByTestId("own-player")).toContainText("Ada");
  await expect(pageB.getByTestId("own-player")).toContainText("Bruno");
  await expect(pageA.getByTestId("opponent-player")).toContainText("Bruno");
  await pageB.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
  });
  await pageB.keyboard.type("Italia");
  await expect(
    pageB.getByRole("combobox", { name: "Scegli una bandiera" }),
  ).toHaveValue("");
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
      const submit = p.getByRole("button", { name: "Sonda", exact: true });
      if (i === 1) {
        await submit.focus();
        await submit.press("Space");
      } else await submit.click();
    }
    await expect(pageA.getByTestId("attempt")).toHaveCount(i + 1);
    await expect(pageB.getByTestId("attempt")).toHaveCount(i + 1);
    await withinScreen(pageA);
    await withinScreen(pageB);
    if (i < 5) {
      await p.evaluate(() => (document.activeElement as HTMLElement)?.blur());
      await p.keyboard.press("Enter");
    }
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
  await pageB.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
  });
  await pageB.keyboard.type("Bangla");
  await expect(answer).toHaveValue("Bangla");
  await pageB.keyboard.press("Enter");
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
  const menu = pageA.getByRole("dialog", { name: "Menu PvP" });
  await expect(menu.getByText("Copia invito")).toHaveCount(0);
  await expect(menu.getByText("Mano 7")).toBeVisible();
  await expect(menu).not.toContainText("Ultima mano");
  await pageA.getByRole("button", { name: "Esci dalla stanza" }).click();
  await expect(
    pageA.getByRole("button", { name: "Crea stanza" }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
  await a.close();
  await b.close();
});
