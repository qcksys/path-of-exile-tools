# Vendor recipe arbitrage

The game home pages link to `/1/arbitrage` and `/2/arbitrage`. Both pages load current PC trade leagues and market prices from poe.ninja. No account or database migration is required.

## Supported conversions

| Game | Category | Conversions | Limits |
| --- | --- | ---: | --- |
| PoE 1 | Oils | 12 | Clear through Golden, including Indigo |
| PoE 1 | Essences | 80 | All 20 normal families, starting at each family's first existing tier and ending at Deafening |
| PoE 2 | Liquid emotions | 9 | Diluted Liquid Ire through Concentrated Liquid Isolation |
| PoE 2 | Essences | 38 | Lesser to regular and regular to Greater for 19 families |
| PoE 2 | Runes | 26 | Lesser to regular and regular to Greater for 13 families |

All supported recipes convert three identical inputs into one output. PoE 1 uses vendors; PoE 2 uses the Reforging Bench unlocked in Act 3. Random rerolls, equipment, maps/waystones, special oils, Ancient/Potent emotions, and upgrades beyond these terminal tiers are excluded.

Each result links to the output item's recipe table on [PoE Wiki](https://www.poewiki.net/wiki/Vendor_recipe_system) or [PoE 2 Wiki](https://www.poe2wiki.net/wiki/Reforging_Bench). The catalogue is in `apps/poe.boats/app/data/vendor-recipes.ts`.

## Prices and calculations

The server requests the game-specific `/api/data/index-state` and `/api/economy/exchange/current/overview` endpoints on poe.ninja. It only requests leagues listed by that game. PoE 1 categories are `Oil` and `Essence`; PoE 2 categories are `Delirium`, `Essences`, and `Runes`.

Values are normalized to chaos orbs for PoE 1 and exalted orbs for PoE 2. `core.rates[target]` is the number of target currency units per primary unit, so a line's `primaryValue` is multiplied by that rate. Missing conversions, zero/negative/non-finite prices, and unpriced recipe ingredients are excluded. A failed category does not discard successful categories. Successful responses are cached in a bounded per-worker memory cache for five minutes; the displayed timestamp preserves the oldest retrieval time used in the snapshot.

For a price buffer `b` percent:

- Input cost = input unit price × input quantity × (1 + b / 100).
- Sale value = output unit price × output quantity × (1 − b / 100).
- Profit = sale value − input cost.
- ROI = profit / input cost × 100.

Only positive profits meeting the minimum are shown by default. Showing all priced recipes disables the minimum-profit filter. Calculations use unrounded values and suppress floating-point noise at break-even.

These are market estimates rather than live, executable offers. Prices do not establish available stock or liquidity; gold, trade time, and transaction costs are not priced. Use the price buffer and verify the linked trade listings before buying.

## Wiki validation

All 165 supported conversions were checked against individual wiki recipe tables. Ward and Charging rune upgrades are excluded because their wiki pages do not document the proposed recipes.

`test/fixtures/vendor-recipes-wiki.json` records each verified input, quantity, output, page revision, and permanent wiki URL. The catalogue tests require a matching record for every supported recipe, so changes to recipe quantities or names require new evidence.

Refresh the evidence from the live wikis:

```sh
pnpm --filter poe-boats exec tsx scripts/validate-vendor-recipes.ts
```

The validator checks the output item's rendered recipe table for an exact input name, quantity, and deterministic vendor/reforging description. It handles wiki rate limits and saves successful checks as it progresses. If a run is interrupted, resume its incomplete checks with `--resume`. A full run without that flag refreshes every recipe. Failures return a non-zero exit status; a normal test run uses the recorded evidence and does not call the wikis.
