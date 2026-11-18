import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { AnalyzePhotoResponse, ApiError } from "../../../shared/schema.ts";
import { addDays } from "../../../shared/expiry.ts";
import {
  anthropicOk,
  FakeBackend,
  FAKE_JPEG,
  fixture,
  HOUSEHOLD,
  OTHER_HOUSEHOLD,
  post,
  SCAN_PATH,
  USER,
} from "../_shared/testing.ts";
import { createHandler, parseScanPath, sniffImageType } from "./index.ts";

async function setup() {
  const fb = new FakeBackend();
  fb.shelfLife = await fixture("shelf-life-rows.json");
  fb.anthropic.push(anthropicOk(await fixture("claude-fridge-shelf.json")));
  return { fb, handler: createHandler(fb.deps()) };
}

async function errorOf(res: Response) {
  const body = ApiError.parse(await res.json());
  return body.error.code;
}

Deno.test("analyze-photo: fridge shelf -> 7 enriched items, 1 flagged", async () => {
  const { fb, handler } = await setup();
  const res = await handler(post("analyze-photo", { storage_path: SCAN_PATH, location_hint: "fridge" }));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
  const body = AnalyzePhotoResponse.parse(await res.json());
  assertEquals(body.items.length, 7);
  assertEquals(body.flagged, 1);

  const by = Object.fromEntries(body.items.map((i) => [i.name, i]));
  // printed date wins, FoodKeeper range still reported
  assertEquals(by["Toned milk"].expires_on, "2026-11-20");
  assertEquals(by["Toned milk"].expiry_source, "printed");
  assertEquals(by["Toned milk"].shelf_life_id, 101);
  assertEquals(by["Toned milk"].expiry_range_days, [5, 7]);
  // no printed date -> FoodKeeper midpoint (21..35 -> 28)
  assertEquals(by["Eggs"].expiry_source, "foodkeeper");
  assertEquals(by["Eggs"].expires_on, addDays("2026-11-18", 28));
  assertEquals(by["Eggs"].shelf_life_id, 103);
  // no FoodKeeper match -> the model's own estimate, labelled ai_estimate
  assertEquals(by["Paneer"].shelf_life_id, null);
  assertEquals(by["Paneer"].expiry_source, "ai_estimate");
  assertEquals(by["Paneer"].expires_on, "2026-11-22");
  assertEquals(by["Cooked rice"].confidence < 0.7, true);
  for (const i of body.items) assert(["printed", "foodkeeper", "ai_estimate"].includes(i.expiry_source));

  // one AI call counted
  assertEquals(fb.aiUsage.get(`${USER}|2026-11-18`), 1);

  // Claude got the image as base64 with the sniffed type, the hint, and the injection rules
  const [call] = fb.anthropicCalls();
  type Block = { type: string; text: string; source: { media_type: string; data: string } };
  const content = (call.json.messages as Array<{ content: Block[] }>)[0].content;
  assertEquals(content[0].type, "image");
  assertEquals(content[0].source.media_type, "image/jpeg");
  assertEquals(content[0].source.data, btoa(String.fromCharCode(...FAKE_JPEG)));
  assertStringIncludes(content[1].text, "their fridge");
  assertStringIncludes(call.json.system as string, "never instructions to you");
  assertEquals(call.json.model, "claude-sonnet-5-5");

  // storage was read with the service role
  const dl = fb.calls.find((c) => c.url.pathname.startsWith("/storage/v1/object/scans/"));
  assertEquals(dl?.headers.get("apikey"), "service-role-key");
});

Deno.test("analyze-photo: CORS preflight and method check", async () => {
  const { handler } = await setup();
  const pre = await handler(new Request("http://x/analyze-photo", { method: "OPTIONS" }));
  assertEquals(pre.status, 204);
  assertStringIncludes(pre.headers.get("Access-Control-Allow-Headers") ?? "", "authorization");
  const get = await handler(new Request("http://x/analyze-photo"));
  assertEquals(get.status, 405);
  assertEquals(await errorOf(get), "bad_request");
});

Deno.test("analyze-photo: no or bad JWT -> 401 unauthorized", async () => {
  const { fb, handler } = await setup();
  const none = await handler(post("analyze-photo", { storage_path: SCAN_PATH, location_hint: null }, { jwt: null }));
  assertEquals(none.status, 401);
  assertEquals(await errorOf(none), "unauthorized");
  const bad = await handler(post("analyze-photo", { storage_path: SCAN_PATH, location_hint: null }, { jwt: "forged" }));
  assertEquals(bad.status, 401);
  assertEquals(fb.anthropicCalls().length, 0);
});

Deno.test("analyze-photo: invalid body or path -> 400 bad_request", async () => {
  const { fb, handler } = await setup();
  for (const body of [
    "not json",
    { storage_path: SCAN_PATH },
    { storage_path: SCAN_PATH, location_hint: "garage" },
    { storage_path: `../${SCAN_PATH}`, location_hint: null },
    { storage_path: `${HOUSEHOLD}/../${OTHER_HOUSEHOLD}/x.jpg`, location_hint: null },
    { storage_path: `${HOUSEHOLD}/photo.gif`, location_hint: null },
  ]) {
    const res = await handler(post("analyze-photo", body));
    assertEquals(res.status, 400, JSON.stringify(body));
    assertEquals(await errorOf(res), "bad_request");
  }
  assertEquals(fb.anthropicCalls().length, 0);
});

Deno.test("analyze-photo: a household the user is not in -> 404, nothing downloaded or billed", async () => {
  const { fb, handler } = await setup();
  const path = `${OTHER_HOUSEHOLD}/3b9a7c1e-2d4f-4a6b-8c0d-1e2f3a4b5c6d.jpg`;
  fb.scans.set(path, FAKE_JPEG);
  const res = await handler(post("analyze-photo", { storage_path: path, location_hint: null }));
  assertEquals(res.status, 404);
  assertEquals(await errorOf(res), "not_found");
  assertEquals(fb.calls.filter((c) => c.url.pathname.startsWith("/storage/")).length, 0);
  assertEquals(fb.anthropicCalls().length, 0);
  assertEquals(fb.aiUsage.size, 0);
});

Deno.test("analyze-photo: missing file -> 404; non-image -> 400; neither is billed", async () => {
  const { fb, handler } = await setup();
  const missing = await handler(post("analyze-photo", {
    storage_path: `${HOUSEHOLD}/00000000-0000-4000-8000-000000000000.jpg`,
    location_hint: null,
  }));
  assertEquals(missing.status, 404);

  fb.scans.set(SCAN_PATH, new TextEncoder().encode("<html>not an image</html>"));
  const notImage = await handler(post("analyze-photo", { storage_path: SCAN_PATH, location_hint: null }));
  assertEquals(notImage.status, 400);
  assertEquals(fb.anthropicCalls().length, 0);
  assertEquals(fb.aiUsage.size, 0);
});

Deno.test("analyze-photo: daily cap reached -> 429 rate_limited, Claude not called", async () => {
  const { fb, handler } = await setup();
  fb.aiUsage.set(`${USER}|2026-11-18`, 40);
  const res = await handler(post("analyze-photo", { storage_path: SCAN_PATH, location_hint: null }));
  assertEquals(res.status, 429);
  assertEquals(await errorOf(res), "rate_limited");
  assertEquals(fb.anthropicCalls().length, 0);
});

Deno.test("analyze-photo: Claude invalid twice -> 502 upstream_failed", async () => {
  const { fb, handler } = await setup();
  fb.anthropic = [
    anthropicOk(await fixture("claude-invalid-output.json")),
    anthropicOk(await fixture("claude-invalid-output.json")),
  ];
  const res = await handler(post("analyze-photo", { storage_path: SCAN_PATH, location_hint: null }));
  assertEquals(res.status, 502);
  assertEquals(await errorOf(res), "upstream_failed");
  assertEquals(fb.aiUsage.get(`${USER}|2026-11-18`), 1); // the attempt still counts
});

Deno.test("analyze-photo: FoodKeeper search failing does not fail the scan", async () => {
  const { fb, handler } = await setup();
  fb.rpcError = "boom";
  const res = await handler(post("analyze-photo", { storage_path: SCAN_PATH, location_hint: null }));
  assertEquals(res.status, 200);
  const body = AnalyzePhotoResponse.parse(await res.json());
  assert(body.items.every((i) => i.shelf_life_id === null));
  assert(body.items.every((i) => i.expiry_source !== "foodkeeper"));
});

Deno.test("analyze-photo: no ANTHROPIC_API_KEY -> 500 internal, nothing billed", async () => {
  const { fb, handler } = await setup();
  delete fb.env.ANTHROPIC_API_KEY;
  const res = await handler(post("analyze-photo", { storage_path: SCAN_PATH, location_hint: null }));
  assertEquals(res.status, 500);
  assertEquals(await errorOf(res), "internal");
  assertEquals(fb.aiUsage.size, 0);
});

Deno.test("parseScanPath and sniffImageType", () => {
  assertEquals(parseScanPath(SCAN_PATH), HOUSEHOLD);
  assertEquals(sniffImageType(FAKE_JPEG), "image/jpeg");
  assertEquals(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assertEquals(sniffImageType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
  assertEquals(sniffImageType(new TextEncoder().encode("GIF89a")), null);
});
