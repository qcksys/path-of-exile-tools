# Vendor recipe arbitrage

The game home pages link to `/1/arbitrage` and `/2/arbitrage`. Both pages use captured PC currency exchange prices. PoE 1 has tabs for upgrades, currency exchanges, Cluster Jewel rerolls and manually priced item recipes. PoE 2 groups Reforging Bench upgrades together.

## Supported conversions

| Game | Category | Conversions | Limits |
| --- | --- | ---: | --- |
| PoE 1 | Oils | 12 | Clear through Golden, including Indigo |
| PoE 1 | Essences | 80 | All 20 normal families, starting at each family's first existing tier and ending at Deafening |
| PoE 1 | Currency | 17 | 12 NPC purchases and five currency-to-wisdom exchanges |
| PoE 2 | Liquid emotions | 9 | Diluted Liquid Ire through Concentrated Liquid Isolation |
| PoE 2 | Essences | 38 | Lesser to regular and regular to Greater for 19 families |
| PoE 2 | Runes | 26 | Lesser to regular and regular to Greater for 13 families |

Oil, essence, emotion, and rune upgrades convert three identical inputs into one output. PoE 1 uses vendors; PoE 2 uses the Reforging Bench unlocked in Act 3. Currency recipes have their own exact quantities, including four wisdom scrolls for one transmutation orb. NPC purchases use the Purchase Items window; currency downgrades use the sell window. Each row explains which action and vendor to use.

The currency catalogue covers wisdom, portal, transmutation, augmentation, alteration, jeweller, fusing, chance, scouring, regret, alchemy, armourer scraps, and whetstones. Purchases are validated against [Vendor prices](https://www.poewiki.net/wiki/Vendor#Prices), and wisdom exchanges against [Downgrade recipes](https://www.poewiki.net/wiki/Vendor_recipe_system#Downgrade).

## Item-dependent and random recipes

A separate PoE 1 calculator covers 15 recipe types: 5-for-1 magic, rare, and corrupted equipment; 3-for-1 life/mana/hybrid flasks, uniques, maps, scarabs, catalysts, tattoos, runegrafts, and idols; and 5-for-1 Inscribed Ultimatums and wombgifts. Each has wiki-linked restrictions. Legacy net upgrades are not included.

Random outcomes are explicitly labelled and excluded from automatic profit rankings. Flasks and maps require checking the exact input and output items. The calculator accepts the total input batch cost, one specific output sale estimate, and its own price buffer. It reports scenario profit, ROI, and the sale price required to break even. It does not assume output probabilities, average rolls, or guaranteed profit. Changing recipes clears the entered prices.

## 5-for-1 Cluster Jewel expected value

Five Cluster Jewels of the same size and rarity (all magic or all rare) sell for one jewel of that size and rarity with a new enchantment, new modifiers and the lowest input item level ([PoE Wiki](https://www.poewiki.net/wiki/Cluster_jewel#Mechanics)). Five normal jewels return only a Scroll of Wisdom. The PoE 1 page prices every outcome of each size and reports its expected value.

- **Outcomes.** Every rollable enchantment at every passive count: 14 Small × 2–3, 19 Medium × 4–6 and 17 Large × 8–12. The game data still lists five removed enchantments (Medium aura and curse effect, Small +10 Strength, Dexterity and Intelligence); they are excluded in `apps/poe.boats/app/data/cluster-jewel-recipe.ts`.
- **Odds.** Spawn weights are not published, so every outcome is equally likely.
- **Prices.** Each outcome's Cluster Jewel base market in the item level band holding the chosen lowest input item level (`ilvl 84+` by default): the latest merchant-tab median ask within 24 completed hours, in chaos or converted at that hour's exchange rate. These markets merge normal, magic and rare jewels. An outcome without an ask counts as 0 chaos, and the page shows how many are priced.
- **Results.** Per size: expected value per craft, the value without the single best outcome, the median outcome, the break-even price per input (expected value ÷ 5), profit against five of the cheapest priced outcome market, the chance an output is worth at least that cost, and the break-even input price when outputs below an ask go back into the recipe (each craft then needs fewer fresh inputs). The page's own buffer takes from sale values and adds to input costs.

`get_cluster_recipe_market` and `calculate_cluster_recipe` expose the same prices and calculation over HTTP and MCP.

Special oils, Ancient/Potent emotions, multi-ingredient crafting recipes, and upgrades beyond the listed terminal tiers are not covered.

Each result links to the output item's recipe table on [PoE Wiki](https://www.poewiki.net/wiki/Vendor_recipe_system) or [PoE 2 Wiki](https://www.poe2wiki.net/wiki/Reforging_Bench). The catalogue is in `apps/poe.boats/app/data/vendor-recipes.ts`.

## Prices and calculations

Prices use the season market's latest completed hour or its most recent priced day in the seven-day window. Values are in chaos orbs for PoE 1 and exalted orbs for PoE 2. Each quote also reports the units of that item traded across exchange pairs in the last 24 completed hours.

For a price buffer `b` percent:

- Input cost = input unit price × input quantity × (1 + b / 100).
- Sale value = output unit price × output quantity × (1 − b / 100).
- Profit = sale value − input cost.
- ROI = profit / input cost × 100.

By default, each side must have enough traded units for one complete recipe and profit must be positive and meet the minimum. The batch count is the smaller of input units divided by input quantity and output units divided by output quantity, rounded down. Showing all priced recipes also shows losses and recipes with insufficient or unknown volume. The best ROI in each automatic tab uses only recipes with at least one batch. Calculations use unrounded values and suppress floating-point noise at break-even.

Historical trades do not establish current stock at the quoted price. The captured exchange data omits gold fees. Check the linked trade listings before buying.

## Wiki validation

All 197 catalogue entries (182 automatic conversions and 15 item-recipe types) were checked against wiki recipe or vendor purchase tables. Ward and Charging rune upgrades are excluded because their wiki pages do not document the proposed recipes.

`test/fixtures/vendor-recipes-wiki.json` records each verified input, quantity, output, page revision, and permanent wiki URL. The catalogue tests require a matching record for every supported recipe, so changes to recipe quantities or names require new evidence.

Refresh the evidence from the live wikis:

```sh
pnpm --filter poe-boats exec tsx scripts/validate-vendor-recipes.ts
```

The validator checks output item recipe tables for an exact input name, quantity, and deterministic vendor/reforging description. It also checks the Vendor price table and general vendor recipe tables, including rowspan outputs such as the three separate four-wisdom exchanges. Recorded evidence includes output quantities and the matched wiki row for new entries. It handles wiki rate limits and saves successful checks as it progresses. If a run is interrupted, resume its incomplete checks with `--resume`. A full run without that flag refreshes every recipe. Failures return a non-zero exit status; a normal test run uses the recorded evidence and does not call the wikis.
