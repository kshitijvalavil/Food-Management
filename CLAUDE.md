# ShelfLife: rules for every bot in this repo

Read docs/PLAN.md and docs/BOTS.md before you start. The mockups at https://claude.ai/artifact/TWgx1ZLDNafaBQSfLNBKJR are the source of truth for UI and copy.

## Layout (once scaffolded)
- `app/`: Expo Router screens. `components/`, `lib/` and `theme/` hold the design tokens.
- `supabase/migrations/`, `supabase/functions/<name>/`, `supabase/tests/` (pgTAP)
- `e2e/`: Maestro flows. `tests/photo-set/`: the photo-accuracy fixtures.

## Hard rules
- Never put API keys in the app. Claude, YouTube and FoodData Central are called only from Supabase Edge Functions, with keys stored as Supabase secrets.
- Every table has RLS scoped to `household_id`. A migration without a policy fails review.
- AI output is untrusted. Validate it against the zod schema and show it on the review screen before saving.
- Expiry dates always carry a `source`: `printed`, `foodkeeper` or `ai_estimate`.
- One task, one branch (`s<sprint>/<short-name>`), one pull request. Never push to `main` directly, and never force-push.
- A PR merges only when CI is green and Sherlock Bugs has approved it. Captain Shipit merges.
- Do not promote a build to public App Store or Play production. That's for the human owner.

## Commands
- `npm run typecheck && npm run lint && npm test`
- `npx supabase db reset && npx supabase test db`
- `maestro test e2e/`
- `eas build --profile preview --platform all` / `eas build --profile production --platform all --auto-submit`

## Board
After every state change, update the board (https://claude.ai/artifact/2DvTGTYnAbE9ETFWLXHebn) with the ArtifactData tool. Change your task's `state` in `board/sprints` (todo, doing, testing, waiting, blocked or done), and add a line to `board/log`. Always pin writes with `if_version`.
