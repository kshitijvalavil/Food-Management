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
 * Counts one AI call for the user today (UTC day) in `ai_usage`, or throws rate_limited
 * once the cap is reached. Call it before calling Claude, so failed calls still count.
 *
 * Read-then-upsert: two requests racing in the same instant can both pass at the limit.
 * Good enough for a soft cap; an atomic `increment_ai_usage` RPC can replace it later.
 */
export async function consumeAiCall(
  admin: SupabaseClient,
  userId: string,
  deps: Deps,
): Promise<{ used: number; limit: number }> {
  const limit = dailyLimit(deps);
  const day = todayUtc(deps);
  const { data, error } = await admin
    .from("ai_usage")
    .select("calls")
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();
  if (error) throw new Error(`ai_usage read failed: ${error.message}`);
  const used = typeof data?.calls === "number" ? data.calls : 0;
  if (used >= limit) {
    throw new HttpError("rate_limited", `Daily limit of ${limit} AI scans reached. It resets at midnight UTC.`);
  }
  const { error: writeError } = await admin
    .from("ai_usage")
    .upsert({ user_id: userId, day, calls: used + 1 }, { onConflict: "user_id,day" });
  if (writeError) throw new Error(`ai_usage write failed: ${writeError.message}`);
  return { used: used + 1, limit };
}
