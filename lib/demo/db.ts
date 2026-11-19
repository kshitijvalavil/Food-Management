// IndexedDB store for demo mode (and the local shopping list in both modes), via Dexie.
import Dexie, { type EntityTable } from "dexie";
import type { KitchenItem } from "@/lib/types";

export type UsageKind = "added" | "used" | "binned" | "moved";

export interface UsageEvent {
  id?: number;
  household_id: string;
  item_id: string;
  kind: UsageKind;
  quantity: number;
  at: string;
}

export interface ShoppingEntry {
  id: string;
  name: string;
  done: boolean;
  added_by: string;
  created_at: string;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export class ShelfDB extends Dexie {
  items!: EntityTable<KitchenItem, "id">;
  events!: EntityTable<UsageEvent, "id">;
  shopping!: EntityTable<ShoppingEntry, "id">;
  meta!: EntityTable<MetaRow, "key">;

  constructor(name = "shelflife") {
    super(name);
    this.version(1).stores({
      items: "id, location, status, expires_on",
      events: "++id, item_id, kind, at",
      shopping: "id, created_at",
      meta: "key",
    });
  }
}

let db: ShelfDB | null = null;

export function getDB(): ShelfDB {
  db ??= new ShelfDB();
  return db;
}

/** Tests swap in a fresh database. */
export function setDB(next: ShelfDB | null) {
  db = next;
}

export const DEMO_HOUSEHOLD = "demo-household";
