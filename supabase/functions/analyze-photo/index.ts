// POST /analyze-photo  { storage_path, location_hint }  ->  AnalyzePhotoResponse
// Downloads a scan from the private `scans` bucket, asks Claude Sonnet 5.5 to list the
// food in it, matches each item to FoodKeeper and runs the expiry engine.
import { encodeBase64 } from "@std/encoding/base64";
import { AnalyzePhotoRequest, AnalyzePhotoResponse } from "../../../shared/schema.ts";
import { PHOTO_SYSTEM_PROMPT, photoUserText } from "../../../shared/prompts/photo.ts";
import { adminClient, isHouseholdMember, requireUser } from "../_shared/auth.ts";
import { extractItems, MODELS } from "../_shared/claude.ts";
import { defaultDeps, type Deps, todayUtc } from "../_shared/deps.ts";
import { enrichItems } from "../_shared/enrich.ts";
import { HttpError } from "../_shared/errors.ts";
import { jsonHandler } from "../_shared/handler.ts";
import { consumeAiCall } from "../_shared/ratelimit.ts";

export const LOW_CONFIDENCE = 0.7;
/** Raw bytes; base64 adds a third, keeping the request under Claude's 5 MB image limit. */
export const MAX_IMAGE_BYTES = 3_750_000;

const PATH_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[A-Za-z0-9_-]{1,100}\.(jpe?g|png|webp)$/i;

/** Returns the household id (first path segment) of a well-formed scan path. */
export function parseScanPath(path: string): string {
  const m = PATH_RE.exec(path);
  if (!m) throw new HttpError("bad_request", "storage_path must look like {household_id}/{uuid}.jpg");
  return m[1].toLowerCase();
}

/** Media type from the file's magic bytes; the extension is not trusted. */
export function sniffImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  ) return "image/webp";
  return null;
}

export function createHandler(deps: Deps) {
  return jsonHandler("analyze-photo", AnalyzePhotoRequest, AnalyzePhotoResponse, deps, async ({ req, body }) => {
    const { userId, userClient } = await requireUser(req, deps);
    const householdId = parseScanPath(body.storage_path);
    const admin = adminClient(deps);

    if (!(await isHouseholdMember(admin, userId, householdId))) {
      // Same answer as a missing file, so paths of other households cannot be probed.
      throw new HttpError("not_found", "Photo not found.");
    }
    if (!deps.env("ANTHROPIC_API_KEY")) throw new HttpError("internal", "AI is not configured on the server.");

    const { data: blob, error } = await admin.storage.from("scans").download(body.storage_path);
    if (error || !blob) throw new HttpError("not_found", "Photo not found.");
    if (blob.size > MAX_IMAGE_BYTES) {
      throw new HttpError("bad_request", "Photo is too large. Send a JPEG under 3.5 MB (about 1600 px is plenty).");
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const mediaType = sniffImageType(bytes);
    if (!mediaType) throw new HttpError("bad_request", "That file is not a JPEG, PNG or WebP image.");

    await consumeAiCall(admin, userId, deps);

    const today = todayUtc(deps);
    const { items } = await extractItems(deps, {
      model: MODELS.vision,
      system: PHOTO_SYSTEM_PROMPT,
      effort: "medium",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: encodeBase64(bytes) } },
        { type: "text", text: photoUserText({ today, locationHint: body.location_hint }) },
      ],
    });

    const enriched = await enrichItems(userClient, items, today);
    return { items: enriched, flagged: enriched.filter((i) => i.confidence < LOW_CONFIDENCE).length };
  });
}

if (import.meta.main) Deno.serve(createHandler(defaultDeps()));
