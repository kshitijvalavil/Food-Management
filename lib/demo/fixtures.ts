// Demo-mode fixtures: realistic data from the mockups so the whole capture -> review -> kitchen
// flow works on a phone before the backend is live. Dates are relative to "today".
import type { EnrichedItem, Location } from "@/shared/schema";
import { addDays, todayISO } from "@/lib/dates";
import type { KitchenItem, UnitT } from "@/lib/types";

export interface DemoFood {
  shelf_life_id: number;
  name: string;
  category: string;
  default_location: Location;
  keywords: string[];
  /** FoodKeeper-style [min, max] days per location; missing = not recommended there. */
  days: Partial<Record<Location, [number, number]>>;
  kcal_per_100g?: number;
  kcal_per_unit?: number;
  unit: UnitT;
  quantity: number;
}

/** 30 foods for Search-to-add and the demo expiry preview. */
export const DEMO_FOODS: DemoFood[] = [
  { shelf_life_id: 101, name: "Palak", category: "Produce, leafy greens", default_location: "fridge", keywords: ["spinach", "saag"], days: { fridge: [3, 7], freezer: [240, 360] }, kcal_per_100g: 23, unit: "bunch", quantity: 1 },
  { shelf_life_id: 102, name: "Coriander", category: "Produce, fresh herbs", default_location: "fridge", keywords: ["cilantro", "dhania"], days: { fridge: [5, 10] }, kcal_per_100g: 23, unit: "bunch", quantity: 1 },
  { shelf_life_id: 103, name: "Methi", category: "Produce, leafy greens", default_location: "fridge", keywords: ["fenugreek"], days: { fridge: [3, 5] }, kcal_per_100g: 49, unit: "bunch", quantity: 1 },
  { shelf_life_id: 104, name: "Tomatoes", category: "Produce", default_location: "fridge", keywords: ["tomato", "tamatar"], days: { fridge: [5, 10], pantry: [3, 5] }, kcal_per_unit: 22, unit: "count", quantity: 3 },
  { shelf_life_id: 105, name: "Onions", category: "Produce", default_location: "pantry", keywords: ["onion", "pyaaz"], days: { pantry: [30, 60], fridge: [14, 21] }, kcal_per_unit: 44, unit: "kg", quantity: 1 },
  { shelf_life_id: 106, name: "Potatoes", category: "Produce", default_location: "pantry", keywords: ["potato", "aloo"], days: { pantry: [21, 35] }, kcal_per_100g: 77, unit: "kg", quantity: 1 },
  { shelf_life_id: 107, name: "Lemons", category: "Produce, citrus", default_location: "fridge", keywords: ["lemon", "nimbu", "lime"], days: { fridge: [21, 28], pantry: [7, 14] }, kcal_per_unit: 17, unit: "count", quantity: 4 },
  { shelf_life_id: 108, name: "Bananas", category: "Produce, fruit", default_location: "pantry", keywords: ["banana", "kela"], days: { pantry: [2, 5] }, kcal_per_unit: 105, unit: "count", quantity: 6 },
  { shelf_life_id: 109, name: "Apples", category: "Produce, fruit", default_location: "fridge", keywords: ["apple", "seb"], days: { fridge: [28, 42], pantry: [7, 14] }, kcal_per_unit: 95, unit: "count", quantity: 4 },
  { shelf_life_id: 110, name: "Paneer", category: "Dairy, fresh cheese", default_location: "fridge", keywords: ["cottage cheese"], days: { fridge: [3, 7], freezer: [90, 180] }, kcal_per_100g: 265, unit: "g", quantity: 200 },
  { shelf_life_id: 111, name: "Curd", category: "Dairy, yogurt", default_location: "fridge", keywords: ["dahi", "yogurt", "yoghurt"], days: { fridge: [7, 14] }, kcal_per_100g: 60, unit: "g", quantity: 400 },
  { shelf_life_id: 112, name: "Toned milk", category: "Dairy, milk", default_location: "fridge", keywords: ["milk", "doodh"], days: { fridge: [5, 7], freezer: [90, 90] }, kcal_per_unit: 290, unit: "pack", quantity: 2 },
  { shelf_life_id: 113, name: "Butter", category: "Dairy, butter", default_location: "fridge", keywords: ["amul butter", "makhan"], days: { fridge: [30, 90], freezer: [180, 270] }, kcal_per_100g: 722, unit: "g", quantity: 100 },
  { shelf_life_id: 114, name: "Ghee", category: "Dairy, clarified butter", default_location: "pantry", keywords: ["clarified butter"], days: { pantry: [90, 180], fridge: [180, 365] }, kcal_per_100g: 900, unit: "ml", quantity: 500 },
  { shelf_life_id: 115, name: "Cheese slices", category: "Dairy, processed cheese", default_location: "fridge", keywords: ["cheese"], days: { fridge: [21, 28] }, kcal_per_unit: 60, unit: "pack", quantity: 1 },
  { shelf_life_id: 116, name: "Eggs", category: "Eggs, in shell", default_location: "fridge", keywords: ["egg", "anda"], days: { fridge: [21, 35] }, kcal_per_unit: 72, unit: "count", quantity: 12 },
  { shelf_life_id: 117, name: "Chicken", category: "Meat, raw poultry", default_location: "fridge", keywords: ["chicken breast", "murgh"], days: { fridge: [1, 2], freezer: [270, 365] }, kcal_per_100g: 165, unit: "kg", quantity: 1 },
  { shelf_life_id: 118, name: "Bread", category: "Bakery", default_location: "pantry", keywords: ["loaf", "white bread", "brown bread"], days: { pantry: [3, 5], fridge: [7, 14], freezer: [90, 150] }, kcal_per_unit: 70, unit: "loaf", quantity: 1 },
  { shelf_life_id: 119, name: "Pav", category: "Bakery", default_location: "pantry", keywords: ["bun", "ladi pav"], days: { pantry: [2, 4], freezer: [60, 90] }, kcal_per_unit: 120, unit: "pack", quantity: 1 },
  { shelf_life_id: 120, name: "Basmati rice", category: "Grains, rice", default_location: "pantry", keywords: ["basmati", "rice", "chawal"], days: { pantry: [365, 730] }, kcal_per_100g: 350, unit: "kg", quantity: 5 },
  { shelf_life_id: 121, name: "Atta", category: "Grains, wheat flour", default_location: "pantry", keywords: ["wheat flour", "flour", "aata"], days: { pantry: [90, 180] }, kcal_per_100g: 340, unit: "kg", quantity: 5 },
  { shelf_life_id: 122, name: "Toor dal", category: "Pulses", default_location: "pantry", keywords: ["dal", "arhar", "lentils"], days: { pantry: [365, 730] }, kcal_per_100g: 343, unit: "kg", quantity: 1 },
  { shelf_life_id: 123, name: "Besan", category: "Pulses, gram flour", default_location: "pantry", keywords: ["gram flour", "chickpea flour"], days: { pantry: [180, 365] }, kcal_per_100g: 387, unit: "kg", quantity: 1 },
  { shelf_life_id: 124, name: "Sugar", category: "Pantry staples", default_location: "pantry", keywords: ["cheeni", "shakkar"], days: { pantry: [730, 1095] }, kcal_per_100g: 387, unit: "kg", quantity: 1 },
  { shelf_life_id: 125, name: "Salt", category: "Pantry staples", default_location: "pantry", keywords: ["namak"], days: { pantry: [1825, 1825] }, unit: "kg", quantity: 1 },
  { shelf_life_id: 126, name: "Parle-G", category: "Biscuits", default_location: "pantry", keywords: ["biscuits", "parle g", "glucose biscuits"], days: { pantry: [90, 180] }, kcal_per_100g: 450, unit: "pack", quantity: 2 },
  { shelf_life_id: 127, name: "Cashew nuts", category: "Nuts", default_location: "pantry", keywords: ["cashew", "kaju", "nuts"], days: { pantry: [90, 180], fridge: [180, 365] }, kcal_per_100g: 553, unit: "g", quantity: 250 },
  { shelf_life_id: 128, name: "Green peas", category: "Frozen vegetables", default_location: "freezer", keywords: ["peas", "matar", "frozen peas"], days: { freezer: [240, 365] }, kcal_per_100g: 81, unit: "g", quantity: 500 },
  { shelf_life_id: 129, name: "Ginger", category: "Produce, roots", default_location: "fridge", keywords: ["adrak"], days: { fridge: [21, 28], pantry: [7, 14] }, kcal_per_100g: 80, unit: "g", quantity: 100 },
  { shelf_life_id: 130, name: "Green chillies", category: "Produce", default_location: "fridge", keywords: ["chilli", "chili", "mirchi"], days: { fridge: [7, 14] }, kcal_per_100g: 40, unit: "g", quantity: 100 },
];

export function findDemoFood(idOrName: number | string): DemoFood | undefined {
  if (typeof idOrName === "number") return DEMO_FOODS.find((f) => f.shelf_life_id === idOrName);
  const q = idOrName.toLowerCase();
  return DEMO_FOODS.find((f) => f.name.toLowerCase() === q || f.keywords.includes(q));
}

export function searchDemoFoods(q: string, limit = 10): DemoFood[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const scored = DEMO_FOODS.map((f) => {
    const name = f.name.toLowerCase();
    let score = 0;
    if (name.startsWith(needle)) score = 3;
    else if (name.includes(needle)) score = 2;
    else if (f.keywords.some((k) => k.includes(needle))) score = 1;
    return { f, score };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score || a.f.name.localeCompare(b.f.name));
  return scored.slice(0, limit).map((x) => x.f);
}

/** Middle of the FoodKeeper range for that location (what the real expiry engine does). */
export function demoExpiry(food: DemoFood, location: Location, today = todayISO()) {
  const range = food.days[location];
  if (!range) return null;
  return { expires_on: addDays(today, Math.round((range[0] + range[1]) / 2)), range };
}

function enriched(partial: Partial<EnrichedItem> & Pick<EnrichedItem, "name" | "quantity" | "unit" | "location" | "expires_on" | "expiry_source" | "confidence">): EnrichedItem {
  return {
    printed_date: null,
    category_hint: null,
    barcode: null,
    shelf_life_id: null,
    expiry_range_days: null,
    kcal_per_unit: null,
    kcal_per_100g: null,
    ...partial,
  };
}

/** The 7-item fridge shelf from mockup 1.2 / 1.5 (analyze-photo result). */
export function demoPhotoShelf(today = todayISO()): EnrichedItem[] {
  return [
    enriched({ name: "Toned milk", quantity: 2, unit: "pack", location: "fridge", printed_date: addDays(today, 5), expires_on: addDays(today, 5), expiry_source: "printed", confidence: 0.97, shelf_life_id: 112, category_hint: "milk, pasteurised", kcal_per_unit: 290 }),
    enriched({ name: "Curd", quantity: 400, unit: "g", location: "fridge", printed_date: addDays(today, 6), expires_on: addDays(today, 6), expiry_source: "printed", confidence: 0.92, shelf_life_id: 111, category_hint: "yogurt", kcal_per_100g: 60 }),
    enriched({ name: "Amul butter", quantity: 100, unit: "g", location: "fridge", printed_date: addDays(today, 58), expires_on: addDays(today, 58), expiry_source: "printed", confidence: 0.95, shelf_life_id: 113, category_hint: "butter", kcal_per_100g: 722, barcode: "8901262010023" }),
    enriched({ name: "Palak", quantity: 1, unit: "bunch", location: "fridge", expires_on: addDays(today, 4), expiry_source: "foodkeeper", confidence: 0.88, shelf_life_id: 101, category_hint: "spinach", expiry_range_days: [3, 7], kcal_per_100g: 23 }),
    enriched({ name: "Tomatoes", quantity: 3, unit: "count", location: "fridge", expires_on: addDays(today, 8), expiry_source: "ai_estimate", confidence: 0.94, category_hint: "tomatoes, ripe", kcal_per_unit: 22 }),
    enriched({ name: "Paneer", quantity: 200, unit: "g", location: "fridge", expires_on: addDays(today, 5), expiry_source: "foodkeeper", confidence: 0.9, shelf_life_id: 110, category_hint: "fresh cheese", expiry_range_days: [3, 7], kcal_per_100g: 265 }),
    enriched({ name: "Coriander", quantity: 1, unit: "bunch", location: "fridge", expires_on: addDays(today, 7), expiry_source: "foodkeeper", confidence: 0.61, shelf_life_id: 102, category_hint: "coriander or methi", expiry_range_days: [5, 10], kcal_per_100g: 23 }),
  ];
}

export interface DemoBarcode {
  product_name: string;
  brand: string;
  pack_size: string;
  item: EnrichedItem;
}

export function demoBarcode(code: string, today = todayISO()): DemoBarcode | null {
  if (code === "8901262010023") {
    return {
      product_name: "Amul Butter, pasteurised",
      brand: "Amul",
      pack_size: "100 g",
      item: enriched({ name: "Amul butter", quantity: 100, unit: "g", location: "fridge", printed_date: addDays(today, 58), expires_on: addDays(today, 58), expiry_source: "printed", confidence: 0.99, shelf_life_id: 113, category_hint: "butter", barcode: code, kcal_per_100g: 722 }),
    };
  }
  return null;
}

const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, dozen: 12, half: 0.5 };

/** Tiny local stand-in for the parse-text function (voice notes in demo mode). */
export function demoParseText(text: string, today = todayISO()): EnrichedItem[] {
  const out: EnrichedItem[] = [];
  const lower = text.toLowerCase();
  const chunks = lower.split(/,|\band\b|\.|;/).map((c) => c.trim()).filter(Boolean);
  for (const chunk of chunks) {
    const food = DEMO_FOODS.find((f) => [f.name.toLowerCase(), ...f.keywords].some((k) => new RegExp(`\\b${k.replace(/[-]/g, "[- ]?")}s?\\b`).test(chunk)));
    if (!food || out.some((o) => o.shelf_life_id === food.shelf_life_id)) continue;
    let quantity = food.quantity;
    let unit: UnitT = food.unit;
    const num = chunk.match(/(\d+(?:\.\d+)?)/);
    const word = chunk.split(/\s+/).find((w) => w in NUMBER_WORDS);
    if (/a dozen|one dozen/.test(chunk)) { quantity = 12; unit = "count"; }
    else if (num) quantity = Number(num[1]);
    else if (word) quantity = NUMBER_WORDS[word] ?? quantity;
    if (/kilo|kg/.test(chunk)) { unit = "kg"; if (/half/.test(chunk)) { quantity = 500; unit = "g"; } }
    else if (/gram|\bg\b/.test(chunk)) unit = "g";
    else if (/litre|liter/.test(chunk)) unit = "l";
    else if (/pack|packet/.test(chunk)) unit = "pack";
    let location = food.default_location;
    const mentions = (loc: string) => new RegExp(`${food.name.toLowerCase()}[^.]*\\b${loc}\\b|${loc}[^.]*${food.name.toLowerCase()}`).test(lower) && /put|keep|in the/.test(lower);
    for (const loc of ["freezer", "fridge", "pantry"] as Location[]) if (food.days[loc] && mentions(loc)) location = loc;
    const exp = demoExpiry(food, location, today) ?? demoExpiry(food, food.default_location, today);
    out.push(enriched({
      name: food.name,
      quantity: quantity > 0 ? quantity : 1,
      unit,
      location,
      expires_on: exp?.expires_on ?? addDays(today, 7),
      expiry_source: exp ? "foodkeeper" : "ai_estimate",
      expiry_range_days: exp?.range ?? null,
      confidence: 0.9,
      shelf_life_id: food.shelf_life_id,
      category_hint: food.category,
      kcal_per_100g: food.kcal_per_100g ?? null,
      kcal_per_unit: food.kcal_per_unit ?? null,
    }));
  }
  return out;
}

/** A lived-in kitchen for the first demo run (mockup 2.2), so Today and Kitchen are not empty. */
export function demoKitchenSeed(household_id: string, today = todayISO()): KitchenItem[] {
  const base = { household_id, status: "active" as const, created_by: null, barcode: null, confidence: 1, usual_quantity: null, low_threshold: null, kcal_per_unit: null, shelf_life_id: null };
  const row = (id: string, name: string, quantity: number, unit: UnitT, location: Location, addedAgo: number, left: number, src: KitchenItem["expiry_source"], extra: Partial<KitchenItem> = {}): KitchenItem => ({
    ...base,
    id,
    name,
    quantity,
    unit,
    location,
    added_at: `${addDays(today, -addedAgo)}T10:00:00.000Z`,
    expires_on: addDays(today, left),
    expiry_source: src,
    ...extra,
  });
  return [
    row("seed-bread", "Bread", 1, "loaf", "fridge", 6, -1, "printed", { shelf_life_id: 118, kcal_per_unit: 70 }),
    row("seed-palak", "Palak", 1, "bunch", "fridge", 3, 1, "foodkeeper", { shelf_life_id: 101 }),
    row("seed-milk", "Toned milk", 1, "pack", "fridge", 3, 2, "printed", { shelf_life_id: 112, usual_quantity: 3, low_threshold: 1, kcal_per_unit: 290 }),
    row("seed-paneer", "Paneer", 200, "g", "fridge", 3, 2, "foodkeeper", { shelf_life_id: 110 }),
    row("seed-curd", "Curd", 400, "g", "fridge", 4, 3, "printed", { shelf_life_id: 111 }),
    row("seed-tomato", "Tomatoes", 3, "count", "fridge", 3, 5, "ai_estimate", { kcal_per_unit: 22 }),
    row("seed-eggs", "Eggs", 10, "count", "fridge", 3, 28, "foodkeeper", { shelf_life_id: 116, usual_quantity: 12, low_threshold: 4, kcal_per_unit: 72 }),
    row("seed-peas", "Green peas", 500, "g", "freezer", 20, 280, "foodkeeper", { shelf_life_id: 128 }),
    row("seed-chicken", "Chicken", 1, "kg", "freezer", 10, 300, "foodkeeper", { shelf_life_id: 117 }),
    row("seed-atta", "Atta", 1, "kg", "pantry", 40, 95, "printed", { shelf_life_id: 121, usual_quantity: 5, low_threshold: 1 }),
    row("seed-dal", "Toor dal", 1, "kg", "pantry", 30, 400, "printed", { shelf_life_id: 122 }),
    row("seed-parle", "Parle-G", 2, "pack", "pantry", 12, 120, "printed", { shelf_life_id: 126 }),
  ];
}
