// POST /lookup-barcode  { barcode }  ->  LookupBarcodeResponse
// `products` cache first, then Open Food Facts; the result is cached for OFF_CACHE_DAYS.
import type { SupabaseClient } from "@supabase/supabase-js";
import { LookupBarcodeRequest, LookupBarcodeResponse } from "../../../shared/schema.ts";
import type { Location } from "../../../shared/schema.ts";
import { adminClient, requireUser } from "../_shared/auth.ts";
import { defaultDeps, type Deps, todayUtc } from "../_shared/deps.ts";
import { enrichItems } from "../_shared/enrich.ts";
import { HttpError } from "../_shared/errors.ts";
import { jsonHandler } from "../_shared/handler.ts";

export const OFF_FIELDS = "product_name,brands,quantity,nutriments,categories_tags";
export const OFF_USER_AGENT = "ShelfLife/0.1 (personal project)";
const OFF_TIMEOUT_MS = 8_000;
const DEFAULT_CACHE_DAYS = 30;

export function offUrl(barcode: string): string {
  return `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${OFF_FIELDS}`;
}

export interface OffProduct {
  product_name?: string;
  brands?: string;
  quantity?: string;
  nutriments?: Record<string, unknown>;
  categories_tags?: string[];
}

/** Row shape of the `products` cache table. */
export interface ProductRow {
  barcode: string;
  name: string;
  brand: string | null;
  pack_size: string | null;
  kcal_per_100g: number | null;
  raw: OffProduct;
  fetched_at: string;
}

const FRIDGE_TAGS = new Set([
  "en:dairies", "en:milks", "en:cheeses", "en:yogurts", "en:butters", "en:creams", "en:fresh-creams",
  "en:paneer", "en:curds", "en:fermented-milk-products", "en:eggs", "en:chicken-eggs",
  "en:meats", "en:fresh-meats", "en:poultries", "en:chickens", "en:sausages", "en:hams",
  "en:fishes", "en:seafood", "en:fresh-foods", "en:fresh-vegetables", "en:fresh-fruits",
  "en:salads", "en:refrigerated-foods", "en:chilled-foods", "en:tofu", "en:fresh-pasta",
]);

/** frozen -> freezer; dairy / meat / fish / fresh -> fridge; everything else -> pantry. */
export function locationFromCategories(tags: string[] | undefined | null): Location {
  const list = (tags ?? []).map((t) => String(t).toLowerCase());
  if (list.some((t) => t.startsWith("en:frozen") || t === "en:ice-creams" || t === "en:ice-creams-and-sorbets")) {
    return "freezer";
  }
  if (list.some((t) => FRIDGE_TAGS.has(t))) return "fridge";
  return "pantry";
}

/** Most specific English category as plain words, e.g. "en:salted-butters" -> "salted butters". */
export function categoryHintFromTags(tags: string[] | undefined | null): string | null {
  const en = (tags ?? []).filter((t) => typeof t === "string" && t.startsWith("en:"));
  const last = en[en.length - 1];
  return last ? last.slice(3).replace(/-/g, " ").slice(0, 80) : null;
}

/** Grams (or ml) in a pack size like "100 g", "1 kg", "500ml", "1.5 L". */
export function packAmount(packSize: string | null | undefined): number | null {
  if (!packSize) return null;
  const m = /([\d]+(?:[.,]\d+)?)\s*(kg|g|gr|ml|cl|l)\b/i.exec(packSize);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const factor: Record<string, number> = { kg: 1000, g: 1, gr: 1, l: 1000, cl: 10, ml: 1 };
  return n * factor[m[2].toLowerCase()];
}

export function kcalPer100g(nutriments: Record<string, unknown> | undefined): number | null {
  const v = nutriments?.["energy-kcal_100g"];
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
}

function clean(s: string | undefined | null, max: number): string | null {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > 0 ? t.slice(0, max) : null;
}

export function productRowFromOff(barcode: string, p: OffProduct, now: Date): ProductRow {
  const brand = clean(p.brands?.split(",")[0], 80);
  return {
    barcode,
    name: clean(p.product_name, 80) ?? brand ?? "Unknown product",
    brand,
    pack_size: clean(p.quantity, 40),
    kcal_per_100g: kcalPer100g(p.nutriments),
    raw: p,
    fetched_at: now.toISOString(),
  };
}

type OffResult = { kind: "found"; product: OffProduct } | { kind: "not_found" };

export async function fetchOff(deps: Deps, barcode: string): Promise<OffResult> {
  let res: Response;
  try {
    res = await deps.fetch(offUrl(barcode), {
      headers: { "User-Agent": OFF_USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(OFF_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(`OFF network: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (res.status === 404) {
    await res.body?.cancel();
    return { kind: "not_found" };
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`OFF HTTP ${res.status}`);
  }
  const body = await res.json() as { status?: number; product?: OffProduct };
  if (body.status !== 1 || !body.product) return { kind: "not_found" };
  return { kind: "found", product: body.product };
}

async function readCache(admin: SupabaseClient, barcode: string): Promise<ProductRow | null> {
  const { data, error } = await admin.from("products").select("*").eq("barcode", barcode).maybeSingle();
  if (error) {
    console.warn(`[lookup-barcode] cache read failed: ${error.message}`);
    return null;
  }
  return (data as ProductRow | null) ?? null;
}

function cacheDays(deps: Deps): number {
  const n = Number(deps.env("OFF_CACHE_DAYS"));
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CACHE_DAYS;
}

export function createHandler(deps: Deps) {
  return jsonHandler("lookup-barcode", LookupBarcodeRequest, LookupBarcodeResponse, deps, async ({ req, body }) => {
    const { userClient } = await requireUser(req, deps);
    const admin = adminClient(deps);
    const barcode = body.barcode;
    const now = deps.now();

    const cached = await readCache(admin, barcode);
    const fresh = cached &&
      now.getTime() - new Date(cached.fetched_at).getTime() < cacheDays(deps) * 86_400_000;

    let row: ProductRow | null = fresh ? cached : null;
    if (!row) {
      let off: OffResult | null = null;
      try {
        off = await fetchOff(deps, barcode);
      } catch (err) {
        console.warn(`[lookup-barcode] ${err instanceof Error ? err.message : String(err)}`);
        if (!cached) throw new HttpError("upstream_failed", "Open Food Facts is not answering. Try again.");
        row = cached; // OFF is down: serve the stale cache entry
      }
      if (off?.kind === "not_found") {
        return { found: false, item: null, product_name: null, brand: null, pack_size: null };
      }
      if (off?.kind === "found") {
        row = productRowFromOff(barcode, off.product, now);
        const { error } = await admin.from("products").upsert(row, { onConflict: "barcode" });
        if (error) console.warn(`[lookup-barcode] cache write failed: ${error.message}`);
      }
      if (!row) throw new HttpError("internal", "Lookup failed.");
    }

    const tags = row.raw?.categories_tags;
    const grams = packAmount(row.pack_size);
    const kcal100 = row.kcal_per_100g ?? kcalPer100g(row.raw?.nutriments);
    const [item] = await enrichItems(userClient, [{
      name: row.name,
      quantity: 1,
      unit: "pack",
      location: locationFromCategories(tags),
      printed_date: null,
      confidence: 1,
      category_hint: categoryHintFromTags(tags),
      barcode,
      kcal_per_100g: kcal100,
      kcal_per_unit: kcal100 !== null && grams !== null ? Math.round((kcal100 * grams) / 100) : null,
    }], todayUtc(deps));

    return { found: true, item, product_name: row.name, brand: row.brand, pack_size: row.pack_size };
  });
}

if (import.meta.main) Deno.serve(createHandler(defaultDeps()));
