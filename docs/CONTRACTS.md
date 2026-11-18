# Contracts (Sprint 1)

`shared/schema.ts` is the source of truth for item shapes and edge-function requests/responses. All three builders import from it.

## Database (Tabledore) — `public` schema
| table | key columns |
|---|---|
| `households` | `id uuid pk`, `name text`, `created_at` |
| `household_members` | `household_id → households`, `user_id → auth.users`, `role text ('owner'|'member')`, pk(household_id,user_id) |
| `shelf_life` | `id int pk`, `name text`, `category text`, `keywords text[]`, `default_location location`, `pantry_min_days/pantry_max_days/fridge_min_days/fridge_max_days/freezer_min_days/freezer_max_days int null`, `tips text null`, `source text default 'foodkeeper'` — readable by any signed-in user |
| `products` | `barcode text pk`, `name`, `brand`, `pack_size`, `kcal_per_100g numeric null`, `raw jsonb`, `fetched_at` — barcode cache, read by signed-in users, written by service role only |
| `items` | `id uuid pk`, `household_id`, `name`, `quantity numeric`, `unit text`, `location location`, `added_at timestamptz`, `expires_on date`, `expiry_source expiry_source`, `confidence real`, `shelf_life_id int null`, `barcode text null`, `kcal_per_unit numeric null`, `status text ('active'|'used'|'binned') default 'active'`, `usual_quantity numeric null`, `low_threshold numeric null`, `created_by uuid` |
| `usage_events` | `id`, `household_id`, `item_id`, `kind ('added'|'used'|'binned'|'moved')`, `quantity`, `at` |
| `ai_usage` | `user_id`, `day date`, `calls int` — rate limit counter, service role only |

Enums: `location ('fridge','freezer','pantry')`, `expiry_source ('printed','foodkeeper','ai_estimate')`.
RLS: a helper `is_member(household_id)`; every household-scoped table is read/write only for members. Storage bucket `scans` (private), path `"{household_id}/{uuid}.jpg"`, members only.
RPC: `search_food(q text)` → top 10 `shelf_life` rows by trigram/keyword match.

## Edge functions (Byte Vader) — `supabase/functions/<name>/index.ts` (Deno)
`analyze-photo`, `lookup-barcode`, `parse-text`, `search-food` (thin wrapper over the RPC). Shared server code in `supabase/functions/_shared/` (claude client, expiry engine, rate limit, cors, errors). The expiry engine is pure TypeScript in `shared/expiry.ts` so the app can preview dates too.

## App (Sir Pixelot) — calls functions with `supabase.functions.invoke(name, { body })`
Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. With `NEXT_PUBLIC_DEMO=1` (or no Supabase env) the app runs on local demo data so it can be tried on a phone before the backend is live.
