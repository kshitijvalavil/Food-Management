"use client";
import { IS_DEMO } from "@/lib/env";
import { DEMO_HOUSEHOLD } from "@/lib/demo/db";
import { getSupabase } from "@/lib/supabase/client";

export interface Member {
  userId: string;
  email: string | null;
  householdId: string;
}

let cached: Promise<Member> | null = null;

/** The signed-in user and their household (first membership). Demo mode returns a local household. */
export function getMember(): Promise<Member> {
  if (IS_DEMO) return Promise.resolve({ userId: "demo-user", email: null, householdId: DEMO_HOUSEHOLD });
  cached ??= (async () => {
    const sb = getSupabase();
    const { data: auth, error: authErr } = await sb.auth.getUser();
    if (authErr || !auth.user) throw new Error("Not signed in");
    const { data, error } = await sb
      .from("household_members")
      .select("household_id")
      .eq("user_id", auth.user.id)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("You are not in a household yet.");
    return { userId: auth.user.id, email: auth.user.email ?? null, householdId: data.household_id as string };
  })().catch((e) => {
    cached = null;
    throw e;
  });
  return cached;
}

export function resetMemberCache() {
  cached = null;
}
