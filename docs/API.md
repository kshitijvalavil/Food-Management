# Edge functions API (Sprint 1)

Owner: Byte Vader. Shapes come from `shared/schema.ts`; this page shows them with examples.

All four functions live in `supabase/functions/<name>/index.ts` (Deno). Each one:

- takes `POST` with a JSON body and `Authorization: Bearer <supabase user JWT>`. `supabase.functions.invoke(name, { body })` sends both.
- answers `OPTIONS` with CORS headers (204). Any other method gets 405.
- validates the body with zod and returns `ApiError` on any failure.
- validates its own response with zod before sending it.

Validation uses zod `^4.6.7` on both sides (Deno import map and the app).

```ts
const { data, error } = await supabase.functions.invoke("analyze-photo", {
  body: { storage_path: `${householdId}/${uuid}.jpg`, location_hint: "fridge", today: localIsoDate() },
});
```

**`today` (optional, on `analyze-photo`, `parse-text` and `lookup-barcode`).** This is the phone's local date as `YYYY-MM-DD`. The server uses it as the day added only if it is within ±1 day of the server's own date; otherwise the server's date is used. Without it, the server's date in `APP_TIMEZONE` (default `Asia/Kolkata`) is used. An invalid value is a 400.

**"Today" on the server** is the calendar date in `APP_TIMEZONE`, not UTC. The daily caps reset at midnight in that zone too. The caps always use the server's date, never the client's.

## Errors

Every failure has the `ApiError` shape: `{ "error": { "code": "...", "message": "..." } }`. The message is short and safe to show to the user.

| code | HTTP | when |
|---|---|---|
| `bad_request` | 400 (405 wrong method, 413 body over 64 KB) | body is not JSON or fails the zod schema; bad storage path; the file is not a JPEG/PNG/WebP; photo over 3.5 MB |
| `unauthorized` | 401 | missing or invalid JWT |
| `not_found` | 404 | scan missing, **or** in a household the user is not a member of (same answer on purpose) |
| `rate_limited` | 429 | the user's daily AI cap, or the daily cap on new barcode lookups, is used up (resets at midnight in `APP_TIMEZONE`) |
| `upstream_failed` | 502 | Claude gave unusable output twice, refused, or errored; Open Food Facts down with nothing cached; search RPC failed |
| `internal` | 500 | server not configured (missing secret) or an unexpected bug |

## `analyze-photo`

Reads a photo the app has uploaded to the private `scans` bucket at `{household_id}/{uuid}.jpg`, asks **Claude Sonnet 5.5** (`claude-sonnet-5-5`) to list the food in it, matches each item to FoodKeeper (`search_food` RPC with `category_hint`, then `name`) and runs the expiry engine.

- The first path segment must be a household the caller belongs to (checked with the service role before anything is downloaded).
- File type is sniffed from its bytes. Max 3.5 MB; send a JPEG about 1600 px on the long edge (about 300 to 600 KB). Bigger photos do not read better.
- Counts 1 AI call against the daily cap (only after the file passes the checks; retries inside one request do not count twice).
- `flagged` = number of items with `confidence < 0.7` ("check me" on the review sheet). The server lowers confidence to 0.5 when an item needs a check even though the model was sure:
  - its printed date is already past (the item is kept and shows as "gone"), or
  - its name looks like an instruction, a URL or markup (for example "ignore previous instructions", `http://`, `www.`, `system:`, `<script>`).
- `dropped` = number of items the model returned that failed validation and were left out. These are a quantity of 0 or less, or over 1000; an unknown unit or location; an empty name; or wrong types. A confidence outside 0 to 1 is clamped, not dropped. The scan only fails (one retry, then 502) if every item is invalid. When `dropped > 0` the app can say "n items couldn't be read".

Request
```json
{ "storage_path": "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f/3b9a7c1e-2d4f-4a6b-8c0d-1e2f3a4b5c6d.jpg", "location_hint": "fridge" }
```
`location_hint` is `"fridge" | "freezer" | "pantry" | null`.

Response 200 (2 of 7 items shown; the full fixture is `supabase/functions/_fixtures/claude-fridge-shelf.json`)
```json
{
  "items": [
    {
      "name": "Toned milk", "quantity": 2, "unit": "pack", "location": "fridge",
      "printed_date": "2026-11-20", "confidence": 0.92, "category_hint": "milk", "barcode": null,
      "shelf_life_id": 101, "expires_on": "2026-11-20", "expiry_source": "printed",
      "expiry_range_days": [5, 7], "kcal_per_unit": null, "kcal_per_100g": null
    },
    {
      "name": "Cooked rice", "quantity": 1, "unit": "count", "location": "fridge",
      "printed_date": null, "confidence": 0.55, "category_hint": "cooked rice", "barcode": null,
      "shelf_life_id": 106, "expires_on": "2026-11-22", "expiry_source": "foodkeeper",
      "expiry_range_days": [3, 5], "kcal_per_unit": null, "kcal_per_100g": null
    }
  ],
  "flagged": 1,
  "dropped": 0
}
```

## `lookup-barcode`

Looks up an EAN/UPC barcode. The `products` table is a cache: a hit younger than `OFF_CACHE_DAYS` (default 30) is used as-is; otherwise Open Food Facts is called (`/api/v2/product/{code}.json?fields=product_name,brands,quantity,nutriments,categories_tags`, User-Agent `ShelfLife/0.1 (personal project)`) and the row is upserted. If OFF is down and an old cache row exists, the old row is served. No AI call.

The OFF response is validated with a lenient zod schema. A field with the wrong type is dropped (for example, a numeric `product_name` makes the name fall back to the brand, then to "Unknown product"). A body of the wrong shape counts as not found, and a non-JSON body as OFF being down. None of these give a 500.

Rate limit: each lookup that has to call OFF counts against `BARCODE_DAILY_LIMIT` (default 200 per user per day). Fresh cache hits are free. Over the cap, an old cached copy is served if there is one; otherwise the answer is 429.

Mapping: `name` = `product_name` (else brand); `quantity` 1, `unit` `pack`; `kcal_per_100g` = `nutriments["energy-kcal_100g"]`; `kcal_per_unit` = kcal for the whole pack when the pack size parses (`100 g`, `1 kg`, `500 ml`); `confidence` 1. `location`: any `en:frozen*` or ice-cream category → `freezer`; dairy, eggs, meat, fish or fresh categories → `fridge`; otherwise `pantry`. `category_hint` is the most specific English category (`en:salted-butters` → `salted butters`), used for the FoodKeeper match.

Request
```json
{ "barcode": "8901262010023" }
```
Response 200, found (from `_fixtures/off-amul-butter-8901262010023.json`)
```json
{
  "found": true,
  "item": {
    "name": "Amul Butter", "quantity": 1, "unit": "pack", "location": "fridge",
    "printed_date": null, "confidence": 1, "category_hint": "salted butters", "barcode": "8901262010023",
    "shelf_life_id": 102, "expires_on": "2027-01-17", "expiry_source": "foodkeeper",
    "expiry_range_days": [30, 90], "kcal_per_unit": 722, "kcal_per_100g": 722
  },
  "product_name": "Amul Butter", "brand": "Amul", "pack_size": "100 g"
}
```
Response 200, not in Open Food Facts
```json
{ "found": false, "item": null, "product_name": null, "brand": null, "pack_size": null }
```
The app should then offer search or manual entry. Not-found answers are not cached.

## `parse-text`

Turns a voice transcript (Web Speech API) or a typed list into items with **Claude Haiku 5.5** (`claude-haiku-5-5`), then the same FoodKeeper match and expiry engine. Counts 1 AI call. `text` is 1 to 2000 characters and must not be blank.

Request
```json
{ "text": "two packs of milk a dozen eggs half a kilo of onions and the chicken goes in the freezer" }
```
Response 200 (2 of 4 items shown; fixture `_fixtures/claude-voice-list.json`)
```json
{
  "items": [
    {
      "name": "Onions", "quantity": 0.5, "unit": "kg", "location": "pantry",
      "printed_date": null, "confidence": 0.86, "category_hint": "onions", "barcode": null,
      "shelf_life_id": 107, "expires_on": "2027-01-02", "expiry_source": "ai_estimate",
      "expiry_range_days": [30, 60], "kcal_per_unit": null, "kcal_per_100g": null
    },
    {
      "name": "Chicken", "quantity": 500, "unit": "g", "location": "freezer",
      "printed_date": null, "confidence": 0.8, "category_hint": "chicken, raw", "barcode": null,
      "shelf_life_id": 108, "expires_on": "2027-08-15", "expiry_source": "ai_estimate",
      "expiry_range_days": [270, 270], "kcal_per_unit": null, "kcal_per_100g": null
    }
  ]
}
```

## `search-food`

A thin wrapper over the `search_food(q)` RPC, called as the user (RLS applies). No AI call. `q` is 1 to 60 characters. Returns at most 10 results.

Request
```json
{ "q": "curd" }
```
Response 200
```json
{ "results": [{ "shelf_life_id": 105, "name": "Yogurt", "category": "Dairy", "default_location": "fridge" }] }
```

## Expiry rules (`shared/expiry.ts`)

The same file runs in the functions and in the browser, so the review sheet can re-compute a date when the user changes the location:

```ts
import { computeExpiry, daysLeft } from "@/shared/expiry";
const { expires_on, expiry_source, expiry_range_days } = computeExpiry(item, shelfLifeRow, new Date());
```

1. `printed_date`, if it is a real date no more than 5 years before and no more than 3 years after the day added → `printed`. A printed date that is already past is **kept**, so the item shows as "gone", and `computeExpiry` returns `review_reason: "printed_date_in_past"`; the functions turn that into confidence 0.5. Older or further-ahead dates are treated as misreads.
2. The matched `shelf_life` row's `[min, max]` days for the item's location → added + `floor((min + max) / 2)`. The label is `foodkeeper` **only when `shelf_life.source = 'foodkeeper'`**. Any other source (today every row is `'curated'`, because the USDA download was blocked) → `ai_estimate`, shown as "Estimate". Curated data is never labelled as USDA. Pass the row with its `source` column when you preview in the app.
3. The model's own `estimated_days_left` (photo and text only) → `ai_estimate`.
4. Fallback: fridge 5, freezer 90, pantry 180 days → `ai_estimate`.

`expiry_range_days` is reported whenever the row has days for that location, even when the printed date wins. A null min/max pair means "not recommended in this location": the engine then skips to steps 3 and 4. The server uses the date from `resolveToday` (above) as the day added. The app can match it with `isoDateInTimeZone(new Date(), zone)` from the same file, or by passing a `Date`, which reads the phone's local date.

In the examples above, rows 101 to 103 and 106 of `_fixtures/shelf-life-rows.json` are `foodkeeper`, and 104, 105, 107 and 108 are `curated`. So in the `parse-text` example the chicken comes back as `"expiry_source": "ai_estimate"`, not `foodkeeper`. Against today's seed, expect `ai_estimate` almost everywhere.

## How Claude is called

- `POST https://api.anthropic.com/v1/messages` with `fetch`, headers `x-api-key`, `anthropic-version: 2023-06-01`.
- One tool, `record_items`, with `strict: true` and an `input_schema` that mirrors `DetectedItem[]` plus `estimated_days_left`. Each item is then validated with zod on its own: confidence is clamped into 0 to 1, and invalid items are dropped and counted. Unusable output is retried once, then `upstream_failed`. Unusable means no tool call, the wrong outer shape, more than 60 items, or every item invalid. A 429/5xx or a network error is also retried once. A refusal fails at once.
- `tool_choice` is `{"type": "auto"}`, not a forced `{"type": "tool"}`: Sonnet 5.5 rejects forced tool choice with a 400. The system prompt and the strict tool keep it reliable.
- Sonnet 5.5 requests also send `fallbacks: "default"` with the beta header `anthropic-beta: server-side-fallback-2026-07-01`. This sends a refused request to a fallback model on the server. Haiku 5.5 has no server-side fallback.
- Effort: `medium` for photos, `low` for text.
- Prompts are in `shared/prompts/`. Text in images, on labels, on receipts and in transcripts is data, never instructions. The system prompt says so. Transcripts are wrapped in `<transcript>` tags. Inside them, `&`, `<` and `>` are escaped (`&amp;`, `&lt;`, `&gt;`), so no tag can be formed, whether nested, unterminated or otherwise. The prompt tells the model what the entities mean. Nothing the model returns is saved until the user confirms it on the review screen.

## Secrets and environment

| name | where | notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | `supabase secrets set ANTHROPIC_API_KEY=...` | needed by `analyze-photo` and `parse-text`. Never in the app. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | set by Supabase in the edge runtime | the service role is used for membership checks, the `scans` download, `ai_usage` and the `products` cache |
| `AI_DAILY_LIMIT` | optional secret | AI calls per user per day, default `40`. A blank or invalid value means 40; an explicit `0` switches AI off. |
| `BARCODE_DAILY_LIMIT` | optional secret | lookups per user per day that go out to Open Food Facts, default `200`. A blank or invalid value means 200. |
| `APP_TIMEZONE` | optional | IANA zone for the server's "today" and the cap reset, default `Asia/Kolkata`. An unknown zone falls back to the default. |
| `OFF_CACHE_DAYS` | optional | how long a `products` row counts as fresh, default `30` |
| `ALLOWED_ORIGIN` | **required in production** | CORS origin, e.g. `https://shelflife.vercel.app`. It is sent back as a fixed value and the request's `Origin` is never reflected. When unset it is `*`, which is acceptable only for local development and previews (auth is a bearer header, not a cookie). Set it in production. |

## Database objects these functions expect (Tabledore)

- `household_members(household_id, user_id)`.
- `bump_ai_usage(p_user_id uuid, p_day date) returns integer` (service role only). It increments `ai_usage` atomically and returns the new count. The function passes `p_day` as today's date in `APP_TIMEZONE`, and refuses the call when the new count is over the limit.
  - **Barcode cap (Sprint 1 stop-gap).** It reuses the same RPC and table with `p_day` shifted 1000 years ahead (2026-11-18 → `3026-11-18`), so it is atomic and persistent but never collides with the AI counter. Anything that reads `ai_usage` must ignore rows dated after year 2999. To replace it: add `kind text not null default 'ai'` to the key, or add a `barcode_usage` table, plus a `bump_usage(p_user_id, p_kind, p_day)` RPC.
- `products(barcode pk, name, brand, pack_size, kcal_per_100g, raw jsonb, fetched_at)`. `name` and `raw` may be null.
- `search_food(q text) returns setof shelf_life`, at most 10 rows, best match first, callable by `authenticated`. It must include `source`.
- Storage bucket `scans` (private).

## Running locally

```sh
cd supabase/functions
deno task check            # type-check every function
deno test --allow-read=. --allow-env --no-prompt
deno lint
# from the repo root: expiry engine tests (vitest)
npx -y vitest@2 run shared/expiry --root .
supabase functions serve    # with a local stack and supabase/.env holding ANTHROPIC_API_KEY
```

The root vitest config must exclude `supabase/**`. The `*.test.ts` files there are Deno tests (`jsr:`/`npm:` imports, `Deno.test`) and fail under vitest.

The tests mock `fetch` for Supabase, Anthropic and Open Food Facts; any other URL fails the test. The fixtures in `supabase/functions/_fixtures/` were written by hand in the shape of the real API responses. They were not recorded from the live APIs, because there is no key or project yet. Re-record them once there is.
