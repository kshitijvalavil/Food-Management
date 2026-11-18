# ShelfLife plan (summary)

The full plan is here: https://claude.ai/artifact/TiasY4KQ8GQBs3Lm8tteGk

## Capture methods
1. **Photo**: Claude vision returns `[{name, quantity, unit, location, printed_date?, confidence}]`
2. **Barcode**: `expo-camera` EAN/UPC scan, looked up in Open Food Facts (cached in `products`)
3. **Voice note**: on-device speech-to-text, then Claude Haiku parses the text into the same item schema
4. **Search**: the `shelf_life` + `products` tables

All four open the same review sheet. Nothing is saved without the user confirming it.

## Expiry logic
The printed date, if read, is used first. Otherwise the date added plus FoodKeeper `max_days[location]`. Otherwise an AI estimate, flagged as such. Items under 0.7 confidence are marked "check me".

## Sprint 1: Capture
Schema + RLS · FoodKeeper seed · analyze-photo · lookup-barcode · expiry engine · app shell + auth · camera + review sheet + search · Kitchen list · 40-photo accuracy set · Maestro add flows · CI + first TestFlight / Play internal build.

## Sprint 2: Use it up
parse-voice · suggest-recipes + YouTube · calories (FoodData Central) + AI rate limits · voice screen · Today screen · item detail + Cook tab · notifications (expiry alerts with chosen lead time, running-low alerts from restock history with an auto shopping list, morning digest, quiet hours, household alerts), onboarding, dark mode · household sharing + waste stats · full regression + a11y · store assets, privacy labels, release builds.

## Release gates
See the "Quality gates" section of the plan and `board/security` on the board. Any failed check blocks the release.
