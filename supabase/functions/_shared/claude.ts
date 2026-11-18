// Claude Messages API client for item extraction (raw fetch, no SDK, so tests can mock it).
import { z } from "zod";
import { DetectedItem, Location, Unit } from "../../../shared/schema.ts";
import { parseIsoDate } from "../../../shared/expiry.ts";
import { RECORD_ITEMS_TOOL_DESCRIPTION, RECORD_ITEMS_TOOL_NAME } from "../../../shared/prompts/common.ts";
import type { Deps } from "./deps.ts";
import { HttpError } from "./errors.ts";

export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

export const MODELS = {
  /** Photos (vision). */
  vision: "claude-sonnet-5-5",
  /** Voice transcripts and typed lists. */
  text: "claude-haiku-5-5",
} as const;
export type ClaudeModel = (typeof MODELS)[keyof typeof MODELS];

/** Server-side refusal fallback (beta) is available for Sonnet 5.5, not for Haiku 5.5. */
const SERVER_FALLBACK_BETA = "server-side-fallback-2026-07-01";
const USES_SERVER_FALLBACK: ReadonlySet<string> = new Set([MODELS.vision]);

const REQUEST_TIMEOUT_MS = 55_000;
const MAX_ATTEMPTS = 2; // first try + one retry

/** What the model returns per item: a DetectedItem plus its own shelf-life guess. */
export const ClaudeItem = DetectedItem.extend({
  estimated_days_left: z.number().int().min(0).max(3650).nullable().default(null),
});
export type ClaudeItem = z.infer<typeof ClaudeItem>;

export const RecordItemsInput = z.object({ items: z.array(ClaudeItem).max(60) });

const nullableString = (description: string) => ({ type: ["string", "null"], description });

/** JSON Schema of the tool input. Mirrors DetectedItem[] (+ estimated_days_left). */
export const RECORD_ITEMS_TOOL = {
  name: RECORD_ITEMS_TOOL_NAME,
  description: RECORD_ITEMS_TOOL_DESCRIPTION,
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        description: "Every food item found, at most 60.",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "name",
            "quantity",
            "unit",
            "location",
            "printed_date",
            "confidence",
            "category_hint",
            "barcode",
            "estimated_days_left",
          ],
          properties: {
            name: { type: "string", description: "Short food name, 1-80 characters." },
            quantity: { type: "number", description: "Greater than 0, at most 1000." },
            unit: { type: "string", enum: [...Unit.options] },
            location: { type: "string", enum: [...Location.options] },
            printed_date: nullableString("Expiry date read off the pack, yyyy-mm-dd, else null."),
            confidence: { type: "number", description: "0 to 1. Below 0.7 = user must check." },
            category_hint: nullableString("Generic food category, at most 80 characters, else null."),
            barcode: nullableString("8-14 digit barcode if clearly readable, else null."),
            estimated_days_left: {
              type: ["integer", "null"],
              description: "Whole days until it should be used, stored at that location, from today.",
            },
          },
        },
      },
    },
  },
} as const;

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export interface ExtractOptions {
  model: ClaudeModel;
  system: string;
  content: ContentBlock[];
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}

export interface ExtractResult {
  items: ClaudeItem[];
  model: string;
  attempts: number;
}

function clip(s: unknown, max: number): unknown {
  if (typeof s !== "string") return s;
  const t = s.replace(/\s+/g, " ").trim();
  return t.slice(0, max);
}

/** Light clean-up of model output before strict zod validation. Never invents values. */
export function normalizeToolInput(input: unknown): unknown {
  if (!input || typeof input !== "object" || !Array.isArray((input as { items?: unknown }).items)) return input;
  const items = (input as { items: unknown[] }).items.map((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const it = { ...(raw as Record<string, unknown>) };
    it.name = clip(it.name, 80);
    if (typeof it.unit === "string") it.unit = it.unit.trim().toLowerCase();
    if (typeof it.location === "string") it.location = it.location.trim().toLowerCase();
    const hint = clip(it.category_hint, 80);
    it.category_hint = typeof hint === "string" && hint.length > 0 ? hint : null;
    if (it.printed_date !== null && parseIsoDate(typeof it.printed_date === "string" ? it.printed_date : null) === null) {
      it.printed_date = null;
    }
    if (typeof it.barcode === "string") {
      const digits = it.barcode.replace(/[\s-]/g, "");
      it.barcode = /^\d{8,14}$/.test(digits) ? digits : null;
    } else if (it.barcode !== null) {
      it.barcode = null;
    }
    const est = it.estimated_days_left;
    it.estimated_days_left = typeof est === "number" && Number.isFinite(est) && est >= 0 && est <= 3650
      ? Math.round(est)
      : null;
    return it;
  });
  return { ...(input as object), items };
}

class Retryable extends Error {}

interface MessagesResponse {
  model?: string;
  stop_reason?: string;
  content?: Array<{ type: string; name?: string; input?: unknown }>;
}

async function callOnce(deps: Deps, apiKey: string, body: unknown, model: string): Promise<{ items: ClaudeItem[]; model: string }> {
  const headers: Record<string, string> = {
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    "content-type": "application/json",
  };
  if (USES_SERVER_FALLBACK.has(model)) headers["anthropic-beta"] = SERVER_FALLBACK_BETA;

  let res: Response;
  try {
    res = await deps.fetch(ANTHROPIC_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Retryable(`network: ${err instanceof Error ? err.message : String(err)}`);
  }

  const requestId = res.headers.get("request-id") ?? "-";
  if (!res.ok) {
    await res.body?.cancel();
    const msg = `anthropic HTTP ${res.status} (request-id ${requestId})`;
    if (res.status === 429 || res.status === 408 || res.status === 409 || res.status >= 500) throw new Retryable(msg);
    console.error(msg);
    throw new HttpError("upstream_failed", "The AI service rejected the request.");
  }

  let json: MessagesResponse;
  try {
    json = await res.json();
  } catch {
    throw new Retryable("anthropic returned non-JSON");
  }

  if (json.stop_reason === "refusal") {
    throw new HttpError("upstream_failed", "The AI declined to read this. Try another photo or add items by hand.");
  }
  const block = json.content?.find((b) => b.type === "tool_use" && b.name === RECORD_ITEMS_TOOL_NAME);
  if (!block) throw new Retryable(`no ${RECORD_ITEMS_TOOL_NAME} call (stop_reason ${json.stop_reason})`);
  const parsed = RecordItemsInput.safeParse(normalizeToolInput(block.input));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Retryable(`tool input failed schema at ${first?.path.join(".")}: ${first?.message}`);
  }
  return { items: parsed.data.items, model: json.model ?? model };
}

/**
 * Asks Claude to list food items with the record_items tool, validates them with zod,
 * retries once on invalid output or a transient error, then fails with upstream_failed.
 *
 * tool_choice is "auto", not a forced {type:"tool"}: Sonnet 5.5 rejects forced tool
 * choice with a 400. `strict: true` on the tool plus the system prompt keep the call
 * reliable, and a missing call is treated as invalid output (retried once).
 */
export async function extractItems(deps: Deps, opts: ExtractOptions): Promise<ExtractResult> {
  const apiKey = deps.env("ANTHROPIC_API_KEY");
  if (!apiKey) throw new HttpError("internal", "AI is not configured on the server.");

  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 16_000,
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
    tools: [RECORD_ITEMS_TOOL],
    tool_choice: { type: "auto" },
    output_config: { effort: opts.effort ?? "medium" },
  };
  if (USES_SERVER_FALLBACK.has(opts.model)) body.fallbacks = "default";

  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const r = await callOnce(deps, apiKey, body, opts.model);
      return { ...r, attempts: attempt };
    } catch (err) {
      if (!(err instanceof Retryable)) throw err;
      lastError = err.message;
      console.warn(`[claude] attempt ${attempt} failed: ${lastError}`);
    }
  }
  throw new HttpError("upstream_failed", "The AI could not read this. Please try again or add items by hand.");
}
