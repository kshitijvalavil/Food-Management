# shelf_life seed

`supabase/seed.sql` is **generated**. Edit `curated_foods.csv`, then run:

```sh
python3 -I supabase/seed/generate_seed.py
```

The generator validates every row (unique ids and names, a valid `default_location` that has days, min <= max, lowercase keywords) and refuses to write a bad seed.

## Where the data comes from

> **TODO (Sprint 1, Tabledore): replace these rows with USDA FSIS FoodKeeper data.**
> On 2026-11-18 the official file (`http://www.fsis.usda.gov/shared/data/EN/foodkeeper.json`)
> could not be downloaded from the build sandbox: `www.fsis.usda.gov` was refused by the
> network proxy (CONNECT 403). Once the host is reachable, import FoodKeeper rows with
> `source = 'foodkeeper'` and retire the curated rows they cover.

Until then every row is `source = 'curated'`: about 150 everyday grocery items for an Indian household, hand-authored from widely published food-safety guidance and deliberately conservative (short ranges, hot-climate pantry times). **They are not USDA data and must not be labelled as FoodKeeper in the app.** The expiry engine stores `expiry_source = 'foodkeeper'` for dates computed from this table, as the contract says. If the curated rows ship before the FoodKeeper import, the review sheet should still say the date is an estimate.

Conventions in the CSV:
- Days are whole days from the day the item was added. An empty min/max means "not recommended in this location".
- Days describe the item as it is usually kept at home: opened or loose. Sealed packs should use the printed date (`expiry_source = 'printed'`). Where a location means something different, `tips` says so (for example, fridge days for cut onion).
- `keywords` are `|`-separated, lowercase, and include Hindi and other Indian-language names (palak, dahi, atta, methi, dhania, ...), so `search_food()` finds them.
