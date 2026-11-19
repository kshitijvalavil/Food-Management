import { expect, test } from "@playwright/test";
import { dismissInstallHint } from "./sherlock-helpers";

// Fake camera stream (Chromium flags). WebKit has no equivalent, so these skip there.
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["camera"],
});

test.beforeEach(async ({ page }) => {
  await dismissInstallHint(page);
});

test("photo: shutter -> 7 items, 1 to check", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "fake media flags are Chromium-only");
  await page.goto("/capture/camera?mode=photo");
  await expect(page.getByTestId("screen-camera")).toHaveAttribute("data-cam", "live", { timeout: 10_000 });
  await page.getByTestId("camera-shutter").click();
  await expect(page.getByTestId("camera-hint")).toContainText("needs a check", { timeout: 10_000 });
  await page.getByTestId("review-cta").click();
  await expect(page.getByTestId("review-title")).toHaveText("Review 7 items");
  await expect(page.getByTestId("review-save")).toBeDisabled();
});

test("barcode: the live scanner starts without errors on the fake stream", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "fake media flags are Chromium-only");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/capture/camera?mode=barcode");
  await expect(page.getByTestId("screen-camera")).toHaveAttribute("data-cam", "live", { timeout: 10_000 });
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("camera-error")).toHaveCount(0);
  expect(errors).toEqual([]);
});
