# ShelfLife (Food-Management)

A food-management app for iPhone and Android that cuts waste. Snap a photo of a fridge shelf, scan a barcode, record a voice note or search. ShelfLife works out what you have, where it's stored (fridge, freezer or pantry), when it goes off, and how many calories it has. Then it suggests dishes, with YouTube videos, that use the food going off first.

| | Link |
|---|---|
| Plan (research, stack, architecture, sprints) | https://claude.ai/artifact/TiasY4KQ8GQBs3Lm8tteGk |
| Screen mockups | https://claude.ai/artifact/TWgx1ZLDNafaBQSfLNBKJR |
| Team board (live) | https://claude.ai/artifact/2DvTGTYnAbE9ETFWLXHebn |

## Stack
Expo SDK 56 (React Native, TypeScript, Expo Router, NativeWind) · Supabase (Postgres + RLS, Auth, Storage, Edge Functions) · Claude API (vision + structured output, server-side only) · Open Food Facts · USDA FoodKeeper + FoodData Central · YouTube Data API · EAS Build/Submit/Update · Jest, Maestro, pgTAP.

## Docs
- [docs/PLAN.md](docs/PLAN.md): scope and the two sprints
- [docs/BOTS.md](docs/BOTS.md): the bot team, their models, and how they work without approvals
- [docs/SETUP-CHECKLIST.md](docs/SETUP-CHECKLIST.md): one-time setup the account owner does
