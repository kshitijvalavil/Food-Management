"use client";
// Typed client for the edge functions in docs/CONTRACTS.md. Every response is validated with the
// zod schemas in shared/schema.ts before the UI sees it (AI output is untrusted). Demo mode
// answers from local fixtures with the same shapes.
import { z } from "zod";
import {
  AnalyzePhotoRequest,
  AnalyzePhotoResponse,
  ApiError,
  LookupBarcodeRequest,
  LookupBarcodeResponse,
  ParseTextRequest,
  ParseTextResponse,
  SearchFoodRequest,
  SearchFoodResponse,
  type ExpirySource,
  type Location,
} from "@/shared/schema";
import { IS_DEMO } from "@/lib/env";
import { addDays, todayISO } from "@/lib/dates";
import { demoBarcode, demoExpiry, demoParseText, demoPhotoShelf, findDemoFood, searchDemoFoods } from "@/lib/demo/fixtures";
import { getMember } from "@/lib/household";
import { getSupabase } from "@/lib/supabase/client";

export type AnalyzePhotoResult = z.infer<typeof AnalyzePhotoResponse>;
export type LookupBarcodeResult = z.infer<typeof LookupBarcodeResponse>;
export type ParseTextResult = z.infer<typeof ParseTextResponse>;
export type SearchFoodResult = z.infer<typeof SearchFoodResponse>;
export type SearchHit = SearchFoodResult["results"][number];

export type ApiErrorCode = z.infer<typeof ApiError>["error"]["code"] | "invalid_response" | "network";

export class ApiFailure extends Error {
  constructor(public code: ApiErrorCode, message: string, public fromServer = false) {
    super(message);
    this.name = "ApiFailure";
  }
}

// Server error messages (400/401/404/429/502/500) are written to be shown to users, so they win.
// These are only for errors raised on this side, or a server error that came without a message.
const FRIENDLY: Partial<Record<ApiErrorCode, string>> = {
  rate_limited: "You've hit today's limit for AI scans. Try search or barcode instead.",
  upstream_failed: "The food service didn't answer. Try again in a moment.",
  unauthorized: "Please sign in again.",
  network: "You're offline. Try again when you have a connection.",
  invalid_response: "We got an answer we couldn't read, so nothing was added.",
};

export function friendlyError(e: unknown): string {
  if (e instanceof ApiFailure) {
    if (e.fromServer && e.message) return e.message;
    return FRIENDLY[e.code] ?? "Something went wrong. Try again.";
  }
  return "Something went wrong. Try again.";
}

/** analyze-photo limit (smaller than the bucket's 10 MiB). */
export const MAX_PHOTO_BYTES = 3.5 * 1024 * 1024;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function invoke<S extends z.ZodTypeAny>(name: string, body: unknown, schema: S): Promise<z.infer<S>> {
  const sb = getSupabase();
  const { data, error } = await sb.functions.invoke(name, { body: body as Record<string, unknown> });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const parsed = ApiError.safeParse(await ctx.json().catch(() => null));
      if (parsed.success) throw new ApiFailure(parsed.data.error.code, parsed.data.error.message, true);
    }
    throw new ApiFailure(navigator.onLine ? "internal" : "network", "");
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ApiFailure("invalid_response", parsed.error.message);
  return parsed.data;
}

/** Downscaled JPEG -> storage bucket `scans` at {household_id}/{uuid}.jpg -> analyze-photo. */
export async function analyzePhoto(photo: Blob, locationHint: Location | null): Promise<AnalyzePhotoResult> {
  if (IS_DEMO) {
    await wait(1200);
    const items = demoPhotoShelf().map((i) => ({ ...i, location: locationHint ?? i.location }));
    return AnalyzePhotoResponse.parse({ items, flagged: items.filter((i) => i.confidence < 0.7).length });
  }
  if (photo.size > MAX_PHOTO_BYTES) throw new ApiFailure("bad_request", "That photo is too large. Try again a little further back.", true);
  const { householdId } = await getMember();
  const path = `${householdId}/${crypto.randomUUID()}.jpg`;
  const { error } = await getSupabase().storage.from("scans").upload(path, photo, { contentType: "image/jpeg", upsert: false });
  if (error) throw new ApiFailure("upstream_failed", error.message);
  return invoke("analyze-photo", AnalyzePhotoRequest.parse({ storage_path: path, location_hint: locationHint }), AnalyzePhotoResponse);
}

export async function lookupBarcode(barcode: string): Promise<LookupBarcodeResult> {
  const req = LookupBarcodeRequest.parse({ barcode });
  if (IS_DEMO) {
    await wait(350);
    const hit = demoBarcode(req.barcode);
    return LookupBarcodeResponse.parse(
      hit
        ? { found: true, item: hit.item, product_name: hit.product_name, brand: hit.brand, pack_size: hit.pack_size }
        : { found: false, item: null, product_name: null, brand: null, pack_size: null },
    );
  }
  return invoke("lookup-barcode", req, LookupBarcodeResponse);
}

export async function parseText(text: string): Promise<ParseTextResult> {
  const req = ParseTextRequest.parse({ text: text.slice(0, 2000) });
  if (IS_DEMO) {
    await wait(300);
    return ParseTextResponse.parse({ items: demoParseText(req.text) });
  }
  return invoke("parse-text", req, ParseTextResponse);
}

export async function searchFood(q: string): Promise<SearchFoodResult> {
  const trimmed = q.trim().slice(0, 60);
  if (!trimmed) return { results: [] };
  const req = SearchFoodRequest.parse({ q: trimmed });
  if (IS_DEMO) {
    await wait(120);
    return SearchFoodResponse.parse({
      results: searchDemoFoods(req.q).map((f) => ({ shelf_life_id: f.shelf_life_id, name: f.name, category: f.category, default_location: f.default_location })),
    });
  }
  return invoke("search-food", req, SearchFoodResponse);
}

export interface ExpiryPreview {
  expires_on: string;
  expiry_source: ExpirySource;
  expiry_range_days: [number, number] | null;
}

const ShelfLifeRow = z.object({
  pantry_min_days: z.number().nullable(),
  pantry_max_days: z.number().nullable(),
  fridge_min_days: z.number().nullable(),
  fridge_max_days: z.number().nullable(),
  freezer_min_days: z.number().nullable(),
  freezer_max_days: z.number().nullable(),
});

/**
 * Expiry preview for a FoodKeeper item at a location (middle of the range), used when an item is
 * added from search or moved between fridge/freezer/pantry.
 * TODO(s1): swap the body for shared/expiry.ts once Byte Vader lands it.
 */
export async function previewExpiry(shelfLifeId: number | null, location: Location, today = todayISO()): Promise<ExpiryPreview | null> {
  if (shelfLifeId == null) return null;
  if (IS_DEMO) {
    const food = findDemoFood(shelfLifeId);
    const exp = food ? demoExpiry(food, location, today) : null;
    return exp ? { expires_on: exp.expires_on, expiry_source: "foodkeeper", expiry_range_days: exp.range } : null;
  }
  const { data, error } = await getSupabase()
    .from("shelf_life")
    .select("pantry_min_days,pantry_max_days,fridge_min_days,fridge_max_days,freezer_min_days,freezer_max_days")
    .eq("id", shelfLifeId)
    .maybeSingle();
  if (error || !data) return null;
  const row = ShelfLifeRow.safeParse(data);
  if (!row.success) return null;
  const min = row.data[`${location}_min_days`];
  const max = row.data[`${location}_max_days`];
  if (min == null || max == null) return null;
  return { expires_on: addDays(today, Math.round((min + max) / 2)), expiry_source: "foodkeeper", expiry_range_days: [min, max] };
}

/** Build a review row for a search hit (FoodKeeper date, or a dashed AI-style guess when none). */
export async function itemFromSearch(hit: SearchHit) {
  const preview = await previewExpiry(hit.shelf_life_id, hit.default_location);
  const food = IS_DEMO ? findDemoFood(hit.shelf_life_id) : undefined;
  return {
    name: hit.name,
    quantity: food?.quantity ?? 1,
    unit: food?.unit ?? ("count" as const),
    location: hit.default_location,
    printed_date: null,
    confidence: 1,
    category_hint: hit.category,
    barcode: null,
    shelf_life_id: hit.shelf_life_id,
    expires_on: preview?.expires_on ?? addDays(todayISO(), 7),
    expiry_source: preview?.expiry_source ?? ("ai_estimate" as const),
    expiry_range_days: preview?.expiry_range_days ?? null,
    kcal_per_unit: food?.kcal_per_unit ?? null,
    kcal_per_100g: food?.kcal_per_100g ?? null,
  };
}
