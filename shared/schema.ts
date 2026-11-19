// Shared contract between the app (Sir Pixelot), edge functions (Byte Vader) and the database (Tabledore).
// Change it only via a PR that all three owners see.
import { z } from "zod";

export const Location = z.enum(["fridge", "freezer", "pantry"]);
export type Location = z.infer<typeof Location>;

export const ExpirySource = z.enum(["printed", "foodkeeper", "ai_estimate"]);
export type ExpirySource = z.infer<typeof ExpirySource>;

export const Unit = z.enum(["count", "g", "kg", "ml", "l", "pack", "bunch", "loaf", "dozen"]);

/** One item as found by photo / voice / barcode / search, BEFORE the user confirms it. */
export const DetectedItem = z.object({
  name: z.string().min(1).max(80),          // "Toned milk"
  quantity: z.number().positive().max(1000), // 2
  unit: Unit,                                 // "pack"
  location: Location,                         // AI's best guess; user can change
  printed_date: z.string().date().nullable(), // ISO yyyy-mm-dd if read off the pack
  confidence: z.number().min(0).max(1),       // < 0.7 => "check me"
  category_hint: z.string().max(80).nullable(), // e.g. "eggs, in shell" to match FoodKeeper
  barcode: z.string().regex(/^\d{8,14}$/).nullable(),
});
export type DetectedItem = z.infer<typeof DetectedItem>;

/** After the expiry engine runs (server side). */
export const EnrichedItem = DetectedItem.extend({
  shelf_life_id: z.number().int().nullable(),
  expires_on: z.string().date(),
  expiry_source: ExpirySource,
  expiry_range_days: z.tuple([z.number().int(), z.number().int()]).nullable(), // FoodKeeper min/max
  kcal_per_unit: z.number().nonnegative().nullable(),
  kcal_per_100g: z.number().nonnegative().nullable(),
});
export type EnrichedItem = z.infer<typeof EnrichedItem>;

// ---- Edge function contracts (POST JSON, Authorization: Bearer <supabase user jwt>) ----
/** Optional on requests: the phone's local date. The server uses it only if it is within ±1 day of its own. */
export const ClientToday = z.string().date().optional();
/** Items the AI returned that failed validation and were left out (shown as "n items skipped"). */
export const DroppedCount = z.number().int().nonnegative().optional();

export const AnalyzePhotoRequest = z.object({ storage_path: z.string(), location_hint: Location.nullable(), today: ClientToday });
export const AnalyzePhotoResponse = z.object({ items: z.array(EnrichedItem), flagged: z.number().int(), dropped: DroppedCount });

export const LookupBarcodeRequest = z.object({ barcode: z.string().regex(/^\d{8,14}$/), today: ClientToday });
export const LookupBarcodeResponse = z.object({ found: z.boolean(), item: EnrichedItem.nullable(), product_name: z.string().nullable(), brand: z.string().nullable(), pack_size: z.string().nullable() });

export const ParseTextRequest = z.object({ text: z.string().min(1).max(2000), today: ClientToday }); // voice transcript or typed list
export const ParseTextResponse = z.object({ items: z.array(EnrichedItem), dropped: DroppedCount });

export const SearchFoodRequest = z.object({ q: z.string().min(1).max(60) });
export const SearchFoodResponse = z.object({ results: z.array(z.object({ shelf_life_id: z.number().int(), name: z.string(), category: z.string(), default_location: Location })) });

export const ApiError = z.object({ error: z.object({ code: z.enum(["bad_request", "unauthorized", "rate_limited", "upstream_failed", "not_found", "internal"]), message: z.string() }) });

/** Freshness scale used by every screen (see mockups legend). */
export function freshness(daysLeft: number): "fresh" | "soon" | "today" | "gone" {
  if (daysLeft < 0) return "gone";
  if (daysLeft <= 1) return "today";
  if (daysLeft <= 3) return "soon";
  return "fresh";
}
