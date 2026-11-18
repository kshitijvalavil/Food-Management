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
  assertEquals(fb.aiUsage.get(`${USER}|2026-11-18`), 2);

  // Uses the service role and upserts on (user_id, day).
  const write = fb.calls.find((c) => c.method === "POST" && c.url.pathname === "/rest/v1/ai_usage");
  assertEquals(write?.headers.get("apikey"), "service-role-key");
  assertEquals(write?.url.searchParams.get("on_conflict"), "user_id,day");

  // Next UTC day starts again.
  fb.now = new Date("2026-11-19T00:00:01Z");
  assertEquals((await consumeAiCall(admin, USER, fb.deps())).used, 1);
});
