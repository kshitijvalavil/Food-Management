import { expect, test } from "@playwright/test";
import { XSS, dismissInstallHint, expectNoHorizontalScroll, isoDay, row, seedDraft, trapXss } from "./sherlock-helpers";

// Review screen edge cases, driven through a seeded sessionStorage draft (demo mode).

test.beforeEach(async ({ page }) => {
  await dismissInstallHint(page);
});

test("every row removed: empty state, Save disabled, title says 0", async ({ page }) => {
  await seedDraft(page, [row({ name: "Apple" }), row({ name: "Bread" }), row({ name: "Curd" })]);
  await page.goto("/capture/review");
  await expect(page.getByTestId("review-title")).toHaveText("Review 3 items");
  for (let i = 0; i < 3; i++) {
    await page.getByTestId("review-row-toggle").first().click();
    await page.getByTestId("review-remove").click();
  }
  await expect(page.getByTestId("review-title")).toHaveText("Review 0 items");
  await expect(page.getByText("Nothing to review")).toBeVisible();
  await expect(page.getByTestId("review-save")).toBeDisabled();
  // Survives a reload (sessionStorage draft).
  await page.reload();
  await expect(page.getByTestId("review-title")).toHaveText("Review 0 items");
});

test("quantity 0 and negative from a bad draft are refused on Save with a message, and nothing is saved", async ({ page }) => {
  await seedDraft(page, [row({ name: "Zero milk", quantity: 0 }), row({ name: "Negative eggs", quantity: -3 })]);
  await page.goto("/capture/review");
  await expect(page.getByTestId("review-title")).toHaveText("Review 2 items");
  await page.getByTestId("review-save").click();
  await expect(page.getByRole("alert").filter({ hasText: "One of the rows" })).toContainText("One of the rows has a problem");
  await expect(page).toHaveURL(/\/capture\/review$/);
  await page.goto("/kitchen?loc=fridge");
  await expect(page.getByTestId("kitchen-list")).toBeVisible();
  await expect(page.locator('[data-testid="item-row"][data-item-name="Zero milk"]')).toHaveCount(0);
});

test("stepper never drops below one step", async ({ page }) => {
  await seedDraft(page, [row({ name: "Lemons", quantity: 1 })]);
  await page.goto("/capture/review");
  await page.getByTestId("review-row-toggle").click();
  await expect(page.getByTestId("review-qty-minus")).toBeDisabled();
  await page.getByTestId("review-qty-plus").click();
  await expect(page.getByTestId("review-qty")).toHaveText("2");
  await page.getByTestId("review-qty-minus").click();
  await expect(page.getByTestId("review-qty")).toHaveText("1");
  await expect(page.getByTestId("review-qty-minus")).toBeDisabled();
});

test("clearing the date keeps the old date; a past date is accepted (finding)", async ({ page }) => {
  const d = isoDay(5);
  await seedDraft(page, [row({ name: "Yoghurt", expires_on: d })]);
  await page.goto("/capture/review");
  await page.getByTestId("review-row-toggle").click();
  const input = page.getByTestId("review-date-input");
  await expect(input).toHaveValue(d);
  await expect(input).toHaveAttribute("min", isoDay(0));
  await input.fill("");
  await expect(input).toHaveValue(d);
  await input.fill(isoDay(-10));
  // min= is only advisory: the draft takes the past date and the day count goes negative.
  await expect(input).toHaveValue(isoDay(-10));
  await expect(page.getByTestId("review-save")).toBeEnabled();
});

test("a 'check me' item blocks Save until resolved", async ({ page }) => {
  await seedDraft(page, [row({ name: "Coriander", confidence: 0.61, category_hint: "fresh herbs", origin: "photo" }), row({ name: "Milk" })]);
  await page.goto("/capture/review");
  await expect(page.getByTestId("check-me")).toContainText("Coriander?");
  await expect(page.getByTestId("check-me")).toContainText("61% sure.");
  await expect(page.getByTestId("review-save")).toBeDisabled();
  await expect(page.getByTestId("review-blocked")).toHaveText("Check 1 item first.");
  // Editing the location alone does not resolve it.
  await page.getByTestId("check-me-change").click();
  await page.getByTestId("review-loc-pantry").click();
  await expect(page.getByTestId("review-save")).toBeDisabled();
  await page.getByTestId("check-me-done").click();
  await expect(page.getByTestId("check-me")).toHaveCount(0);
  await expect(page.getByTestId("review-save")).toBeEnabled();
  await page.getByTestId("review-save").click();
  await expect(page).toHaveURL(/\/kitchen\?loc=/);
});

test("check-me renamed to an empty name: Save shows the validation error", async ({ page }) => {
  await seedDraft(page, [row({ name: "Coriander", confidence: 0.4 })]);
  await page.goto("/capture/review");
  await page.getByTestId("check-me-change").click();
  await page.getByTestId("review-name-input").fill("   ");
  await page.getByTestId("check-me-done").click();
  await page.getByTestId("review-save").click();
  await expect(page.getByRole("alert").filter({ hasText: "empty name" })).toBeVisible();
  await expect(page).toHaveURL(/\/capture\/review$/);
});

const LONG = "Supercalifragilisticexpialidocious".repeat(3).slice(0, 80);
const SPACED = "Extra virgin cold pressed organic single estate olive oil from the hills of Crete".slice(0, 80);

test("a very long name in normal rows does not cause horizontal scroll (320px)", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await seedDraft(page, [row({ name: LONG, quantity: 12, unit: "pack" }), row({ name: SPACED })]);
  await page.goto("/capture/review");
  await expect(page.getByTestId("review-title")).toHaveText("Review 2 items");
  await expectNoHorizontalScroll(page, "review long names");
});

test("BUG: the row editor overflows at 320px for an ordinary 27-character name ('Remove <name>' button does not wrap)", async ({ page }) => {
  test.fail(true, "Known bug for Sir Pixelot: the editor/remove button grows with the name; remove test.fail once fixed");
  await page.setViewportSize({ width: 320, height: 640 });
  await seedDraft(page, [row({ name: "Amul Taaza toned milk pouch" })]);
  await page.goto("/capture/review");
  await page.getByTestId("review-row-toggle").click();
  await expectNoHorizontalScroll(page, "review long name, editor open");
});

test("BUG: a very long unbroken name on a 'check me' card overflows to ~710px at 320px", async ({ page }) => {
  test.fail(true, "Known bug for Sir Pixelot: .chk card name has no min-width:0 / overflow-wrap; remove test.fail once fixed");
  await page.setViewportSize({ width: 320, height: 640 });
  await seedDraft(page, [row({ name: LONG, confidence: 0.3 })]);
  await page.goto("/capture/review");
  await expect(page.getByTestId("check-me")).toBeVisible();
  await expectNoHorizontalScroll(page, "check-me long name");
});

test("XSS-looking names render as text on Review and in the Kitchen after saving", async ({ page }) => {
  const xss = trapXss(page);
  await seedDraft(page, [row({ name: XSS, location: "pantry" }), row({ name: `"><svg onload=alert(2)>`, confidence: 0.3 })]);
  await page.goto("/capture/review");
  await expect(page.getByTestId("review-row").first()).toContainText("<img src=x");
  await expect(page.getByTestId("check-me")).toContainText("<svg onload");
  await page.getByTestId("check-me-yes").click();
  await page.getByTestId("review-save").click();
  await expect(page).toHaveURL(/\/kitchen\?loc=/);
  await page.goto("/kitchen?loc=pantry");
  await expect(page.locator(`[data-testid="item-row"]`).filter({ hasText: "<img src=x" })).toHaveCount(1);
  await page.locator(`[data-testid="item-row"]`).filter({ hasText: "<img src=x" }).click();
  await expect(page.getByTestId("item-name")).toContainText("<img src=x");
  await page.goto("/");
  await page.waitForTimeout(500);
  await xss.check();
});

test("30 items render, and Save writes all 30", async ({ page }) => {
  const items = Array.from({ length: 30 }, (_, i) => row({ name: `Bulk item ${String(i + 1).padStart(2, "0")}`, location: "freezer" }));
  await seedDraft(page, items);
  await page.goto("/capture/review");
  await expect(page.getByTestId("review-title")).toHaveText("Review 30 items");
  await expect(page.getByTestId("review-row")).toHaveCount(30);
  await expect(page.getByTestId("review-save")).toHaveText("Save 30 to Kitchen");
  await page.getByTestId("review-save").click();
  await expect(page).toHaveURL(/\/kitchen\?loc=freezer/);
  await expect(page.locator('[data-testid="item-row"][data-item-name^="Bulk item"]')).toHaveCount(30);
});
