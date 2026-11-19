// Shared helpers for Sherlock Bugs' review specs (e2e/sherlock-*.spec.ts). Demo mode only.
import { expect, type Page } from "@playwright/test";

export const DRAFT_KEY = "shelflife.draft.v1";
export const XSS = `<img src=x onerror="window.__xss=1;alert(1)">`;

export const UA = {
  macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  winEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  linuxFirefox: "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0",
  chromebook: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  iPadLegacy: "Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1",
  // iPadOS 13+ Safari: identical to desktop Safari on a Mac.
  iPadOS: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  galaxyTab: "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  firefoxAndroidTablet: "Mozilla/5.0 (Android 14; Tablet; rv:132.0) Gecko/132.0 Firefox/132.0",
  iPhone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  iPhoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
  pixel: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  firefoxAndroid: "Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0",
  googlebotSmartphone: "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  googlebotDesktop: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  googlebotDesktopChrome: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/131.0.0.0 Safari/537.36",
  bingbot: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  lighthouseDesktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Chrome-Lighthouse",
  facebook: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
} as const;

export function isoDay(offset: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface DraftRow {
  key: string;
  origin: "photo" | "barcode" | "voice" | "search";
  confirmed: boolean;
  name: string;
  quantity: number;
  unit: string;
  location: "fridge" | "freezer" | "pantry";
  printed_date: string | null;
  confidence: number;
  category_hint: string | null;
  barcode: string | null;
  shelf_life_id: number | null;
  expires_on: string;
  expiry_source: "printed" | "foodkeeper" | "ai_estimate";
  expiry_range_days: [number, number] | null;
  kcal_per_unit: number | null;
  kcal_per_100g: number | null;
}

let n = 0;
export function row(patch: Partial<DraftRow> = {}): DraftRow {
  n += 1;
  return {
    key: `sherlock-${n}`,
    origin: "search",
    confirmed: false,
    name: `Test food ${n}`,
    quantity: 1,
    unit: "count",
    location: "fridge",
    printed_date: null,
    confidence: 0.95,
    category_hint: null,
    barcode: null,
    shelf_life_id: null,
    expires_on: isoDay(5),
    expiry_source: "ai_estimate",
    expiry_range_days: null,
    kcal_per_unit: null,
    kcal_per_100g: null,
    ...patch,
  };
}

/** Puts a Review draft into sessionStorage before the app boots (only once per tab, so reloads keep edits). */
export async function seedDraft(page: Page, items: DraftRow[], sourceLabel = "Sherlock test draft") {
  await page.addInitScript(
    ({ key, state }) => {
      if (sessionStorage.getItem("sherlock.seeded")) return;
      sessionStorage.setItem("sherlock.seeded", "1");
      sessionStorage.setItem(key, JSON.stringify(state));
    },
    { key: DRAFT_KEY, state: { items, sourceLabel } },
  );
}

export async function dismissInstallHint(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("shelflife.a2hs.dismissed", "sherlock");
    } catch {
      /* ignore */
    }
  });
}

/** Fails the test if any JS dialog opens or an injected <img onerror> runs. */
export function trapXss(page: Page) {
  const dialogs: string[] = [];
  page.on("dialog", async (d) => {
    dialogs.push(d.message());
    await d.dismiss();
  });
  return {
    async check() {
      const ran = await page.evaluate(() => (window as unknown as { __xss?: number }).__xss ?? 0);
      expect(dialogs, "no alert() dialogs").toEqual([]);
      expect(ran, "no injected handler ran").toBe(0);
      expect(await page.locator('img[src="x"]').count(), "no injected <img> element").toBe(0);
    },
  };
}

export async function expectNoHorizontalScroll(page: Page, label: string) {
  const m = await page.evaluate(() => {
    const de = document.documentElement;
    const offenders: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > de.clientWidth + 1 || r.left < -1)) {
        const cs = getComputedStyle(el);
        if (cs.position === "fixed" && cs.visibility === "hidden") continue;
        // Skip anything inside a horizontally scrollable container (chip rows etc.).
        let p = el.parentElement;
        let clipped = false;
        while (p && p !== document.body) {
          const ps = getComputedStyle(p);
          if (/(auto|scroll|hidden|clip)/.test(ps.overflowX)) {
            clipped = true;
            break;
          }
          p = p.parentElement;
        }
        if (!clipped) offenders.push(`${el.tagName.toLowerCase()}${el.dataset.testid ? `[${el.dataset.testid}]` : ""}.${String(el.className).slice(0, 40)} right=${Math.round(r.right)}`);
      }
    }
    return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, offenders: offenders.slice(0, 5) };
  });
  expect(m.scrollWidth, `${label}: horizontal scroll (${JSON.stringify(m.offenders)})`).toBeLessThanOrEqual(m.clientWidth);
}
