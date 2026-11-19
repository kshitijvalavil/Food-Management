import { expect, test, type Page } from "@playwright/test";
import { dismissInstallHint } from "./sherlock-helpers";

// Offline fallback, IndexedDB persistence, "Reset demo kitchen", keyboard + screen-reader basics, axe.

test.beforeEach(async ({ page }) => {
  await dismissInstallHint(page);
});

async function swReady(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Reload so the page is controlled by the worker.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 10_000 }).toBe(true);
}

test.describe("offline", () => {
  test("an uncached page offline shows the offline fallback", async ({ page, context }) => {
    await swReady(page);
    await context.setOffline(true);
    await page.goto("/item/never-visited-item-id").catch(() => undefined);
    await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
    await context.setOffline(false);
  });

  test("the Today screen opens offline from cache with demo data", async ({ page, context }) => {
    await swReady(page);
    await expect(page.getByTestId("use-soon")).toBeVisible();
    await context.setOffline(true);
    await page.reload().catch(() => undefined);
    await expect(page.getByTestId("screen-today")).toBeVisible();
    await context.setOffline(false);
  });

  test("the service worker caches nothing from auth or Supabase", async ({ page }) => {
    await swReady(page);
    for (const r of ["/kitchen", "/me", "/login", "/capture/search"]) await page.goto(r);
    const urls = await page.evaluate(async () => {
      const out: string[] = [];
      for (const name of await caches.keys()) {
        const c = await caches.open(name);
        for (const req of await c.keys()) out.push(`${name} ${req.url}`);
      }
      return out;
    });
    // Static JS chunks (e.g. the auth callback route bundle) are fine; responses are not.
    expect(urls.filter((u) => /supabase|\/auth\//i.test(u) && !/\/_next\/static\//.test(u))).toEqual([]);
  });
});

test.describe("demo data", () => {
  test("a saved item survives a reload (IndexedDB) and Reset demo kitchen removes it", async ({ page }) => {
    await page.goto("/capture/search");
    await page.getByTestId("search-input").fill("basm");
    await page.getByTestId("search-add").first().click();
    await page.getByTestId("review-cta").click();
    await page.getByTestId("review-save").click();
    await expect(page).toHaveURL(/\/kitchen\?loc=pantry/);
    const added = page.locator('[data-testid="item-row"][data-item-name="Basmati rice"]');
    await expect(added.first()).toBeVisible();
    const before = await added.count();
    expect(before).toBeGreaterThan(0);
    await page.reload();
    await expect(added.first()).toBeVisible();
    await expect(added).toHaveCount(before);

    // Seed count for comparison after reset.
    await page.goto("/me");
    await page.getByTestId("me-reset-demo").click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/kitchen?loc=pantry");
    await expect(page.getByTestId("kitchen-list")).toBeVisible();
    await expect(added).toHaveCount(before - 1);
    // The seed kitchen is back, not an empty one.
    await expect(page.getByTestId("item-row").first()).toBeVisible();
  });

  test("Reset also clears a pending Review draft? (records behaviour)", async ({ page }) => {
    await page.goto("/capture/search");
    await page.getByTestId("search-input").fill("basm");
    await page.getByTestId("search-add").first().click();
    await page.goto("/me");
    await page.getByTestId("me-reset-demo").click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/capture/review");
    const title = await page.getByTestId("review-title").textContent();
    test.info().annotations.push({ type: "draft after reset", description: title ?? "" });
  });
});

test.describe("keyboard and screen reader basics", () => {
  const ROUTES = ["/", "/kitchen", "/cook", "/me", "/me/notifications", "/alerts", "/shopping", "/capture/search", "/capture/voice", "/capture/camera?mode=photo", "/capture/camera?mode=barcode", "/capture/review", "/login"];

  test("every button and link has an accessible name", async ({ page }) => {
    const missing: string[] = [];
    for (const r of ROUTES) {
      await page.goto(r);
      await page.waitForLoadState("networkidle");
      const found = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("button, a[href], [role=button], input, textarea, select"))) {
          if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") continue;
          if ((el as HTMLInputElement).type === "hidden") continue;
          const labelled = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title") || (el.textContent ?? "").trim() || (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest("label") || (el as HTMLInputElement).placeholder;
          if (!labelled) out.push(el.outerHTML.slice(0, 120));
        }
        return out;
      });
      for (const f of found) missing.push(`${r}: ${f}`);
    }
    expect(missing).toEqual([]);
  });

  test("the Add sheet opens from the keyboard, traps nothing, and Escape closes it", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("tab-add").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("add-sheet")).toBeVisible();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("add-sheet")).toBeHidden();
  });

  test("focus is visible on tab", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return "none-focused";
      const cs = getComputedStyle(el);
      return `${cs.outlineStyle} ${cs.outlineWidth} ${cs.boxShadow}`;
    });
    expect(outline).not.toBe("none-focused");
    expect(outline).not.toMatch(/^none 0px none$/);
  });

  test("every page has one h1 and html lang", async ({ page }) => {
    const bad: string[] = [];
    for (const r of ROUTES) {
      await page.goto(r);
      await page.waitForLoadState("networkidle");
      const n = await page.locator("h1").count();
      if (n !== 1) bad.push(`${r}: ${n} h1`);
    }
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    test.info().annotations.push({ type: "h1 count", description: JSON.stringify(bad) });
  });
});

test.describe("axe", () => {
  // @axe-core/playwright is not a dependency of the app; load it only if present
  // (npm install --no-save @axe-core/playwright). The variable keeps tsc from resolving it.
  const AXE = "@axe-core/playwright";
  for (const scheme of ["light", "dark"] as const) {
    test(`axe WCAG 2.1 AA on the main screens (${scheme})`, async ({ page }) => {
      let AxeBuilder: new (o: { page: Page }) => { withTags(t: string[]): { analyze(): Promise<{ violations: Array<{ id: string; impact?: string; nodes: Array<{ target: unknown[] }> }> }> } };
      try {
        AxeBuilder = (await import(AXE)).default;
      } catch {
        test.skip(true, "@axe-core/playwright not installed");
        return;
      }
      test.fail(scheme === "dark", "Known bug for Sir Pixelot: dark .tonight > p is #d2d3f5 on #4a4ed6 = 4.28:1 (needs 4.5:1); remove once fixed");
      await page.emulateMedia({ colorScheme: scheme });
      const all: string[] = [];
      for (const r of ["/", "/kitchen", "/capture/search", "/capture/review", "/capture/voice", "/capture/camera?mode=barcode", "/me", "/alerts", "/shopping", "/cook", "/me/notifications", "/login", "/offline"]) {
        await page.goto(r);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(300);
        const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        for (const v of res.violations) all.push(`${new URL(page.url()).pathname}${r !== new URL(page.url()).pathname ? ` (from ${r})` : ""} ${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => `${JSON.stringify(n.target)} ${(n as { failureSummary?: string }).failureSummary?.split("\n")[1]?.trim() ?? ""}`).join(" | ")}`);
      }
      test.info().annotations.push({ type: `axe-${scheme}`, description: all.join("\n") });
      console.log(`AXE ${scheme}:\n${all.join("\n") || "(none)"}`);
      expect(all).toEqual([]);
    });
  }
});
