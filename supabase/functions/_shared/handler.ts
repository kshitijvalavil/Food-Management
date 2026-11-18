import type { z } from "zod";
import { json, preflight } from "./cors.ts";
import type { Deps } from "./deps.ts";
import { errorBody, HttpError, toErrorBody } from "./errors.ts";

const MAX_BODY_BYTES = 64 * 1024;

export interface HandlerContext<T> {
  req: Request;
  body: T;
  deps: Deps;
}

/**
 * Wraps a JSON POST handler: CORS preflight, method check, body size limit, zod input
 * validation, zod output validation and ApiError-shaped failures.
 */
export function jsonHandler<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
  name: string,
  input: I,
  output: O,
  deps: Deps,
  fn: (ctx: HandlerContext<z.infer<I>>) => Promise<z.infer<O>>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const origin = deps.env("ALLOWED_ORIGIN");
    if (req.method === "OPTIONS") return preflight(origin);
    if (req.method !== "POST") {
      return json(errorBody("bad_request", "Use POST."), 405, origin);
    }
    try {
      const raw = await req.text();
      if (raw.length > MAX_BODY_BYTES) throw new HttpError("bad_request", "Request body is too large.", 413);
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw);
      } catch {
        throw new HttpError("bad_request", "Body must be JSON.");
      }
      const parsed = input.safeParse(parsedJson);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
        throw new HttpError("bad_request", `Invalid request. ${where}${issue?.message ?? ""}`.trim());
      }
      const result = await fn({ req, body: parsed.data, deps });
      const checked = output.safeParse(result);
      if (!checked.success) {
        console.error(`[${name}] response failed schema`, checked.error.issues.slice(0, 3));
        throw new Error("response schema mismatch");
      }
      return json(checked.data, 200, origin);
    } catch (err) {
      const { status, body } = toErrorBody(err);
      if (!(err instanceof HttpError) || status >= 500) {
        console.error(`[${name}] ${body.error.code}:`, err instanceof Error ? err.message : String(err));
      }
      return json(body, status, origin);
    }
  };
}
