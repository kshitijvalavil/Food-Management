// POST /parse-text  { text }  ->  ParseTextResponse
// Turns a voice transcript or typed list into items with Claude Haiku 5.5, then matches
// FoodKeeper and runs the expiry engine.
import { ParseTextRequest, ParseTextResponse } from "../../../shared/schema.ts";
import { TEXT_SYSTEM_PROMPT, textUserText } from "../../../shared/prompts/text.ts";
import { adminClient, requireUser } from "../_shared/auth.ts";
import { extractItems, MODELS } from "../_shared/claude.ts";
import { defaultDeps, type Deps, resolveToday } from "../_shared/deps.ts";
import { enrichItems } from "../_shared/enrich.ts";
import { HttpError } from "../_shared/errors.ts";
import { jsonHandler } from "../_shared/handler.ts";
import { consumeAiCall } from "../_shared/ratelimit.ts";

export function createHandler(deps: Deps) {
  return jsonHandler("parse-text", ParseTextRequest, ParseTextResponse, deps, async ({ req, body }) => {
    const { userId, userClient } = await requireUser(req, deps);
    if (body.text.trim().length === 0) throw new HttpError("bad_request", "Say or type at least one item.");
    if (!deps.env("ANTHROPIC_API_KEY")) throw new HttpError("internal", "AI is not configured on the server.");

    await consumeAiCall(adminClient(deps), userId, deps);

    const today = resolveToday(deps, body.today);
    const { items, dropped } = await extractItems(deps, {
      model: MODELS.text,
      system: TEXT_SYSTEM_PROMPT,
      effort: "low",
      maxTokens: 8_000,
      content: [{ type: "text", text: textUserText({ today, text: body.text }) }],
    });

    return { items: await enrichItems(userClient, items, today), dropped };
  });
}

if (import.meta.main) Deno.serve(createHandler(defaultDeps()));
