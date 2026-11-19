import { NextResponse, type NextRequest } from "next/server";
import { IS_DEMO } from "@/lib/env";
import { getServerSupabase } from "@/lib/supabase/server";

/** Magic link lands here: swap the one-time code for a session cookie, then open the app. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (IS_DEMO || !code) return NextResponse.redirect(new URL("/", url.origin));
  const sb = await getServerSupabase();
  const { error } = await sb.auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL(error ? "/login?error=link" : "/", url.origin));
}
