import { z } from "zod";
import { EnrichedItem, ExpirySource, Location, Unit } from "@/shared/schema";

export type UnitT = z.infer<typeof Unit>;
export type { EnrichedItem, Location, ExpirySource };

export const ItemStatus = z.enum(["active", "used", "binned"]);
export type ItemStatus = z.infer<typeof ItemStatus>;

/** One row of the `items` table (docs/CONTRACTS.md). */
export const KitchenItem = z.object({
  id: z.string(),
  household_id: z.string(),
  name: z.string(),
  quantity: z.coerce.number(),
  unit: Unit,
  location: Location,
  added_at: z.string(),
  expires_on: z.string(),
  expiry_source: ExpirySource,
  confidence: z.coerce.number(),
  shelf_life_id: z.number().int().nullable(),
  barcode: z.string().nullable(),
  kcal_per_unit: z.coerce.number().nullable(),
  status: ItemStatus,
  usual_quantity: z.coerce.number().nullable(),
  low_threshold: z.coerce.number().nullable(),
  created_by: z.string().nullable(),
});
export type KitchenItem = z.infer<typeof KitchenItem>;

export type CaptureOrigin = "photo" | "barcode" | "voice" | "search";

/** An item waiting on the Review screen. Nothing here is saved yet. */
export interface DraftItem extends EnrichedItem {
  key: string;
  origin: CaptureOrigin;
  /** The user tapped "Yes" on a check-me item, or edited it by hand. */
  confirmed: boolean;
}

export const CHECK_ME_BELOW = 0.7;

export function needsCheck(item: Pick<DraftItem, "confidence" | "confirmed">): boolean {
  return !item.confirmed && item.confidence < CHECK_ME_BELOW;
}

export const LOCATIONS: readonly Location[] = ["fridge", "freezer", "pantry"] as const;
export const LOCATION_LABEL: Record<Location, string> = { fridge: "Fridge", freezer: "Freezer", pantry: "Pantry" };
export const LOCATION_ICON: Record<Location, "i-fridge" | "i-snow" | "i-jar"> = { fridge: "i-fridge", freezer: "i-snow", pantry: "i-jar" };

export const SOURCE_STAMP: Record<ExpirySource, { label: string; cls: string; spoken: string }> = {
  printed: { label: "Printed", cls: "pr", spoken: "date printed on the pack" },
  foodkeeper: { label: "USDA", cls: "us", spoken: "date from the USDA FoodKeeper range" },
  // Manager decision (s1): the dashed stamp reads "Estimate"; only expiry_source='foodkeeper' reads "USDA".
  ai_estimate: { label: "Estimate", cls: "ai", spoken: "date is an estimate" },
};

/** "×2", "400 g", "1 bunch": the quantity part of an item's display name. */
export function quantityLabel(quantity: number, unit: UnitT): string {
  const q = Number.isInteger(quantity) ? String(quantity) : String(Math.round(quantity * 100) / 100);
  switch (unit) {
    case "count":
    case "pack":
      return quantity === 1 ? "" : `×${q}`;
    case "g":
    case "kg":
    case "ml":
    case "l":
      return `${q} ${unit}`;
    case "bunch":
      return `${q} ${quantity === 1 ? "bunch" : "bunches"}`;
    case "loaf":
      return `${q} ${quantity === 1 ? "loaf" : "loaves"}`;
    case "dozen":
      return `${q} dozen`;
  }
}

/** "10", "1 pack", "200 g": the amount on its own. */
export function amountLabel(quantity: number, unit: UnitT): string {
  if (unit === "count") return String(quantity);
  if (unit === "pack") return `${quantity} ${quantity === 1 ? "pack" : "packs"}`;
  return quantityLabel(quantity, unit);
}

export function displayName(name: string, quantity: number, unit: UnitT): string {
  const q = quantityLabel(quantity, unit);
  if (!q) return name;
  if (q.startsWith("×")) return `${name} ${q}`;
  if (unit === "bunch" || unit === "loaf" || unit === "dozen") return `${name}, ${q}`;
  return `${name} ${q}`;
}

/** Sensible +/- step for the quantity stepper. */
export function quantityStep(unit: UnitT, quantity: number): number {
  if (unit === "g" || unit === "ml") return quantity >= 500 ? 100 : 50;
  if (unit === "kg" || unit === "l") return 0.5;
  return 1;
}

export function isLow(item: Pick<KitchenItem, "quantity" | "low_threshold">): boolean {
  return item.low_threshold != null && item.quantity <= item.low_threshold;
}
