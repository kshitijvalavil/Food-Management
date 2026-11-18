# ShelfLife plan (summary)

The full plan is here: https://claude.ai/artifact/TiasY4KQ8GQBs3Lm8tteGk

## Capture methods
1. **Photo**: Claude vision returns `[{name, quantity, unit, location, printed_date?, confidence}]`
2. **Barcode**: ZXing on the live camera feed, EAN/UPC, looked up in Open Food Facts (cached in `products`)
3. **Voice note**: Web Speech API (Safari and Chrome), with keyboard dictation as the fallback, then Claude Haiku parses the text into the same item schema
4. **Search**: the `shelf_life` + `products` tables

All four open the same review sheet. Nothing is saved without the user confirming it.

## Expiry logic
The printed date, if read, is used first. Otherwise the date added plus FoodKeeper `max_days[location]`. Otherwise an AI estimate, flagged as such. Items under 0.7 confidence are marked "check me".

## Platform
A phone-only web app (Next.js PWA) on Vercel. iPhone: Safari → Add to Home Screen (Web Push needs iOS 16.4 or later and a home-screen install). Android: Chrome → Install. Laptops and iPads get a QR handoff page. No App Store for now; Capacitor can wrap it later.

## Sprint 1: Capture
Schema + RLS · FoodKeeper seed · analyze-photo · lookup-barcode · expiry engine · app shell + auth · camera + review sheet + search · Kitchen list · 40-photo accuracy set · Maestro add flows · CI + Vercel previews + first live link on Boss's phone.

## Sprint 2: Use it up
parse-voice · suggest-recipes + YouTube · calories (FoodData Central) + AI rate limits · voice screen · Today screen · item detail + Cook tab · notifications (expiry alerts with chosen lead time, running-low alerts from restock history with an auto shopping list, morning digest, quiet hours, household alerts), onboarding, dark mode · household sharing + waste stats · full regression + a11y · icons, manifest, VAPID keys, privacy page, Lighthouse PWA ≥ 90, production deploy.

## Release gates
See the "Quality gates" section of the plan and `board/security` on the board. Any failed check blocks the release.
