"use client";
// Kitchen repository: the `items` table via supabase-js, or IndexedDB in demo mode.
import type { EnrichedItem } from "@/shared/schema";
import { IS_DEMO } from "@/lib/env";
import { todayISO } from "@/lib/dates";
import { demoKitchenSeed } from "@/lib/demo/fixtures";
import { getDB, type UsageKind } from "@/lib/demo/db";
import { getMember } from "@/lib/household";
import { getSupabase } from "@/lib/supabase/client";
import { KitchenItem } from "@/lib/types";

export type ItemPatch = Partial<Pick<KitchenItem, "quantity" | "location" | "expires_on" | "expiry_source" | "usual_quantity" | "low_threshold">>;

export interface MonthStats {
  used: number;
  binned: number;
}

export interface KitchenRepo {
  list(): Promise<KitchenItem[]>;
  get(id: string): Promise<KitchenItem | null>;
  addMany(items: EnrichedItem[]): Promise<KitchenItem[]>;
  update(id: string, patch: ItemPatch, event?: UsageKind): Promise<void>;
  setStatus(id: string, status: "used" | "binned"): Promise<void>;
  monthStats(): Promise<MonthStats>;
}

function monthStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function newRow(item: EnrichedItem, household_id: string, created_by: string | null, id: string): KitchenItem {
  return {
    id,
    household_id,
    name: item.name.trim().slice(0, 80), // items.name is 1-80 chars

    quantity: item.quantity,
    unit: item.unit,
    location: item.location,
    added_at: new Date().toISOString(),
    expires_on: item.expires_on,
    expiry_source: item.expiry_source,
    confidence: item.confidence,
    shelf_life_id: item.shelf_life_id,
    barcode: item.barcode,
    kcal_per_unit: item.kcal_per_unit,
    status: "active",
    usual_quantity: null,
    low_threshold: null,
    created_by,
  };
}

// ---------- demo (IndexedDB) ----------
async function ensureSeeded() {
  const db = getDB();
  const seeded = await db.meta.get("seeded");
  if (!seeded) {
    await db.transaction("rw", db.items, db.meta, async () => {
      await db.items.bulkPut(demoKitchenSeed("demo-household", todayISO()));
      await db.meta.put({ key: "seeded", value: new Date().toISOString() });
    });
  }
}

export const demoRepo: KitchenRepo = {
  async list() {
    await ensureSeeded();
    return (await getDB().items.toArray()).filter((i) => i.status === "active");
  },
  async get(id) {
    await ensureSeeded();
    return (await getDB().items.get(id)) ?? null;
  },
  async addMany(items) {
    const db = getDB();
    const rows = items.map((i) => newRow(i, "demo-household", "demo-user", crypto.randomUUID()));
    await db.transaction("rw", db.items, db.events, async () => {
      await db.items.bulkAdd(rows);
      await db.events.bulkAdd(rows.map((r) => ({ household_id: r.household_id, item_id: r.id, kind: "added" as const, quantity: r.quantity, at: r.added_at })));
    });
    return rows;
  },
  async update(id, patch, event) {
    const db = getDB();
    const item = await db.items.get(id);
    if (!item) throw new Error("Item not found");
    await db.items.update(id, patch);
    if (event) await db.events.add({ household_id: item.household_id, item_id: id, kind: event, quantity: patch.quantity ?? item.quantity, at: new Date().toISOString() });
  },
  async setStatus(id, status) {
    const db = getDB();
    const item = await db.items.get(id);
    if (!item) throw new Error("Item not found");
    await db.items.update(id, { status });
    await db.events.add({ household_id: item.household_id, item_id: id, kind: status, quantity: item.quantity, at: new Date().toISOString() });
  },
  async monthStats() {
    const since = monthStart();
    const events = await getDB().events.where("at").aboveOrEqual(since).toArray();
    return { used: events.filter((e) => e.kind === "used").length, binned: events.filter((e) => e.kind === "binned").length };
  },
};

/** Demo only: wipe local data so the seed kitchen comes back. */
export async function resetDemoData() {
  const db = getDB();
  await db.transaction("rw", db.items, db.events, db.meta, db.shopping, async () => {
    await Promise.all([db.items.clear(), db.events.clear(), db.meta.clear(), db.shopping.clear()]);
  });
}

// ---------- real (Supabase) ----------
const COLUMNS = "id,household_id,name,quantity,unit,location,added_at,expires_on,expiry_source,confidence,shelf_life_id,barcode,kcal_per_unit,status,usual_quantity,low_threshold,created_by";

async function logEvent(household_id: string, item_id: string, kind: UsageKind, quantity: number) {
  const { error } = await getSupabase().from("usage_events").insert({ household_id, item_id, kind, quantity, at: new Date().toISOString() });
  if (error) console.warn("usage_events insert failed", error.message);
}

export const supabaseRepo: KitchenRepo = {
  async list() {
    const { householdId } = await getMember();
    const { data, error } = await getSupabase().from("items").select(COLUMNS).eq("household_id", householdId).eq("status", "active");
    if (error) throw error;
    return KitchenItem.array().parse(data);
  },
  async get(id) {
    const { data, error } = await getSupabase().from("items").select(COLUMNS).eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? KitchenItem.parse(data) : null;
  },
  async addMany(items) {
    const { householdId, userId } = await getMember();
    const rows = items.map((i) => {
      const { id: _id, ...rest } = newRow(i, householdId, userId, "");
      return rest;
    });
    const { data, error } = await getSupabase().from("items").insert(rows).select(COLUMNS);
    if (error) throw error;
    const saved = KitchenItem.array().parse(data);
    const { error: evErr } = await getSupabase()
      .from("usage_events")
      .insert(saved.map((r) => ({ household_id: r.household_id, item_id: r.id, kind: "added", quantity: r.quantity, at: r.added_at })));
    if (evErr) console.warn("usage_events insert failed", evErr.message);
    return saved;
  },
  async update(id, patch, event) {
    const { data, error } = await getSupabase().from("items").update(patch).eq("id", id).select(COLUMNS).single();
    if (error) throw error;
    const row = KitchenItem.parse(data);
    if (event) await logEvent(row.household_id, id, event, row.quantity);
  },
  async setStatus(id, status) {
    const { data, error } = await getSupabase().from("items").update({ status }).eq("id", id).select(COLUMNS).single();
    if (error) throw error;
    const row = KitchenItem.parse(data);
    await logEvent(row.household_id, id, status, row.quantity);
  },
  async monthStats() {
    const { householdId } = await getMember();
    const { data, error } = await getSupabase().from("usage_events").select("kind").eq("household_id", householdId).gte("at", monthStart()).in("kind", ["used", "binned"]);
    if (error) return { used: 0, binned: 0 };
    return { used: data.filter((e) => e.kind === "used").length, binned: data.filter((e) => e.kind === "binned").length };
  },
};

export const kitchen: KitchenRepo = IS_DEMO ? demoRepo : supabaseRepo;
