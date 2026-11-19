"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IS_DEMO, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

let client: SupabaseClient | null = null;

/** Browser Supabase client (anon key + the user's session cookie). Never used in demo mode. */
export function getSupabase(): SupabaseClient {
  if (IS_DEMO) throw new Error("Supabase is not configured: the app is in demo mode.");
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}
