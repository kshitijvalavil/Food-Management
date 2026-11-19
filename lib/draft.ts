"use client";
// The Review draft: everything captured but not yet saved. Lives in memory + sessionStorage so it
// survives moving between Camera, Search, Voice and Review (and a reload), but never reaches the
// Kitchen until the user taps Save.
import { useSyncExternalStore } from "react";
import type { EnrichedItem } from "@/shared/schema";
import type { CaptureOrigin, DraftItem } from "@/lib/types";

const KEY = "shelflife.draft.v1";

export interface DraftState {
  items: DraftItem[];
  /** "From your fridge photo, Sat 15 Nov" */
  sourceLabel: string | null;
}

const EMPTY: DraftState = { items: [], sourceLabel: null };
let state: DraftState = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw) state = JSON.parse(raw) as DraftState;
  } catch {
    state = EMPTY;
  }
}

function set(next: DraftState) {
  state = next;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode: keep it in memory */
  }
  listeners.forEach((l) => l());
}

let seq = 0;
function key() {
  seq += 1;
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k${Date.now()}-${seq}`;
}

export const draft = {
  get(): DraftState {
    load();
    return state;
  },
  add(items: EnrichedItem[], origin: CaptureOrigin, sourceLabel?: string) {
    load();
    const rows: DraftItem[] = items.map((i) => ({ ...i, key: key(), origin, confirmed: false }));
    set({ items: [...state.items, ...rows], sourceLabel: sourceLabel ?? state.sourceLabel });
    return rows;
  },
  update(k: string, patch: Partial<DraftItem>) {
    load();
    set({ ...state, items: state.items.map((i) => (i.key === k ? { ...i, ...patch } : i)) });
  },
  remove(k: string) {
    load();
    set({ ...state, items: state.items.filter((i) => i.key !== k) });
  },
  clear() {
    set(EMPTY);
  },
  /** Tests only. */
  reset(next: DraftState = EMPTY) {
    loaded = true;
    state = next;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useDraft(): DraftState {
  return useSyncExternalStore(draft.subscribe, draft.get, () => EMPTY);
}
