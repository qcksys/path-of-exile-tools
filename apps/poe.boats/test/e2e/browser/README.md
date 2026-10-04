# Recombinator browser coverage

These tests exercise `/1/recombinator` through its visible controls, generated item/mod/recipe catalog, and calculation worker. They use fixed expected probabilities rather than importing the calculator as a test oracle. All donors are already prepared; rolling, annulling, costs, and retries are excluded.

## Common crafts

| Craft | Expected modeled result | Regression covered |
| --- | --- | --- |
| Zodiac Leather with isolated T1 suppression + Necrotic Armour with isolated Screaming Essence of Rage Strength | 100% suppression retention; 50% on Necrotic Armour | Same-side NNN count contribution, removal on both bases, unconditional base filtering |
| The same transfer from STR/DEX Triumphant Lamellar | 83.25% suppression retention; still 50% on Necrotic Armour | Strength can survive on the STR/DEX donor; an essence is not automatically NNN on every output |
| Generic INT body armours with Resplendent + Unfaltering and Resplendent + Seraphim's | 30.6931% for exactly all three ES prefixes | Generic base mod eligibility, distinct defence groups, duplicate prefix counted once in the output |
| Spine Bows with Carbonising + Crystalising and Carbonising + Vapourising | 30.6931% for exactly all three elemental prefixes | Actual weapon mod tiers and overlapping prepared donors |
| Glorious Plates with isolated Prime life and of Tzteosh fire resistance | 33.3333% without preparation; 55.2775% with an exclusive suffix/prefix craft on the empty sides | Opposite-side exclusive craft benefit and automatic craft removal |
| Four single-prefix Spine Bows, preparing the two overlapping pairs and then combining their results | 5.5316% overall; 33% for the first pair | Earlier failures remain in the final distribution; selecting an earlier step changes the inspected results |

The life/resistance case also disables craft removal: requiring exactly those two natural mods gives 11.2225%, while allowing a surviving craft still gives 55.2775%.

## Sources and expected values

The [single-mod transfer guide](https://www.reddit.com/r/pathofexile/comments/1ljll69/using_recombination_and_essences_for_guaranteed/) explicitly describes transferring suppression to Necrotic Armour, and why a STR/DEX donor loses the guaranteed retention. The [3.26 research discussion](https://www.reddit.com/r/pathofexile/comments/1lfyxxd/326_recombinators_analysisguide/) describes opposite-side exclusive crafts and the use of two overlapping prefix pairs for a fixed three-prefix target. The ES and elemental bow cases apply that general recipe to the committed generated catalog.

These are regression expectations for the app's documented model, not new measurements of the game. It normalizes the empirical three- and four-affix count rows to 101 and assumes equal selection weight per ordinary input copy. Exclusive-craft calculations use the selected natural mods' spawn weights (1,000 for both life and fire resistance here), craft weight 1,000, and equally likely affix order.

- Prepared overlapping pairs have four prefix copies and three distinct groups: `31 / 101 = 30.6931%` for three output prefixes.
- The full bow plan succeeds when both pairs succeed, or one pair succeeds and the other retains the missing element: `0.33² × 31/101 + 2 × 0.33 × 0.335 × 10/101 = 5.5316%`. It does not assume successful pair preparation on every attempt.
- The mixed-base suppression case is `0.5 × 1 + 0.5 × (0.33 + 0.67/2) = 83.25%`. Requiring Necrotic Armour retains the original 50% base-selection probability.
- For the equal-weight exclusive-craft setup, both natural mods survive with probability `0.33 + 0.335 × 0.665 = 55.2775%`. Keeping exactly those two without stripping crafts gives `0.335² = 11.2225%`.

The existing axe cases cover Flaring retained alongside an essence NNN prefix with zero, one, or two suffixes, plus same-side exclusive suffix crafts. Influence, fracture, and drop-exclusive transfer recipes remain outside this catalog-driven suite.
