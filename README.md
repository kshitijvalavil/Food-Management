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

## Docs
- [docs/PLAN.md](docs/PLAN.md): scope and the two sprints
- [docs/BOTS.md](docs/BOTS.md): the bot team, their models, and how they work without approvals
- [docs/SETUP-CHECKLIST.md](docs/SETUP-CHECKLIST.md): one-time setup the account owner does
