import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { ApiError, LookupBarcodeResponse } from "../../../shared/schema.ts";
import { addDays } from "../../../shared/expiry.ts";
import { FakeBackend, fixture, offNotFound, offOk, post } from "../_shared/testing.ts";
import {
  categoryHintFromTags,
  createHandler,
  kcalPer100g,
  locationFromCategories,
  OFF_USER_AGENT,
  packAmount,
} from "./index.ts";

const AMUL = "8901262010023";
const UNKNOWN = "8900000000017";

async function setup() {
  const fb = new FakeBackend();
  fb.shelfLife = await fixture("shelf-life-rows.json");
  const amul = await fixture("off-amul-butter-8901262010023.json");
  fb.off.set(AMUL, () => offOk(amul));
  const missing = await fixture("off-not-found.json");
  fb.off.set(UNKNOWN, () => offNotFound(missing));
  return { fb, handler: createHandler(fb.deps()) };
}

const offCalls = (fb: FakeBackend) => fb.callsTo("world.openfoodfacts.org");

Deno.test("lookup-barcode: cache miss -> Open Food Facts, mapped and cached", async () => {
  const { fb, handler } = await setup();
  const res = await handler(post("lookup-barcode", { barcode: AMUL }));
  assertEquals(res.status, 200);
  const body = LookupBarcodeResponse.parse(await res.json());
  assertEquals(body.found, true);
  assertEquals(body.product_name, "Amul Butter");
  assertEquals(body.brand, "Amul");
  assertEquals(body.pack_size, "100 g");
  const item = body.item!;
  assertEquals(item.barcode, AMUL);
  assertEquals(item.location, "fridge");
  assertEquals(item.quantity, 1);
  assertEquals(item.unit, "pack");
  assertEquals(item.kcal_per_100g, 722);
  assertEquals(item.kcal_per_unit, 722);
  assertEquals(item.category_hint, "salted butters");
  assertEquals(item.shelf_life_id, 102);
  assertEquals(item.expiry_source, "foodkeeper");
  assertEquals(item.expires_on, addDays("2026-11-18", 60)); // fridge 30..90
  assertEquals(item.printed_date, null);

  const [call] = offCalls(fb);
  assertEquals(call.url.pathname, `/api/v2/product/${AMUL}.json`);
  assertEquals(call.url.searchParams.get("fields"), "product_name,brands,quantity,nutriments,categories_tags");
  assertEquals(call.headers.get("User-Agent"), OFF_USER_AGENT);

  const cached = fb.products.get(AMUL)!;
  assertEquals(cached.name, "Amul Butter");
  assertEquals(cached.kcal_per_100g, 722);
  assertEquals(cached.fetched_at, "2026-11-18T09:30:00.000Z");
  const write = fb.calls.find((c) => c.method === "POST" && c.url.pathname === "/rest/v1/products");
  assertEquals(write?.headers.get("apikey"), "service-role-key");
});

Deno.test("lookup-barcode: fresh cache hit does not call Open Food Facts", async () => {
  const { fb, handler } = await setup();
  await handler(post("lookup-barcode", { barcode: AMUL }));
  fb.now = new Date("2026-12-01T00:00:00Z"); // 13 days later
  const res = await handler(post("lookup-barcode", { barcode: AMUL }));
  const body = LookupBarcodeResponse.parse(await res.json());
  assertEquals(body.item?.location, "fridge");
  assertEquals(body.item?.kcal_per_unit, 722);
  assertEquals(offCalls(fb).length, 1);
});

Deno.test("lookup-barcode: stale cache is refreshed, and served if OFF is down", async () => {
  const { fb, handler } = await setup();
  await handler(post("lookup-barcode", { barcode: AMUL }));
  fb.now = new Date("2027-01-30T00:00:00Z"); // > 30 days
  await handler(post("lookup-barcode", { barcode: AMUL }));
  assertEquals(offCalls(fb).length, 2);
  assertEquals(fb.products.get(AMUL)?.fetched_at, "2027-01-30T00:00:00.000Z");

  fb.now = new Date("2027-04-30T00:00:00Z");
  fb.off.set(AMUL, new TypeError("network down"));
  const res = await handler(post("lookup-barcode", { barcode: AMUL }));
  assertEquals(res.status, 200);
  assertEquals(LookupBarcodeResponse.parse(await res.json()).product_name, "Amul Butter");
});

Deno.test("lookup-barcode: a cached row with null name/raw still gives a valid item", async () => {
  const { fb, handler } = await setup();
  fb.products.set("4006381333931", {
    barcode: "4006381333931", name: null, brand: "Acme", pack_size: "1 kg", kcal_per_100g: 350,
    raw: null, fetched_at: "2026-11-17T00:00:00Z",
  });
  const res = await handler(post("lookup-barcode", { barcode: "4006381333931" }));
  assertEquals(res.status, 200);
  const body = LookupBarcodeResponse.parse(await res.json());
  assertEquals(body.product_name, "Acme");
  assertEquals(body.item?.location, "pantry");
  assertEquals(body.item?.kcal_per_unit, 3500);
  assertEquals(offCalls(fb).length, 0);
});

Deno.test("lookup-barcode: unknown product -> found:false, nothing cached", async () => {
  const { fb, handler } = await setup();
  const res = await handler(post("lookup-barcode", { barcode: UNKNOWN }));
  assertEquals(res.status, 200);
  assertEquals(LookupBarcodeResponse.parse(await res.json()), {
    found: false,
    item: null,
    product_name: null,
    brand: null,
    pack_size: null,
  });
  assertEquals(fb.products.size, 0);
});

Deno.test("lookup-barcode: status 0 with HTTP 200 is also not found", async () => {
  const { fb, handler } = await setup();
  const missing = await fixture("off-not-found.json");
  fb.off.set(UNKNOWN, () => offOk(missing));
  const body = LookupBarcodeResponse.parse(await (await handler(post("lookup-barcode", { barcode: UNKNOWN }))).json());
  assertEquals(body.found, false);
});

Deno.test("lookup-barcode: OFF down with no cache -> 502; bad barcode -> 400; no auth -> 401", async () => {
  const { fb, handler } = await setup();
  fb.off.set(AMUL, () => new Response("busy", { status: 503 }));
  const down = await handler(post("lookup-barcode", { barcode: AMUL }));
  assertEquals(down.status, 502);
  assertEquals(ApiError.parse(await down.json()).error.code, "upstream_failed");

  for (const barcode of ["123", "89012620100231234", "8901262O10023", "../../x"]) {
    const res = await handler(post("lookup-barcode", { barcode }));
    assertEquals(res.status, 400, barcode);
    assertStringIncludes(ApiError.parse(await res.json()).error.message, "barcode");
  }
  assertEquals((await handler(post("lookup-barcode", { barcode: AMUL }, { jwt: null }))).status, 401);
});

Deno.test("locationFromCategories", () => {
  assertEquals(locationFromCategories(["en:frozen-foods", "en:frozen-vegetables", "en:peas"]), "freezer");
  assertEquals(locationFromCategories(["en:dairies", "en:ice-creams"]), "freezer");
  assertEquals(locationFromCategories(["en:dairies", "en:butters"]), "fridge");
  assertEquals(locationFromCategories(["en:meats", "en:sausages"]), "fridge");
  assertEquals(locationFromCategories(["en:spreads", "en:peanut-butters"]), "pantry");
  assertEquals(locationFromCategories(["en:snacks", "en:biscuits"]), "pantry");
  assertEquals(locationFromCategories(undefined), "pantry");
});

Deno.test("pack size, kcal and category helpers", () => {
  assertEquals(packAmount("100 g"), 100);
  assertEquals(packAmount("1 kg"), 1000);
  assertEquals(packAmount("1,5 L"), 1500);
  assertEquals(packAmount("500ml"), 500);
  assertEquals(packAmount("6 x 30 g"), 30); // first amount only; per-piece packs are rare
  assertEquals(packAmount("pack of 6"), null);
  assertEquals(packAmount(null), null);
  assertEquals(kcalPer100g({ "energy-kcal_100g": 722 }), 722);
  assertEquals(kcalPer100g({ "energy-kcal_100g": "51.5" }), 51.5);
  assertEquals(kcalPer100g({ "energy-kj_100g": 3021 }), null);
  assertEquals(kcalPer100g(undefined), null);
  assertEquals(categoryHintFromTags(["en:dairies", "en:butters", "fr:beurres-doux"]), "butters");
  assert(categoryHintFromTags([]) === null);
});
