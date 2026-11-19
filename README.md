# ShelfLife (Food-Management)

A phone-only web app (PWA) for iPhone and Android that cuts food waste. Open it in Safari or Chrome and add it to your home screen. Laptops and iPads see an "open on your phone" QR page. Snap a photo of a fridge shelf, scan a barcode, record a voice note or search. ShelfLife works out what you have, where it's stored (fridge, freezer or pantry), when it goes off, and how many calories it has. Then it suggests dishes, with YouTube videos, that use the food going off first.

| | Link |
|---|---|
| Plan (research, stack, architecture, sprints) | https://claude.ai/artifact/TiasY4KQ8GQBs3Lm8tteGk |
| Screen mockups | https://claude.ai/artifact/TWgx1ZLDNafaBQSfLNBKJR |
| Team board (live) | https://claude.ai/artifact/2DvTGTYnAbE9ETFWLXHebn |

## Stack
Next.js (App Router, TypeScript) as an installable PWA · Tailwind · Framer Motion · ZXing barcode · Web Speech API · Web Push · Supabase (Postgres + RLS, Auth, Storage, Edge Functions) · Claude API (vision + structured output, server-side only) · Open Food Facts · USDA FoodKeeper + FoodData Central · YouTube Data API · Vercel hosting (free) · Vitest, Playwright (WebKit + Chromium phone emulation), Lighthouse, pgTAP.

## Try it on your phone
1. Open the Vercel link in Safari (iPhone) or Chrome (Android).
2. iPhone: Share → **Add to Home Screen**. Android: **Install app**.
3. Open ShelfLife from the home-screen icon. Allow camera and notifications.

## Run locally
Needs Node 20.11 or later.

```bash
npm install
npm run dev                      # http://localhost:3000, demo mode (no backend needed)
```

**Demo mode** is on when `NEXT_PUBLIC_DEMO=1` is set or the Supabase variables are missing. It uses local fixtures: a 7-item fridge-shelf photo result, the Amul butter barcode `8901262010023`, a 30-item search list and a seeded kitchen. Everything is stored in your browser's IndexedDB. Use **Me → Reset demo kitchen** to start over.

**Real mode:** copy the two public values into `.env.local`. Only these two may be public; every other key lives in Supabase or Vercel secrets.
```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```
Sign-in is by magic link (`/login` → `/auth/callback`).

**Phone only.** Laptops and iPads are redirected to `/open-on-phone`. To develop on a laptop, either use your browser's device toolbar (phone width and a phone user agent), or open `http://localhost:3000/?phone=1` once. That sets a cookie that skips the gate for 30 days.

**Try it on a phone on the same Wi-Fi:** `npm run build && npm start -- -H 0.0.0.0`, then scan the QR code on `/open-on-phone` from your laptop. The camera and microphone need HTTPS everywhere except `localhost`, so use a Vercel preview link to test those.

| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc` for the app and the service worker |
| `npm run lint` | ESLint (next/core-web-vitals + next/typescript) |
| `npm test` | Vitest + Testing Library (`shared/**`, `lib/**`, `components/**`; never `supabase/**`) |
| `npm run build` | Production build, including the Serwist service worker `public/sw.js` |
| `npm run e2e` | Playwright on "iPhone 15" and "Pixel 8". Build with `NEXT_PUBLIC_DEMO=1 npm run build` first; it starts `next start` on port 3210 |
| `npm run icons` | Regenerates `public/icons/*.png` from the logo (sharp) |

Opt-in screenshot tour for design review: `SHOTS_DIR=/tmp/shots npx playwright test screens --project="iPhone 15"`.

## Docs
- [docs/PLAN.md](docs/PLAN.md): scope and the two sprints
- [docs/BOTS.md](docs/BOTS.md): the bot team, their models, and how they work without approvals
- [docs/SETUP-CHECKLIST.md](docs/SETUP-CHECKLIST.md): one-time setup the account owner does
