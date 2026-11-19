// Sherlock Bugs: helpers for the adversarial sherlock.test.ts files. Test-only.
import { anthropicOk } from "./testing.ts";

export const SECRETS = ["test-anthropic-key", "service-role-key", "anon-key"];

/** A Claude Messages response whose only content is one record_items call. */
export function claudeTool(input: unknown, model = "claude-sonnet-5-5"): Response {
  return anthropicOk({
    id: "msg_sherlock",
    type: "message",
    role: "assistant",
    model,
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id: "toolu_sherlock", name: "record_items", input }],
  });
}

export function item(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Toned milk",
    quantity: 1,
    unit: "pack",
    location: "fridge",
    printed_date: null,
    confidence: 0.9,
    category_hint: "milk",
    barcode: null,
    estimated_days_left: 4,
    ...over,
  };
}

/** Runs fn with console.log/info/warn/error/debug captured; returns everything printed. */
export async function captureLogs<T>(fn: () => Promise<T>): Promise<{ result: T; logs: string }> {
  const names = ["log", "info", "warn", "error", "debug"] as const;
  const saved = names.map((n) => console[n]);
  const out: string[] = [];
  for (const n of names) {
    console[n] = (...args: unknown[]) => {
      out.push(args.map((a) => (typeof a === "string" ? a : (() => {
        try {
          return JSON.stringify(a) ?? String(a);
        } catch {
          return String(a);
        }
      })())).join(" "));
    };
  }
  try {
    const result = await fn();
    return { result, logs: out.join("\n") };
  } finally {
    names.forEach((n, i) => (console[n] = saved[i]));
  }
}

/** Fails if a response body or log text carries a secret or a stack trace. */
export function assertNoLeak(text: string, where: string): void {
  for (const s of SECRETS) {
    if (text.includes(s)) throw new Error(`${where} leaks secret ${s}: ${text.slice(0, 300)}`);
  }
  if (/\n\s+at\s|\.ts:\d+:\d+/.test(text)) throw new Error(`${where} leaks a stack trace: ${text.slice(0, 300)}`);
}

export function bearer(token: string | null, scheme = "Bearer"): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (token !== null) h.Authorization = `${scheme} ${token}`.trimEnd();
  return h;
}

export function rawPost(fnName: string, body: string, headers: Record<string, string>, method = "POST"): Request {
  return new Request(`http://supabase.test/functions/v1/${fnName}`, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : body,
  });
}
