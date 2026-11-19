import { expect, test, type Page } from "@playwright/test";
import { dismissInstallHint, expectNoHorizontalScroll, row, seedDraft } from "./sherlock-helpers";

// Narrow (320) and large (430) phones, safe-area padding, dark-mode readability.

const ROUTES = ["/", "/kitchen", "/kitchen?loc=freezer", "/kitchen?loc=pantry", "/cook", "/me", "/me/notifications", "/alerts", "/shopping", "/capture/search", "/capture/voice", "/capture/camera?mode=photo", "/capture/camera?mode=barcode", "/capture/review", "/offline", "/login"];

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
}

for (const size of [
  { width: 320, height: 568 },
  { width: 430, height: 932 },
]) {
  test.describe(`${size.width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await dismissInstallHint(page);
      await page.setViewportSize(size);
    });

    test(`no horizontal scroll on any screen at ${size.width}px`, async ({ page }) => {
      await seedDraft(page, [row({ name: "Coriander", confidence: 0.6 }), row({ name: "Milk" }), row({ name: "Basmati rice", quantity: 5, unit: "kg", location: "pantry" })]);
      const failures: string[] = [];
      for (const r of ROUTES) {
        await page.goto(r);
        await settle(page);
        try {
          await expectNoHorizontalScroll(page, r);
        } catch (e) {
          failures.push(String((e as Error).message).split("\n")[0]!);
        }
      }
      // Item detail and the Add sheet.
      await page.goto("/kitchen");
      await page.getByTestId("item-row").first().click();
      await expect(page.getByTestId("item-name")).toBeVisible();
      try {
        await expectNoHorizontalScroll(page, "item detail");
      } catch (e) {
        failures.push(String((e as Error).message).split("\n")[0]!);
      }
      await page.goto("/");
      await page.getByTestId("tab-add").click();
      await expect(page.getByTestId("add-sheet")).toBeVisible();
      try {
        await expectNoHorizontalScroll(page, "add sheet");
      } catch (e) {
        failures.push(String((e as Error).message).split("\n")[0]!);
      }
      expect(failures).toEqual([]);
    });

    test(`tab bar and primary buttons are at least 44px tall at ${size.width}px`, async ({ page }) => {
      await page.goto("/");
      await expect(page.getByTestId("screen-today")).toBeVisible();
      const small = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>(".tabbar a, .tabbar button, .btn"))
          .filter((el) => el.offsetParent !== null)
          .map((el) => ({ t: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30), h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width) }))
          .filter((x) => x.h < 44 || x.w < 44),
      );
      expect(small).toEqual([]);
    });
  });
}

test.describe("safe-area insets", () => {
  test("viewport-fit=cover is set and the shell pads with env(safe-area-inset-*)", async ({ page }) => {
    await dismissInstallHint(page);
    await page.goto("/");
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
    const tokens = await page.evaluate(() => {
      const out: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) out.push(rule.cssText);
        } catch {
          /* cross-origin */
        }
      }
      return out.join("\n");
    });
    for (const side of ["top", "bottom", "left", "right"]) expect(tokens).toContain(`safe-area-inset-${side}`);
    const main = page.getByTestId("screen-today");
    const style = (await main.getAttribute("style")) ?? "";
    expect(style).toContain("--safe-top");
    expect(style).toContain("--safe-bottom");
    expect(style).toContain("--safe-left");
    expect(style).toContain("--safe-right");
  });

  test("tab bar pads with the bottom inset", async ({ page }) => {
    await page.goto("/");
    const css = await page.evaluate(() => {
      let all = "";
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) all += rule.cssText + "\n";
        } catch {
          /* ignore */
        }
      }
      const i = all.indexOf(".tabbar {");
      return i >= 0 ? all.slice(i, all.indexOf("}", i)) : "";
    });
    expect(css).toContain("--safe-bottom");
  });

  test("FINDING: full-bleed camera and voice screens ignore left/right insets (landscape notch)", async ({ page }) => {
    // Informational: records whether --safe-left / --safe-right are used on these screens.
    for (const r of ["/capture/camera?mode=photo", "/capture/voice"]) {
      await page.goto(r);
      const style = (await page.locator("main").first().getAttribute("style")) ?? "";
      test.info().annotations.push({ type: `${r} uses side insets`, description: String(/--safe-(left|right)/.test(style)) });
      expect(style).toContain("--safe-top");
    }
  });
});

// WCAG contrast of every visible text node against its effective background.
async function lowContrast(page: Page) {
  return page.evaluate(() => {
    function parse(c: string): [number, number, number, number] | null {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
      return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
    }
    function lum([r, g, b]: number[]) {
      const f = (v: number) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
    }
    function bg(el: Element | null): [number, number, number] | null {
      while (el) {
        const cs = getComputedStyle(el);
        if (cs.backgroundImage && cs.backgroundImage !== "none") return null; // can't judge gradients/images
        const c = parse(cs.backgroundColor);
        if (c && c[3] > 0.9) return [c[0], c[1], c[2]];
        el = el.parentElement;
      }
      const b = parse(getComputedStyle(document.body).backgroundColor);
      return b ? [b[0], b[1], b[2]] : [255, 255, 255];
    }
    const bad: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const t = walker.currentNode as Text;
      const txt = t.data.trim();
      const el = t.parentElement;
      if (!txt || !el) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || Number(cs.opacity) === 0 || el.closest("[aria-hidden=true], .sr-only, svg")) continue;
      const fg = parse(cs.color);
      const b = bg(el);
      if (!fg || !b) continue;
      const L1 = lum(fg);
      const L2 = lum(b);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const size = parseFloat(cs.fontSize);
      const bold = Number(cs.fontWeight) >= 700;
      const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      if (ratio < need) bad.push(`"${txt.slice(0, 30)}" ${ratio.toFixed(2)}:1 (need ${need}) ${cs.color} on rgb(${b.join(",")})`);
    }
    return Array.from(new Set(bad));
  });
}

for (const scheme of ["light", "dark"] as const) {
  test(`text contrast in ${scheme} mode on the main screens`, async ({ page }) => {
    await dismissInstallHint(page);
    await page.emulateMedia({ colorScheme: scheme });
    await seedDraft(page, [row({ name: "Coriander", confidence: 0.6 }), row({ name: "Milk", expiry_source: "printed" }), row({ name: "Rice", expiry_source: "foodkeeper" })]);
    const report: Record<string, string[]> = {};
    for (const r of ["/", "/kitchen", "/capture/review", "/capture/search", "/me", "/alerts", "/shopping", "/cook", "/offline", "/login"]) {
      await page.goto(r);
      await settle(page);
      const bad = await lowContrast(page);
      if (bad.length) report[r] = bad.slice(0, 6);
    }
    if (scheme === "dark") {
      // The page background really switches.
      const bgc = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(bgc).not.toBe("rgb(255, 255, 255)");
    }
    test.info().annotations.push({ type: `contrast-${scheme}`, description: JSON.stringify(report) });
    expect(report).toEqual({});
  });
}
