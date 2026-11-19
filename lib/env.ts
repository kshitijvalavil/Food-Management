// Only NEXT_PUBLIC_SUPABASE_URL and the anon key may reach the browser (CLAUDE.md hard rule).
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Demo mode: local fixtures + IndexedDB, no backend. On with NEXT_PUBLIC_DEMO=1 or when Supabase env is missing. */
export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO === "1" || !SUPABASE_URL || !SUPABASE_ANON_KEY;
