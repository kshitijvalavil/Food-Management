import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3210);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

// The iPhone project runs on real WebKit in CI (GitHub Actions installs it) and on the
// preinstalled Chromium locally, with the iPhone 15 viewport, touch and user agent either way.
// Override with PW_IPHONE_ENGINE=webkit|chromium (PW_IPHONE_WEBKIT=1 still forces WebKit).
type Engine = "webkit" | "chromium";
const envEngine = process.env.PW_IPHONE_ENGINE;
const iphoneEngine: Engine =
  envEngine === "webkit" || envEngine === "chromium"
    ? envEngine
    : process.env.PW_IPHONE_WEBKIT || process.env.CI
      ? "webkit"
      : "chromium";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    {
      name: "iPhone 15",
      use: { ...devices["iPhone 15"], browserName: iphoneEngine },
    },
    { name: "Pixel 8", use: { ...devices["Pixel 8"] } },
  ],
  // Reuses a server that is already running on PORT; otherwise starts the production build in demo mode.
  // Build first with: NEXT_PUBLIC_DEMO=1 npm run build
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
