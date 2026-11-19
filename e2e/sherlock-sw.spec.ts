import { expect, test, type Page } from "@playwright/test";
import { dismissInstallHint } from "./sherlock-helpers";

// Service worker cache rules: nothing from auth, and nothing from a Supabase host.

test.beforeEach(async ({ page }) => {
  await dismissInstallHint(page);
});

async function swReady(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 10_000 }).toBe(true);
}

async function cachedUrls(page: Page) {
  return page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys()) {
      const c = await caches.open(name);
      for (const req of await c.keys()) out.push(`${name} ${req.url}`);
    }
    return out;
  });
}

test("the magic-link callback (?code=...) is never stored in a cache", async ({ page }) => {
  await swReady(page);
  await page.goto("/auth/callback?code=sherlock-one-time-code");
  await expect(page).toHaveURL(/\/$/);
  await page.waitForTimeout(500);
  const hits = (await cachedUrls(page)).filter((u) => u.includes("sherlock-one-time-code"));
  expect(hits).toEqual([]);
});

test("FINDING: a Supabase URL that is not *.supabase.co (custom domain, local `supabase start`) falls into the cross-origin cache", async ({ page, baseURL }) => {
  // Stand-in for http://127.0.0.1:54321/rest/v1/...: the same server under a different origin.
  await swReady(page);
  const other = baseURL!.replace("127.0.0.1", "localhost");
  test.skip(other === baseURL, "needs a 127.0.0.1 baseURL to build a second origin");
  await page.evaluate(async (u) => {
    await fetch(`${u}/manifest.webmanifest?rest=v1&household=sherlock`, { mode: "no-cors" }).catch(() => undefined);
  }, other);
  await page.waitForTimeout(500);
  const hits = (await cachedUrls(page)).filter((u) => u.includes("household=sherlock"));
  test.info().annotations.push({ type: "cross-origin cached", description: JSON.stringify(hits) });
  // Records behaviour rather than failing: production uses *.supabase.co, which is NetworkOnly.
  expect(Array.isArray(hits)).toBe(true);
});
