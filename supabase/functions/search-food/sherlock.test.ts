// Sherlock Bugs: adversarial tests for search-food. FakeBackend only; no network.
import { assert, assertEquals } from "@std/assert";
import { ApiError, SearchFoodResponse } from "../../../shared/schema.ts";
import { FakeBackend, fixture, post } from "../_shared/testing.ts";
import { assertNoLeak, bearer, captureLogs, rawPost } from "../_shared/sherlock_testing.ts";
import { createHandler } from "./index.ts";

async function setup() {
  const fb = new FakeBackend();
  fb.shelfLife = await fixture("shelf-life-rows.json");
  return { fb, handler: createHandler(fb.deps()) };
}

Deno.test("sherlock search-food: bad q and bad auth", async () => {
  const { fb, handler } = await setup();
  for (const body of [{}, { q: "" }, { q: "   " }, { q: "x".repeat(61) }, { q: 1 }, { q: ["milk"] }]) {
    const res = await handler(post("search-food", body));
    assertEquals(res.status, 400, JSON.stringify(body));
    assertEquals(ApiError.parse(await res.json()).error.code, "bad_request");
  }
  for (const h of [bearer(null), bearer("garbage"), bearer("expired")]) {
    assertEquals((await handler(rawPost("search-food", JSON.stringify({ q: "milk" }), h))).status, 401);
  }
  assertEquals(fb.callsTo("supabase.test", "/rest/v1/rpc/search_food").length, 0);
});

Deno.test("sherlock search-food: SQL-ish and wildcard input goes to the RPC as a bound parameter", async () => {
  const { fb, handler } = await setup();
  for (const q of ["milk'; drop table items;--", "%", "_", "\\", "milk) or (1=1"]) {
    const res = await handler(post("search-food", { q }));
    assertEquals(res.status, 200, q);
    SearchFoodResponse.parse(await res.json());
  }
  const sent = fb.callsTo("supabase.test", "/rest/v1/rpc/search_food").map((c) => JSON.parse(c.body!).q);
  assertEquals(sent[0], "milk'; drop table items;--");
});

Deno.test("sherlock search-food: RPC uses the caller's JWT (RLS), never the service role", async () => {
  const { fb, handler } = await setup();
  await handler(post("search-food", { q: "milk" }));
  const [call] = fb.callsTo("supabase.test", "/rest/v1/rpc/search_food");
  assertEquals(call.headers.get("Authorization"), "Bearer user-jwt-123");
  assert(call.headers.get("apikey") !== "service-role-key");
});

Deno.test("sherlock search-food: RPC error text is logged, never returned", async () => {
  const { fb, handler } = await setup();
  fb.rpcError = "relation shelf_life does not exist at character 15";
  const { result: res } = await captureLogs(() => handler(post("search-food", { q: "milk" })));
  const text = await res.text();
  assertEquals(res.status, 502);
  assert(!text.includes("relation"));
  assertNoLeak(text, "body");
});
