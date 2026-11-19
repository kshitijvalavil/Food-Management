import { assertEquals } from "@std/assert";
import { ApiError, SearchFoodResponse } from "../../../shared/schema.ts";
import { FakeBackend, fixture, post } from "../_shared/testing.ts";
import { createHandler } from "./index.ts";

async function setup() {
  const fb = new FakeBackend();
  fb.shelfLife = await fixture("shelf-life-rows.json");
  return { fb, handler: createHandler(fb.deps()) };
}

Deno.test("search-food: maps RPC rows to results, called as the user", async () => {
  const { fb, handler } = await setup();
  const res = await handler(post("search-food", { q: "curd" }));
  assertEquals(res.status, 200);
  const body = SearchFoodResponse.parse(await res.json());
  assertEquals(body.results, [{ shelf_life_id: 105, name: "Yogurt", category: "Dairy", default_location: "fridge" }]);
  const rpc = fb.calls.find((c) => c.url.pathname === "/rest/v1/rpc/search_food");
  assertEquals(JSON.parse(rpc?.body ?? "{}"), { q: "curd" });
  assertEquals(rpc?.headers.get("apikey"), "anon-key");
  assertEquals(rpc?.headers.get("Authorization"), "Bearer user-jwt-123");
});

Deno.test("search-food: no match -> empty results", async () => {
  const { handler } = await setup();
  const res = await handler(post("search-food", { q: "dragonfruit" }));
  assertEquals(SearchFoodResponse.parse(await res.json()).results, []);
});

Deno.test("search-food: bad input -> 400, no auth -> 401, RPC down -> 502", async () => {
  const { fb, handler } = await setup();
  for (const q of ["", "   ", "x".repeat(61)]) {
    const res = await handler(post("search-food", { q }));
    assertEquals(res.status, 400);
  }
  const noAuth = await handler(post("search-food", { q: "milk" }, { jwt: null }));
  assertEquals(noAuth.status, 401);
  fb.rpcError = "db down";
  const down = await handler(post("search-food", { q: "milk" }));
  assertEquals(down.status, 502);
  assertEquals(ApiError.parse(await down.json()).error.code, "upstream_failed");
});
