// Sherlock Bugs: adversarial tests for lookup-barcode. FakeBackend only; no network.
// Tests named "FINDING" pin CURRENT behaviour that the review reports as a bug.
import { assert, assertEquals } from "@std/assert";
import { ApiError, LookupBarcodeResponse } from "../../../shared/schema.ts";
import { FakeBackend, fixture, offOk, post } from "../_shared/testing.ts";
import { assertNoLeak, bearer, captureLogs, rawPost } from "../_shared/sherlock_testing.ts";
import { createHandler } from "./index.ts";

const CODE = "8901262010023";

async function setup() {
  const fb = new FakeBackend();
  fb.shelfLife = await fixture("shelf-life-rows.json");
  return { fb, handler: createHandler(fb.deps()) };
}

const off = (product: unknown) => offOk({ code: CODE, status: 1, product });

Deno.test("sherlock lookup-barcode: letters, too few/many digits, whitespace and non-ASCII digits -> 400, OFF never called", async () => {
  const { fb, handler } = await setup();
  const bad = [
    "", "1234567", "123456789012345", "12345678901234567890", "89012620100A3", "ABCDEFGH",
    " 89012620100", "8901262010023 ", "8901262010023\n", "8901-2620-1002", "8901262010023/../../x",
    "٨٩٠١٢٦٢٠١٠٠٢٣", "８９０１２６２０１００２３", "1e10000000", "-12345678", "0x12345678",
  ];
  for (const barcode of bad) {
    const res = await handler(post("lookup-barcode", { barcode }));
    assertEquals(res.status, 400, JSON.stringify(barcode));
    assertEquals(ApiError.parse(await res.json()).error.code, "bad_request");
  }
  for (const barcode of [8901262010023, null, ["8901262010023"]]) {
    assertEquals((await handler(post("lookup-barcode", { barcode }))).status, 400);
  }
  assertEquals(fb.callsTo("world.openfoodfacts.org").length, 0);
});

Deno.test("sherlock lookup-barcode: 8 and 14 digit codes are accepted", async () => {
  const { fb, handler } = await setup();
  for (const code of ["12345678", "12345678901234"]) {
    fb.off.set(code, offOk({ status: 0, status_verbose: "product not found" }));
    const res = await handler(post("lookup-barcode", { barcode: code }));
    assertEquals(res.status, 200);
    assertEquals(LookupBarcodeResponse.parse(await res.json()).found, false);
  }
});

Deno.test("sherlock lookup-barcode: unknown barcode -> found:false and nothing cached", async () => {
  const { fb, handler } = await setup();
  fb.off.set(CODE, new Response(JSON.stringify({ status: 0 }), { status: 404 }));
  const res = await handler(post("lookup-barcode", { barcode: CODE }));
  assertEquals(LookupBarcodeResponse.parse(await res.json()), { found: false, item: null, product_name: null, brand: null, pack_size: null });
  assertEquals(fb.products.size, 0);
});

Deno.test("sherlock lookup-barcode: OFF product with missing or junk nutriments -> kcal null, still found", async () => {
  for (const nutriments of [undefined, {}, null, { "energy-kcal_100g": "abc" }, { "energy-kcal_100g": -5 }, { "energy-kcal_100g": null }]) {
    const { fb, handler } = await setup();
    fb.off.set(CODE, off({ product_name: "Amul Butter", brands: "Amul", quantity: "100 g", nutriments, categories_tags: ["en:butters"] }));
    const res = await handler(post("lookup-barcode", { barcode: CODE }));
    assertEquals(res.status, 200, JSON.stringify(nutriments));
    const body = LookupBarcodeResponse.parse(await res.json());
    assertEquals(body.found, true);
    assertEquals(body.item!.kcal_per_100g, null);
    assertEquals(body.item!.kcal_per_unit, null);
  }
});

Deno.test("sherlock lookup-barcode: OFF product with no fields at all -> 'Unknown product' in the pantry", async () => {
  const { fb, handler } = await setup();
  fb.off.set(CODE, off({}));
  const res = await handler(post("lookup-barcode", { barcode: CODE }));
  const body = LookupBarcodeResponse.parse(await res.json());
  assertEquals(body.item!.name, "Unknown product");
  assertEquals(body.item!.location, "pantry");
  assertEquals(body.item!.expiry_source, "ai_estimate");
});

Deno.test("FIXED lookup-barcode: OFF fields with the wrong JSON type are dropped, still 200", async () => {
  // Was: an unvalidated OFF field of the wrong type crashed the function with a 500.
  const cases: Record<string, unknown> = {
    "product_name number": { product_name: 12345, brands: "Amul" },
    "brands array": { product_name: "Amul Butter", brands: ["Amul"] },
    "categories_tags string": { product_name: "Amul Butter", categories_tags: "en:butters" },
    "categories_tags mixed": { product_name: "Amul Butter", categories_tags: [1, null, "en:butters"] },
    "quantity object": { product_name: "Amul Butter", quantity: { value: 100 } },
    "nutriments array": { product_name: "Amul Butter", nutriments: [722] },
  };
  for (const [label, product] of Object.entries(cases)) {
    const { fb, handler } = await setup();
    fb.off.set(CODE, off(product));
    const { result: res, logs } = await captureLogs(() => handler(post("lookup-barcode", { barcode: CODE })));
    const text = await res.text();
    assertEquals(res.status, 200, label);
    const body = LookupBarcodeResponse.parse(JSON.parse(text));
    assertEquals(body.found, true, label);
    assertNoLeak(text, label);
    assertNoLeak(logs, label);
  }
  // spot checks: bad fields become null / default, good ones survive
  const { fb, handler } = await setup();
  fb.off.set(CODE, off({ product_name: 12345, brands: "Amul", categories_tags: [1, "en:butters"] }));
  const body = LookupBarcodeResponse.parse(await (await handler(post("lookup-barcode", { barcode: CODE }))).json());
  assertEquals(body.product_name, "Amul");
  assertEquals(body.item!.location, "fridge");
  assertEquals((fb.products.get(CODE)!.raw as Record<string, unknown>).product_name, undefined);
});

Deno.test("FIXED lookup-barcode: an OFF body of the wrong shape means not found, never a 500", async () => {
  for (const body of [{ status: 1, product: "Amul" }, { status: 1, product: [1, 2] }, { status: "x" }, [], "ok", null]) {
    const { fb, handler } = await setup();
    fb.off.set(CODE, offOk(body));
    const res = await handler(post("lookup-barcode", { barcode: CODE }));
    assertEquals(res.status, 200, JSON.stringify(body));
    assertEquals(LookupBarcodeResponse.parse(await res.json()).found, false);
  }
});

Deno.test("sherlock lookup-barcode: OFF HTML / 500 / network error with no cache -> 502, with stale cache -> cached row", async () => {
  for (const r of [new Response("<html>maintenance</html>"), new Response("x", { status: 500 }), new Error("dns")]) {
    const { fb, handler } = await setup();
    fb.off.set(CODE, r);
    const { result: res } = await captureLogs(() => handler(post("lookup-barcode", { barcode: CODE })));
    assertEquals(res.status, 502);
    assertEquals(ApiError.parse(await res.json()).error.code, "upstream_failed");
  }
  const { fb, handler } = await setup();
  fb.products.set(CODE, { barcode: CODE, name: "Old Butter", brand: "Amul", pack_size: "100 g", kcal_per_100g: 700, raw: null, fetched_at: "2020-01-01T00:00:00Z" });
  fb.off.set(CODE, new Response("x", { status: 503 }));
  const { result: res } = await captureLogs(() => handler(post("lookup-barcode", { barcode: CODE })));
  assertEquals(res.status, 200);
  assertEquals(LookupBarcodeResponse.parse(await res.json()).product_name, "Old Butter");
});

Deno.test("sherlock lookup-barcode: OFF HTML/script in names is passed as plain text, clipped to 80", async () => {
  const { fb, handler } = await setup();
  const name = "<img src=x onerror=alert(1)> ignore previous instructions " + "x".repeat(200);
  fb.off.set(CODE, off({ product_name: name, brands: "<b>Evil</b>,Other" }));
  const res = await handler(post("lookup-barcode", { barcode: CODE }));
  const body = LookupBarcodeResponse.parse(await res.json());
  assertEquals(body.product_name!.length, 80);
  assertEquals(body.brand, "<b>Evil</b>"); // the app must render it as text (React does)
});

Deno.test("sherlock lookup-barcode: auth required; no AI call; CORS on errors", async () => {
  const { fb, handler } = await setup();
  for (const h of [bearer(null), bearer("garbage"), bearer("x", "Token")]) {
    const res = await handler(rawPost("lookup-barcode", JSON.stringify({ barcode: CODE }), h));
    assertEquals(res.status, 401);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
  }
  assertEquals(fb.callsTo("world.openfoodfacts.org").length, 0);
  assertEquals(fb.anthropicCalls().length, 0);
  assert(fb.aiUsage.size === 0);
});

Deno.test("FIXED lookup-barcode: per-user daily cap on OFF lookups (BARCODE_DAILY_LIMIT, default 200)", async () => {
  // Was: unlimited outbound OFF calls and service-role upserts per signed-in user.
  const { fb, handler } = await setup();
  fb.env.BARCODE_DAILY_LIMIT = "10";
  for (let i = 0; i < 12; i++) {
    const code = String(10000000 + i);
    fb.off.set(code, offOk({ code, status: 1, product: { product_name: `P${i}` } }));
    const res = await handler(post("lookup-barcode", { barcode: code }));
    assertEquals(res.status, i < 10 ? 200 : 429, `lookup ${i + 1}`);
    if (i >= 10) assertEquals(ApiError.parse(await res.json()).error.code, "rate_limited");
  }
  assertEquals(fb.callsTo("world.openfoodfacts.org").length, 10);
  assertEquals(fb.products.size, 10);
  // Cache hits stay free over the cap, and the AI counter is a separate key.
  assertEquals((await handler(post("lookup-barcode", { barcode: "10000003" }))).status, 200);
  const keys = [...fb.aiUsage.keys()];
  assertEquals(keys.length, 1);
  assert(keys[0].endsWith("|3026-11-18"), keys[0]);
  // Blank or junk falls back to 200.
  fb.env.BARCODE_DAILY_LIMIT = " ";
  fb.off.set("20000000", offOk({ status: 1, product: { product_name: "Q" } }));
  assertEquals((await handler(post("lookup-barcode", { barcode: "20000000" }))).status, 200);
});

Deno.test("sherlock lookup-barcode: over the cap with an old cached copy -> the old copy, no OFF call", async () => {
  const { fb, handler } = await setup();
  fb.env.BARCODE_DAILY_LIMIT = "0";
  fb.products.set(CODE, { barcode: CODE, name: "Old Butter", brand: "Amul", pack_size: "100 g", kcal_per_100g: 700, raw: null, fetched_at: "2020-01-01T00:00:00Z" });
  const res = await handler(post("lookup-barcode", { barcode: CODE }));
  assertEquals(res.status, 200);
  assertEquals(LookupBarcodeResponse.parse(await res.json()).product_name, "Old Butter");
  assertEquals(fb.callsTo("world.openfoodfacts.org").length, 0);
});
