import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Deps } from "./deps.ts";
import { HttpError } from "./errors.ts";

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const;

function requireEnv(deps: Deps, name: string): string {
  const v = deps.env(name);
  if (!v) throw new HttpError("internal", "Server is not configured.");
  return v;
}

export interface AuthedUser {
  userId: string;
  /** Acts as the user: RLS applies. */
  userClient: SupabaseClient;
}

/** Verifies the caller's Supabase JWT (Authorization: Bearer ...) and returns the user. */
export async function requireUser(req: Request, deps: Deps): Promise<AuthedUser> {
  const header = req.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) throw new HttpError("unauthorized", "Sign in first.");
  const jwt = match[1];

  const userClient = createClient(requireEnv(deps, "SUPABASE_URL"), requireEnv(deps, "SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: `Bearer ${jwt}` }, fetch: deps.fetch },
    auth: NO_SESSION,
  });
  const { data, error } = await userClient.auth.getUser(jwt);
  if (error || !data?.user?.id) throw new HttpError("unauthorized", "Your session has expired. Sign in again.");
  return { userId: data.user.id, userClient };
}

/** Service-role client. Server only; bypasses RLS, so check membership yourself. */
export function adminClient(deps: Deps): SupabaseClient {
  return createClient(requireEnv(deps, "SUPABASE_URL"), requireEnv(deps, "SUPABASE_SERVICE_ROLE_KEY"), {
    global: { fetch: deps.fetch },
    auth: NO_SESSION,
  });
}

/** True if the user is a member of the household (checked with the service role). */
export async function isHouseholdMember(admin: SupabaseClient, userId: string, householdId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("household_members")
    .select("household_id")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`membership check failed: ${error.message}`);
  return data !== null;
}
