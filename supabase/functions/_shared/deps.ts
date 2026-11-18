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

/** Today's calendar date in UTC, "yyyy-mm-dd". */
export function todayUtc(deps: Deps): string {
  return deps.now().toISOString().slice(0, 10);
}
