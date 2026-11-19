import { expect, test } from "@playwright/test";

// Demo-mode smoke test: Add -> Search -> add an item -> Review -> Save -> see it in the Kitchen.
// Needs a build made with NEXT_PUBLIC_DEMO=1 (see README "Run locally").
test.beforeEach(async ({ page }) => {
  // Skip the iPhone "Add to Home Screen" sheet so it doesn't cover the flow.
  await page.addInitScript(() => localStorage.setItem("shelflife.a2hs.dismissed", "e2e"));
});

test("add an item by search and find it in the Kitchen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("screen-today")).toBeVisible();
  await expect(page.getByTestId("use-soon")).toBeVisible();

  await page.getByTestId("tab-add").click();
  await expect(page.getByTestId("add-sheet")).toBeVisible();
  await page.getByTestId("add-option-search").click();

  await expect(page.getByTestId("screen-search")).toBeVisible();
  await page.getByTestId("search-input").fill("basm");
  const add = page.getByTestId("search-add").filter({ hasText: "Add" }).first();
  await expect(page.getByTestId("search-results")).toContainText("Basmati rice");
  await add.click();
  await expect(page.getByTestId("review-cta")).toContainText("1");
  await page.getByTestId("review-cta").click();

  await expect(page.getByTestId("review-title")).toHaveText("Review 1 item");
  await expect(page.getByTestId("review-row")).toContainText("Basmati rice 5 kg");
  await expect(page.getByTestId("date-source")).toHaveText(/USDA/);
  await page.getByTestId("review-save").click();

  await expect(page).toHaveURL(/\/kitchen\?loc=pantry/);
  await expect(page.getByTestId("kitchen-tab-pantry")).toHaveAttribute("aria-selected", "true");
  const row = page.locator('[data-testid="item-row"][data-item-name="Basmati rice"]');
  await expect(row).toBeVisible();
  await expect(row.getByTestId("day-count")).toBeVisible();
});

test("laptop user agents are sent to the QR handoff page", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
  });
  const page = await ctx.newPage();
  await page.goto(baseURL ?? "/");
  await expect(page).toHaveURL(/\/open-on-phone$/);
  await expect(page.getByTestId("open-on-phone-qr").locator("svg")).toBeVisible();
  await expect(page.getByTestId("open-on-phone-url")).toHaveText(/^http:\/\/127\.0\.0\.1:\d+$/);
  await ctx.close();
});
