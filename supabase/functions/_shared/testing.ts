// Test helpers: an in-memory fake of Supabase (auth, PostgREST, storage), Anthropic and
// Open Food Facts behind one fetch function. Any other URL throws, so tests never touch
// the network. Used only by *.test.ts files.
import type { Deps } from "./deps.ts";

export const SB_URL = "http://supabase.test";
export const HOUSEHOLD = "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
export const OTHER_HOUSEHOLD = "0e0e0e0e-1111-4222-8333-444444444444";
export const USER = "11111111-2222-4333-8444-555555555555";
export const JWT = "user-jwt-123";
export const SCAN_PATH = `${HOUSEHOLD}/3b9a7c1e-2d4f-4a6b-8c0d-1e2f3a4b5c6d.jpg`;
/** Smallest byte prefix that sniffs as JPEG; enough for the function under test. */
export const FAKE_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

export async function fixture<T = unknown>(name: string): Promise<T> {
  return JSON.parse(await Deno.readTextFile(new URL(`../_fixtures/${name}`, import.meta.url))) as T;
}

export interface RecordedCall {
  method: string;
  url: URL;
  headers: Headers;
  body: string | null;
}

interface ShelfRow {
  id: number;
  name: string;
  keywords?: string[] | null;
  [k: string]: unknown;
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function eqParam(url: URL, col: string): string | null {
  const v = url.searchParams.get(col);
  return v && v.startsWith("eq.") ? decodeURIComponent(v.slice(3)) : null;
}

export class FakeBackend {
  calls: RecordedCall[] = [];
  users = new Map<string, string>([[JWT, USER]]);
  members: Array<{ household_id: string; user_id: string }> = [{ household_id: HOUSEHOLD, user_id: USER }];
  scans = new Map<string, Uint8Array>([[SCAN_PATH, FAKE_JPEG]]);
  shelfLife: ShelfRow[] = [];
  products = new Map<string, Record<string, unknown>>();
  aiUsage = new Map<string, number>(); // key `${user}|${day}`
  /** Responses for api.anthropic.com, consumed in order. */
  anthropic: Array<Response | (() => Response) | Error> = [];
  /** Open Food Facts responses by barcode. */
  off = new Map<string, Response | (() => Response) | Error>();
  rpcError: string | null = null;
  env: Record<string, string> = {
    SUPABASE_URL: SB_URL,
    SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    ANTHROPIC_API_KEY: "test-anthropic-key",
  };
  now = new Date("2026-11-18T09:30:00Z");

  deps(): Deps {
    return {
      fetch: (input, init) => this.fetch(input, init),
      env: (k) => this.env[k],
      now: () => this.now,
    };
  }

  callsTo(host: string, pathPrefix = "/"): RecordedCall[] {
    return this.calls.filter((c) => c.url.host === host && c.url.pathname.startsWith(pathPrefix));
  }

  anthropicCalls(): Array<RecordedCall & { json: Record<string, unknown> }> {
    return this.callsTo("api.anthropic.com").map((c) => ({ ...c, json: JSON.parse(c.body ?? "{}") }));
  }

  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const req = input instanceof Request ? input : new Request(input, init);
    const url = new URL(req.url);
    const method = (init?.method ?? req.method).toUpperCase();
    const headers = new Headers(init?.headers ?? req.headers);
    let body: string | null = null;
    if (init?.body !== undefined && init?.body !== null) body = typeof init.body === "string" ? init.body : await new Response(init.body).text();
    else if (method !== "GET" && method !== "HEAD") body = await req.text();
    this.calls.push({ method, url, headers, body });

    if (url.host === "api.anthropic.com") return this.take(this.anthropic.shift(), "anthropic queue is empty");
    if (url.host === "world.openfoodfacts.org") {
      const code = /\/api\/v2\/product\/(\d+)\.json$/.exec(url.pathname)?.[1] ?? "";
      return this.take(this.off.get(code), `no OFF fixture for ${code}`);
    }
    if (url.origin !== SB_URL) throw new Error(`unexpected fetch ${method} ${url}`);

    const path = url.pathname;
    if (path === "/auth/v1/user") {
      const token = headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
      const id = this.users.get(token);
      if (!id) return jsonResponse({ code: 401, error_code: "bad_jwt", msg: "invalid JWT" }, 401);
      return jsonResponse({ id, aud: "authenticated", role: "authenticated", email: "demo@example.test" });
    }
    if (path.startsWith("/storage/v1/object/scans/")) {
      const key = decodeURIComponent(path.slice("/storage/v1/object/scans/".length));
      const bytes = this.scans.get(key);
      if (!bytes) return jsonResponse({ statusCode: "404", error: "not_found", message: "Object not found" }, 400);
      return new Response(new Blob([bytes.slice()]), { headers: { "content-type": "image/jpeg" } });
    }
    if (path === "/rest/v1/household_members" && method === "GET") {
      const hh = eqParam(url, "household_id");
      const uid = eqParam(url, "user_id");
      return jsonResponse(this.members.filter((m) => m.household_id === hh && m.user_id === uid).map((m) => ({ household_id: m.household_id })));
    }
    if (path === "/rest/v1/ai_usage") {
      if (method === "GET") {
        const n = this.aiUsage.get(`${eqParam(url, "user_id")}|${eqParam(url, "day")}`);
        return jsonResponse(n === undefined ? [] : [{ calls: n }]);
      }
      const rows = [JSON.parse(body ?? "{}")].flat() as Array<{ user_id: string; day: string; calls: number }>;
      for (const r of rows) this.aiUsage.set(`${r.user_id}|${r.day}`, r.calls);
      return new Response(null, { status: 201 });
    }
    if (path === "/rest/v1/products") {
      if (method === "GET") {
        const row = this.products.get(eqParam(url, "barcode") ?? "");
        return jsonResponse(row ? [row] : []);
      }
      const rows = [JSON.parse(body ?? "{}")].flat() as Array<Record<string, unknown>>;
      for (const r of rows) this.products.set(String(r.barcode), r);
      return new Response(null, { status: 201 });
    }
    if (path === "/rest/v1/rpc/search_food") {
      if (this.rpcError) return jsonResponse({ code: "XX000", message: this.rpcError }, 500);
      const q = String(JSON.parse(body ?? "{}").q ?? "").toLowerCase();
      const scored = this.shelfLife
        .map((r) => {
          const terms = [r.name, ...(r.keywords ?? [])].map((t) => t.toLowerCase());
          const best = Math.max(0, ...terms.filter((t) => q.includes(t) || t.includes(q)).map((t) => t.length));
          return { r, best };
        })
        .filter((x) => x.best > 0)
        .sort((a, b) => b.best - a.best);
      return jsonResponse(scored.slice(0, 10).map((x) => x.r));
    }
    throw new Error(`unexpected Supabase call ${method} ${url}`);
  }

  private take(r: Response | (() => Response) | Error | undefined, missing: string): Response {
    if (r === undefined) throw new Error(missing);
    if (r instanceof Error) throw r;
    return typeof r === "function" ? r() : r;
  }
}

export function anthropicOk(body: unknown): Response {
  return jsonResponse(body, 200, { "request-id": "req_test" });
}

export function anthropicStatus(status: number): Response {
  return jsonResponse({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, status);
}

export function offOk(body: unknown): Response {
  return jsonResponse(body);
}

export function offNotFound(body: unknown): Response {
  return jsonResponse(body, 404);
}

export function post(fnName: string, body: unknown, opts: { jwt?: string | null } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const jwt = opts.jwt === undefined ? JWT : opts.jwt;
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  return new Request(`${SB_URL}/functions/v1/${fnName}`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
