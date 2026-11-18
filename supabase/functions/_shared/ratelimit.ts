import type { SupabaseClient } from "@supabase/supabase-js";
import type { Deps } from "./deps.ts";
import { todayUtc } from "./deps.ts";
import { HttpError } from "./errors.ts";

export const DEFAULT_AI_DAILY_LIMIT = 40;

export function dailyLimit(deps: Deps): number {
  const raw = deps.env("AI_DAILY_LIMIT");
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_AI_DAILY_LIMIT;
}

/**
 * Counts one AI call for the user today (UTC day) and throws rate_limited once the
 * count passes the cap. Call it before calling Claude, so failed calls still count.
 *
 * Uses `public.bump_ai_usage(p_user_id, p_day)` (service role only), which increments
 * `ai_usage.calls` atomically and returns the new count, so concurrent requests cannot
 * slip past the cap. Calls that are refused still increment the counter; that is harmless
 * because the counter only grows within the day and is reset by the next day's row.
 */
export async function consumeAiCall(
  admin: SupabaseClient,
  userId: string,
  deps: Deps,
): Promise<{ used: number; limit: number }> {
  const limit = dailyLimit(deps);
  const { data, error } = await admin.rpc("bump_ai_usage", { p_user_id: userId, p_day: todayUtc(deps) });
  if (error) throw new Error(`bump_ai_usage failed: ${error.message}`);
  const used = typeof data === "number" ? data : Number(data);
  if (!Number.isFinite(used)) throw new Error("bump_ai_usage returned no count");
  if (used > limit) {
    throw new HttpError("rate_limited", `Daily limit of ${limit} AI scans reached. It resets at midnight UTC.`);
  }
  return { used, limit };
}
