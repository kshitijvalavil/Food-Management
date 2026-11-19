# One-time setup (account owner)

- [x] GitHub repo created: kshitijvalavil/Food-Management
- [ ] Turn on branch protection for `main`: require the `app`, `functions`, `db` and `secrets` checks (workflow `ci`) and one approving review
- [ ] Vercel: import this repo (free Hobby plan). Framework preset: Next.js.
- [ ] Supabase project "shelflife". Add the edge secrets `ANTHROPIC_API_KEY`, `YOUTUBE_API_KEY`, `FDC_API_KEY` and `VAPID_PRIVATE_KEY`. Put `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in Vercel.
- [ ] Supabase edge-function settings for production (`supabase secrets set NAME=value`; see docs/API.md "Secrets and environment"):
  - `ALLOWED_ORIGIN` (**required**): the production app origin, e.g. `https://shelflife.vercel.app`. Unset means `*`, which is fine only for local work and previews.
  - `APP_TIMEZONE` (optional): IANA zone for the server's "today" and the daily-cap reset. Default `Asia/Kolkata`.
  - `BARCODE_DAILY_LIMIT` (optional): Open Food Facts lookups per user per day. Default `200`.
- [ ] Deploy the edge functions with `npx supabase functions deploy` from the repo root (not from `supabase/`). `supabase/config.toml` maps each function to `supabase/functions/deno.json`, and the bundler pulls in `shared/*.ts` through the relative imports.
- [ ] USDA FoodData Central API key (free): https://fdc.nal.usda.gov/api-key-signup
- [ ] YouTube Data API v3 key (free quota), from Google Cloud Console
- [ ] Cloud environment for the bots, with allowed hosts: vercel.com, api.vercel.com, supabase.co, api.supabase.com, world.openfoodfacts.org, api.nal.usda.gov, www.googleapis.com, fsis.usda.gov. Save keys through the secure credential form, never in chat.
- [ ] On your phone: open the Vercel link, then Add to Home Screen (iPhone Safari) or Install app (Android Chrome)
- [ ] Approve "plan-kickoff" on the board
