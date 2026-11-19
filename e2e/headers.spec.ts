import { expect, test } from "@playwright/test";

// Security headers from next.config.ts are served by `next start` and Vercel alike.
test("pages carry the security headers", async ({ request }) => {
  const res = await request.get("/offline");
  expect(res.ok()).toBeTruthy();
  const h = res.headers();
  const csp = h["content-security-policy"] ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("connect-src 'self' https://*.supabase.co wss://*.supabase.co");
  expect(csp).toContain("img-src 'self' data: blob:");
  expect(csp).not.toContain("unsafe-eval");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["permissions-policy"]).toBe("camera=(self), microphone=(self), geolocation=()");
});

test("the app renders and hydrates under the CSP with no violations", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (msg) => {
    if (/Content Security Policy|Refused to (load|execute|apply|connect)/i.test(msg.text())) violations.push(msg.text());
  });
  await page.addInitScript(() => {
    localStorage.setItem("shelflife.a2hs.dismissed", "e2e");
    document.addEventListener("securitypolicyviolation", (e) =>
      console.error(`Content Security Policy violation: ${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  await page.goto("/");
  await expect(page.getByTestId("screen-today")).toBeVisible();
  // A client-side navigation proves the inline RSC payload and chunks executed.
  await page.getByTestId("tab-add").click();
  await expect(page.getByTestId("add-sheet")).toBeVisible();
  await page.goto("/kitchen");
  await expect(page.getByTestId("kitchen-list")).toBeVisible();
  expect(violations).toEqual([]);
});
