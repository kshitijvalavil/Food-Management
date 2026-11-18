import { assertEquals, assertRejects } from "@std/assert";
import { adminClient } from "./auth.ts";
import { HttpError } from "./errors.ts";
import { consumeAiCall, DEFAULT_AI_DAILY_LIMIT, dailyLimit } from "./ratelimit.ts";
import { FakeBackend, USER } from "./testing.ts";

Deno.test("dailyLimit: 40 by default, AI_DAILY_LIMIT overrides, junk ignored", () => {
  const fb = new FakeBackend();
  assertEquals(dailyLimit(fb.deps()), DEFAULT_AI_DAILY_LIMIT);
  assertEquals(DEFAULT_AI_DAILY_LIMIT, 40);
  fb.env.AI_DAILY_LIMIT = "5";
  assertEquals(dailyLimit(fb.deps()), 5);
  fb.env.AI_DAILY_LIMIT = "lots";
  assertEquals(dailyLimit(fb.deps()), 40);
  fb.env.AI_DAILY_LIMIT = "-3";
  assertEquals(dailyLimit(fb.deps()), 40);
});

Deno.test("consumeAiCall: counts per user per UTC day and stops at the cap", async () => {
  const fb = new FakeBackend();
  fb.env.AI_DAILY_LIMIT = "2";
  const deps = fb.deps();
  const admin = adminClient(deps);
  assertEquals(await consumeAiCall(admin, USER, deps), { used: 1, limit: 2 });
  assertEquals(await consumeAiCall(admin, USER, deps), { used: 2, limit: 2 });
  const err = await assertRejects(() => consumeAiCall(admin, USER, deps), HttpError);
  assertEquals(err.code, "rate_limited");
  assertEquals(err.status, 429);
  assertEquals(fb.aiUsage.get(`${USER}|2026-11-18`), 3); // the refused call is counted too

  // One atomic RPC per call, with the service role and an explicit UTC day.
  const bumps = fb.calls.filter((c) => c.url.pathname === "/rest/v1/rpc/bump_ai_usage");
  assertEquals(bumps.length, 3);
  assertEquals(bumps[0].headers.get("apikey"), "service-role-key");
  assertEquals(JSON.parse(bumps[0].body ?? "{}"), { p_user_id: USER, p_day: "2026-11-18" });
  assertEquals(fb.calls.filter((c) => c.url.pathname === "/rest/v1/ai_usage").length, 0);

  // The RPC is service-role only: an anon/user client is refused and the call fails closed.
  const { createClient } = await import("@supabase/supabase-js");
  const anon = createClient(fb.env.SUPABASE_URL, fb.env.SUPABASE_ANON_KEY, {
    global: { fetch: deps.fetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await assertRejects(() => consumeAiCall(anon, USER, deps), Error, "bump_ai_usage failed");

  // Next UTC day starts again.
  fb.now = new Date("2026-11-19T00:00:01Z");
  assertEquals((await consumeAiCall(admin, USER, fb.deps())).used, 1);
});
