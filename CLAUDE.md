# ShelfLife: rules for every bot in this repo

Read docs/PLAN.md and docs/BOTS.md before you start. The mockups at https://claude.ai/artifact/TWgx1ZLDNafaBQSfLNBKJR are the source of truth for UI and copy.

## Layout (once scaffolded)
- `app/`: Next.js App Router routes (phone-only; `middleware.ts` + a client gate send laptops and iPads to `/open-on-phone`). `components/`, `lib/` and `styles/` hold the design tokens.
- `public/manifest.webmanifest`, `app/sw.ts` (Serwist service worker, Web Push handler)
- `supabase/migrations/`, `supabase/functions/<name>/`, `supabase/tests/` (pgTAP)
- `e2e/`: Playwright specs (projects: iPhone 15 on WebKit, Pixel 8 on Chromium). `tests/photo-set/`: the photo-accuracy fixtures.

## Hard rules
- Never put API keys in the browser. Claude, YouTube and FoodData Central are called only from Supabase Edge Functions or Next.js server routes, with keys stored as Supabase or Vercel secrets. Only `NEXT_PUBLIC_SUPABASE_URL` and the anon key may be public.
- Every table has RLS scoped to `household_id`. A migration without a policy fails review.
- AI output is untrusted. Validate it against the zod schema and show it on the review screen before saving.
- Expiry dates always carry a `source`: `printed`, `foodkeeper` or `ai_estimate`.
- One task, one branch (`s<sprint>/<short-name>`), one pull request. Never push to `main` directly, and never force-push.
- A PR merges only when CI is green and Sherlock Bugs has approved it. Captain Shipit merges.
- Design for phones only (320 to 480px wide, touch, safe-area insets). No App Store or Play builds for now.

## Commands
- `npm run typecheck && npm run lint && npm test`
- `npx supabase db reset && npx supabase test db`
- `npx playwright test`
- `npx lighthouse <preview-url> --preset=perf --form-factor=mobile`
- Deploys: Vercel builds every PR (preview link) and `main` (production) from Git.

## Board
After every state change, update the board (https://claude.ai/artifact/2DvTGTYnAbE9ETFWLXHebn) with the ArtifactData tool. Change your task's `state` in `board/sprints` (todo, doing, testing, waiting, blocked or done), and add a line to `board/log`. Always pin writes with `if_version`.
