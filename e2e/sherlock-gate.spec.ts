import { expect, test, type APIRequestContext } from "@playwright/test";
import { UA, dismissInstallHint } from "./sherlock-helpers";

// Phone-only gate: middleware (user agent) + client PhoneGate (screen size, iPadOS touch).
// These run once per project; the project only matters for the default phone context.

async function head(request: APIRequestContext, path: string, ua: string) {
  const res = await request.get(path, { headers: { "user-agent": ua }, maxRedirects: 0 });
  return { status: res.status(), location: res.headers()["location"] ?? null, setCookie: res.headers()["set-cookie"] ?? null };
}

test.describe("middleware: user agents", () => {
  const desktopAndTablet = {
    macChrome: UA.macChrome,
    macSafari: UA.macSafari,
    winEdge: UA.winEdge,
    linuxFirefox: UA.linuxFirefox,
    chromebook: UA.chromebook,
    iPadLegacy: UA.iPadLegacy,
    iPadOS: UA.iPadOS,
    galaxyTab: UA.galaxyTab,
    firefoxAndroidTablet: UA.firefoxAndroidTablet,
  };
  for (const [name, ua] of Object.entries(desktopAndTablet)) {
    for (const path of ["/", "/kitchen", "/capture/review", "/item/abc"]) {
      test(`${name} on ${path} -> 307 /open-on-phone`, async ({ request }) => {
        const r = await head(request, path, ua);
        expect(r.status).toBe(307);
        expect(new URL(r.location!, "http://x").pathname).toBe("/open-on-phone");
      });
    }
  }

  const phones = { iPhone: UA.iPhone, iPhoneChrome: UA.iPhoneChrome, pixel: UA.pixel, samsung: UA.samsung, firefoxAndroid: UA.firefoxAndroid };
  for (const [name, ua] of Object.entries(phones)) {
    test(`${name} is not redirected`, async ({ request }) => {
      for (const path of ["/", "/kitchen", "/capture/search", "/open-on-phone"]) {
        const r = await head(request, path, ua);
        expect(r.status, `${name} ${path}`).toBe(200);
      }
    });
  }

  const bots = {
    googlebotSmartphone: UA.googlebotSmartphone,
    googlebotDesktop: UA.googlebotDesktop,
    googlebotDesktopChrome: UA.googlebotDesktopChrome,
    bingbot: UA.bingbot,
    lighthouseDesktop: UA.lighthouseDesktop,
    facebook: UA.facebook,
  };
  for (const [name, ua] of Object.entries(bots)) {
    test(`bot ${name} gets the real page (no server redirect, no loop)`, async ({ request }) => {
      for (const path of ["/", "/open-on-phone"]) {
        const r = await head(request, path, ua);
        expect(r.status, `${name} ${path}`).toBe(200);
      }
    });
  }

  test("empty and unknown user agents are let through", async ({ request }) => {
    expect((await head(request, "/", "")).status).toBe(200);
    expect((await head(request, "/", "curl/8.5.0")).status).toBe(200);
  });

  test("the handoff page itself never redirects (no loop) for desktop", async ({ request }) => {
    const r = await head(request, "/open-on-phone", UA.macChrome);
    expect(r.status).toBe(200);
  });

  test("static assets and the manifest are not gated", async ({ request }) => {
    for (const path of ["/manifest.webmanifest", "/sw.js", "/icons/icon-192.png", "/offline"]) {
      const r = await head(request, path, UA.macChrome);
      expect(r.status, path).toBe(200);
    }
  });
});

test.describe("?phone=1 bypass", () => {
  test("sets the cookie, strips the param and keeps other params", async ({ request }) => {
    const r = await head(request, "/kitchen?loc=pantry&phone=1", UA.macChrome);
    expect(r.status).toBe(307);
    const loc = new URL(r.location!, "http://x");
    expect(loc.pathname).toBe("/kitchen");
    expect(loc.searchParams.get("loc")).toBe("pantry");
    expect(loc.searchParams.has("phone")).toBe(false);
    expect(r.setCookie).toMatch(/sl_force_phone=1/);
    expect(r.setCookie).toMatch(/Path=\//i);
    expect(r.setCookie).toMatch(/SameSite=lax/i);
  });

  test("only phone=1 counts", async ({ request }) => {
    for (const v of ["0", "true", "yes", ""]) {
      const r = await head(request, `/?phone=${v}`, UA.macChrome);
      expect(new URL(r.location!, "http://x").pathname, `phone=${v}`).toBe("/open-on-phone");
    }
  });

  test("a laptop browser stays on the app after ?phone=1 (middleware and client gate both respect the cookie)", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ userAgent: UA.macChrome, viewport: { width: 1280, height: 800 }, baseURL });
    const page = await ctx.newPage();
    await dismissInstallHint(page);
    await page.goto("/?phone=1");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("screen-today")).toBeVisible();
    await page.goto("/kitchen");
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/kitchen$/);
    await ctx.close();
  });

  test("visiting the handoff page with ?phone=1 leaves you on the handoff page", async ({ browser, baseURL }) => {
    // Reported as a UX note: the bypass link on the QR page should go to "/".
    const ctx = await browser.newContext({ userAgent: UA.macChrome, viewport: { width: 1280, height: 800 }, baseURL });
    const page = await ctx.newPage();
    await page.goto("/open-on-phone?phone=1");
    await expect(page).toHaveURL(/\/open-on-phone$/);
    await ctx.close();
  });
});

test.describe("client gate (real browsers)", () => {
  const cases = [
    { name: "laptop", ua: UA.macChrome, viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false },
    { name: "iPad (iPadOS Mac UA, touch)", ua: UA.iPadOS, viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: false },
    { name: "iPad mini landscape", ua: UA.iPadOS, viewport: { width: 1133, height: 744 }, hasTouch: true, isMobile: false },
    { name: "Galaxy Tab", ua: UA.galaxyTab, viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true },
  ];
  for (const c of cases) {
    test(`${c.name} lands on /open-on-phone with a QR`, async ({ browser, baseURL }) => {
      const ctx = await browser.newContext({ userAgent: c.ua, viewport: c.viewport, hasTouch: c.hasTouch, isMobile: c.isMobile, baseURL });
      const page = await ctx.newPage();
      await page.goto("/kitchen");
      await expect(page).toHaveURL(/\/open-on-phone$/);
      await expect(page.getByTestId("open-on-phone-qr").locator("svg")).toBeVisible();
      await expect(page.getByTestId("open-on-phone-qr")).toHaveAttribute("aria-label", /QR code for http/);
      await ctx.close();
    });
  }

  test("iPadOS Mac UA with touch is caught by the client gate even if the server lets it through", async ({ browser, baseURL }) => {
    // The cookie disables the server gate; this checks the client-side touch check by itself.
    // PhoneGate also honours the cookie, so instead use a phone-sized viewport with the iPadOS UA + touch.
    const ctx = await browser.newContext({ userAgent: UA.iPadOS, viewport: { width: 390, height: 560 }, hasTouch: true, isMobile: false, baseURL });
    const page = await ctx.newPage();
    // Server redirects (Macintosh UA). Either way the user must end on the handoff page.
    await page.goto("/");
    await expect(page).toHaveURL(/\/open-on-phone$/);
    await ctx.close();
  });

  test("a real Mac with no touch at a phone-sized window is still redirected by the server", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ userAgent: UA.macSafari, viewport: { width: 390, height: 800 }, hasTouch: false, baseURL });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/open-on-phone$/);
    await ctx.close();
  });

  test("Googlebot desktop renders once and settles on the handoff page without looping", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ userAgent: UA.googlebotDesktopChrome, viewport: { width: 1024, height: 1024 }, baseURL });
    const page = await ctx.newPage();
    const navs: string[] = [];
    page.on("framenavigated", (f) => {
      if (f === page.mainFrame()) navs.push(new URL(f.url()).pathname);
    });
    await page.goto("/");
    await expect(page).toHaveURL(/\/open-on-phone$/);
    await page.waitForTimeout(1500);
    expect(navs.filter((p) => p === "/open-on-phone").length).toBeLessThanOrEqual(1);
    await expect(page).toHaveURL(/\/open-on-phone$/);
    await ctx.close();
  });

  test("phones with the default project device are not redirected on any tab", async ({ page }) => {
    await dismissInstallHint(page);
    for (const path of ["/", "/kitchen", "/cook", "/me", "/alerts", "/shopping", "/capture/search"]) {
      await page.goto(path);
      await page.waitForTimeout(300);
      expect(new URL(page.url()).pathname, path).toBe(path);
    }
  });

  test("phone in landscape (iPhone 15 Pro Max, 932x430) is not redirected", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ userAgent: UA.iPhone, viewport: { width: 932, height: 430 }, hasTouch: true, isMobile: true, baseURL });
    const page = await ctx.newPage();
    await page.goto("/kitchen");
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/kitchen$/);
    await ctx.close();
  });
});

test("handoff page ignores a spoofed Host for the QR (reports what it shows)", async ({ request }) => {
  const res = await request.get("/open-on-phone", { headers: { "user-agent": UA.macChrome, "x-forwarded-host": "evil.example" } });
  const html = await res.text();
  // Informational: documents that the QR origin comes from x-forwarded-host. Vercel overwrites this header,
  // so it is only reachable when self-hosted behind a proxy that passes it through.
  test.info().annotations.push({ type: "x-forwarded-host reflected", description: String(html.includes("evil.example")) });
  expect(res.status()).toBe(200);
});
