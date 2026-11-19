import type { z } from "zod";
import type { ApiError as ApiErrorSchema } from "../../../shared/schema.ts";

export type ErrorCode = z.infer<typeof ApiErrorSchema>["error"]["code"];
export type ApiErrorBody = z.infer<typeof ApiErrorSchema>;

export const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  rate_limited: 429,
  upstream_failed: 502,
  internal: 500,
};

/** Throw this from handlers; the wrapper turns it into an ApiError JSON response. */
export class HttpError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  constructor(code: ErrorCode, message: string, status?: number) {
    super(message);
    this.name = "HttpError";
    this.code = code;
    this.status = status ?? STATUS[code];
  }
}

export function errorBody(code: ErrorCode, message: string): ApiErrorBody {
  return { error: { code, message } };
}

/** Maps anything thrown to a safe ApiError body. Unknown errors never leak details. */
export function toErrorBody(err: unknown): { status: number; body: ApiErrorBody } {
  if (err instanceof HttpError) return { status: err.status, body: errorBody(err.code, err.message) };
  return { status: 500, body: errorBody("internal", "Something went wrong.") };
}
