import type { SupabaseClient } from "@supabase/supabase-js";
import type { DetectedItem, EnrichedItem, Location } from "../../../shared/schema.ts";
import { computeExpiry, type ShelfLifeDays } from "../../../shared/expiry.ts";

/** A row returned by the `search_food(q text)` RPC (a `shelf_life` row). */
export interface ShelfLifeRow extends ShelfLifeDays {
  id: number;
  name: string;
  category: string;
  default_location: Location;
  keywords?: string[] | null;
  tips?: string | null;
}

export async function searchFood(client: SupabaseClient, q: string): Promise<ShelfLifeRow[]> {
  const { data, error } = await client.rpc("search_food", { q });
  if (error) throw new Error(`search_food failed: ${error.message}`);
  return Array.isArray(data) ? (data as ShelfLifeRow[]) : [];
}

/** Best shelf_life match: category_hint first (generic), then the item name. Never throws. */
export async function matchShelfLife(
  client: SupabaseClient,
  item: Pick<DetectedItem, "name" | "category_hint">,
  cache: Map<string, Promise<ShelfLifeRow | null>> = new Map(),
): Promise<ShelfLifeRow | null> {
  const queries = [item.category_hint, item.name]
    .map((q) => (q ?? "").trim().slice(0, 60))
    .filter((q, i, all) => q.length > 0 && all.indexOf(q) === i);
  for (const q of queries) {
    const key = q.toLowerCase();
    let pending = cache.get(key);
    if (!pending) {
      pending = searchFood(client, q).then(
        (rows) => rows[0] ?? null,
        (err) => {
          console.warn(`[enrich] ${err instanceof Error ? err.message : String(err)}`);
          return null;
        },
      );
      cache.set(key, pending);
    }
    const row = await pending;
    if (row) return row;
  }
  return null;
}

export interface EnrichExtras {
  estimated_days_left?: number | null;
  kcal_per_100g?: number | null;
  kcal_per_unit?: number | null;
}

/** Adds shelf_life match and expiry (printed -> FoodKeeper -> AI estimate -> fallback). */
export async function enrichItems(
  client: SupabaseClient,
  items: Array<DetectedItem & EnrichExtras>,
  addedOn: string,
): Promise<EnrichedItem[]> {
  const cache = new Map<string, Promise<ShelfLifeRow | null>>();
  return await Promise.all(
    items.map(async (it) => {
      const row = await matchShelfLife(client, it, cache);
      const expiry = computeExpiry(it, row, addedOn, it.estimated_days_left ?? null);
      return {
        name: it.name,
        quantity: it.quantity,
        unit: it.unit,
        location: it.location,
        printed_date: it.printed_date,
        confidence: it.confidence,
        category_hint: it.category_hint,
        barcode: it.barcode,
        shelf_life_id: row?.id ?? null,
        ...expiry,
        kcal_per_unit: it.kcal_per_unit ?? null,
        kcal_per_100g: it.kcal_per_100g ?? null,
      };
    }),
  );
}
