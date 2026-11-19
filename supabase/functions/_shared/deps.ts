import { daysLeft, isoDateInTimeZone } from "../../../shared/expiry.ts";

/** Everything a handler touches outside its own code, so tests can swap it out. */
export interface Deps {
  fetch: typeof fetch;
  env(name: string): string | undefined;
  now(): Date;
}

export function defaultDeps(): Deps {
  return {
    // Resolved at call time so a test (or runtime) replacing globalThis.fetch is honoured.
    fetch: (input, init) => fetch(input, init),
    env: (name) => Deno.env.get(name),
    now: () => new Date(),
  };
}

export const DEFAULT_APP_TIMEZONE = "Asia/Kolkata";

/** IANA zone for the server's notion of "today" (APP_TIMEZONE, default Asia/Kolkata). */
export function appTimeZone(deps: Deps): string {
  const tz = deps.env("APP_TIMEZONE")?.trim();
  if (!tz) return DEFAULT_APP_TIMEZONE;
  try {
    isoDateInTimeZone(new Date(0), tz);
    return tz;
  } catch {
    console.warn("[deps] APP_TIMEZONE is not a valid IANA zone; using the default");
    return DEFAULT_APP_TIMEZONE;
  }
}

/** Today's calendar date in APP_TIMEZONE, "yyyy-mm-dd". Also the rate-limit day. */
export function serverToday(deps: Deps): string {
  return isoDateInTimeZone(deps.now(), appTimeZone(deps));
}

/**
 * The date items are added on: the phone's `today` if it is within ±1 day of the server's
 * date (covers users in other time zones), otherwise the server's date.
 */
export function resolveToday(deps: Deps, clientToday?: string | null): string {
  const server = serverToday(deps);
  if (!clientToday) return server;
  try {
    return Math.abs(daysLeft(clientToday, server)) <= 1 ? clientToday : server;
  } catch {
    return server;
  }
}
