import { expect, test } from "@playwright/test";
import path from "node:path";

// Opt-in screenshot tour for design review: SHOTS_DIR=/some/dir npx playwright test screens --project="iPhone 15"
const dir = process.env.SHOTS_DIR;
test.skip(!dir, "set SHOTS_DIR to capture screenshots");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("shelflife.a2hs.dismissed", "shots"));
});

for (const scheme of ["light", "dark"] as const) {
  test(`tour ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const shot = (name: string) => page.screenshot({ path: path.join(dir!, `${name}-${scheme}.png`) });
    await page.goto("/");
    await expect(page.getByTestId("use-soon")).toBeVisible();
    await shot("today");
    await page.goto("/kitchen");
    await expect(page.getByTestId("kitchen-list")).toBeVisible();
    await shot("kitchen");
    await page.getByTestId("item-row").last().click();
    await expect(page.getByTestId("item-name")).toBeVisible();
    await shot("item");
    await page.goto("/");
    await page.getByTestId("tab-add").click();
    await page.waitForTimeout(500);
    await shot("add");
    await page.goto("/capture/camera?mode=photo");
    await page.getByTestId("camera-library-input").setInputFiles(path.resolve("public/icons/icon-512.png"));
    await expect(page.getByTestId("camera-hint")).toContainText("needs a check", { timeout: 10_000 });
    await shot("camera");
    await page.getByTestId("review-cta").click();
    await expect(page.getByTestId("review-title")).toHaveText("Review 7 items");
    await page.screenshot({ path: path.join(dir!, `review-${scheme}.png`), fullPage: true });
    await page.goto("/capture/camera?mode=barcode");
    // With no camera (headless), the number field is already showing.
    await expect(page.getByTestId("screen-camera")).not.toHaveAttribute("data-cam", "starting");
    if (await page.getByTestId("barcode-manual-toggle").isVisible()) await page.getByTestId("barcode-manual-toggle").click();
    await page.getByTestId("barcode-manual-input").fill("8901262010023");
    await page.getByTestId("barcode-manual-submit").click();
    await expect(page.getByTestId("barcode-product")).toHaveText("Amul Butter, pasteurised");
    await shot("barcode");
    await page.goto("/capture/voice");
    await shot("voice");
    await page.goto("/me/notifications");
    await shot("notifications");
  });
}
