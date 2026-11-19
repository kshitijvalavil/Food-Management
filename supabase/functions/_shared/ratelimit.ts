import type { SupabaseClient } from "@supabase/supabase-js";
import type { Deps } from "./deps.ts";
import { serverToday } from "./deps.ts";
import { HttpError } from "./errors.ts";

export const DEFAULT_AI_DAILY_LIMIT = 40;
export const DEFAULT_BARCODE_DAILY_LIMIT = 200;

export type CounterKind = "ai" | "barcode";

const LIMITS: Record<CounterKind, { env: string; fallback: number; message: (n: number) => string }> = {
  ai: {
    env: "AI_DAILY_LIMIT",
    fallback: DEFAULT_AI_DAILY_LIMIT,
    message: (n) => `Daily limit of ${n} AI scans reached. It resets at midnight.`,
  },
  barcode: {
    env: "BARCODE_DAILY_LIMIT",
    fallback: DEFAULT_BARCODE_DAILY_LIMIT,
    message: (n) => `Daily limit of ${n} new barcode lookups reached. It resets at midnight.`,
  },
};

/** A non-negative integer from env; blank, missing or junk falls back to the default. */
export function limitFor(deps: Deps, kind: CounterKind): number {
  const { env, fallback } = LIMITS[kind];
  const raw = deps.env(env)?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

export function dailyLimit(deps: Deps): number {
  return limitFor(deps, "ai");
}

/**
 * The `p_day` key for a counter. AI calls use the real day. Barcode lookups reuse the same
 * atomic RPC and table with the day shifted 1000 years ahead (2026-11-18 -> 3026-11-18),
 * so the two counters never collide. Sprint 1 stop-gap until a `kind` column exists.
 */
export function counterDay(day: string, kind: CounterKind): string {
  if (kind === "ai") return day;
  const year = Number(day.slice(0, 4)) + 1000;
  return `${String(year).padStart(4, "0")}${day.slice(4)}`;
}

/**
 * Counts one call for the user today (APP_TIMEZONE day) and throws rate_limited once the
 * count passes the cap. Uses `public.bump_ai_usage(p_user_id, p_day)` (service role only),
 * which increments atomically and returns the new count, so concurrent requests cannot
 * slip past. Refused calls still increment; harmless, the counter is per day.
 */
export async function consumeDaily(
  admin: SupabaseClient,
  userId: string,
  deps: Deps,
  kind: CounterKind,
): Promise<{ used: number; limit: number }> {
  const limit = limitFor(deps, kind);
  const { data, error } = await admin.rpc("bump_ai_usage", {
    p_user_id: userId,
    p_day: counterDay(serverToday(deps), kind),
  });
  if (error) throw new Error(`bump_ai_usage failed: ${error.message}`);
  const used = typeof data === "number" ? data : Number(data);
  if (!Number.isFinite(used)) throw new Error("bump_ai_usage returned no count");
  if (used > limit) throw new HttpError("rate_limited", LIMITS[kind].message(limit));
  return { used, limit };
}

/** One AI call (analyze-photo, parse-text). */
export function consumeAiCall(admin: SupabaseClient, userId: string, deps: Deps) {
  return consumeDaily(admin, userId, deps, "ai");
}
