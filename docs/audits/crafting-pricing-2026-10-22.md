**Crafting pricing coverage audit — 22 October 2026**

Three review agents audited the configured presets, crafting methods, and pricing/ingestion infrastructure. The parent review verified live sources and existing tests. Scope is the repository configuration at `9894e3dd0c6bbfa149ff3aa7f0c4efff522af2f6`, including all ten PoE 1 presets and both games' current workbench catalogs. This does not include private account-saved projects. Current catalogs match retained revision r7: PoE 1 `3.29.3.3`, PoE 2 `4.5.5.4`.

The largest gaps are stale development exchange quotes, almost entirely unavailable development PoE 2 exchange pricing, and equipment coverage that supports only **3 of the presets' 27 purchase inputs**. There is also a reproducible graph-editor omission for bench-removal fees. Unknown prices are generally preserved as unknown; initial empty prices are intentional.

**Live source checks**

Checks completed at approximately 16:30 AEDT on 22 October. Exchange requests used chaos accounting with `reference-currency-v1` enabled. The comparison hour was 04:00–05:00 UTC that day. The [machine-readable results](crafting-pricing-2026-10-22.json) retain the exact scope, timestamps, counts, and examples.

| Configured consumable coverage | PoE 1 PC / Allflame | PoE 2 / Forbidden Rites |
| --- | ---: | ---: |
| Canonical consumable IDs audited | 254 | 530 |
| IDs with positive traded volume in the sampled GGG hour | 158 | 336 |
| IDs with a direct chaos pair, including chaos itself | 154 | 251 |
| Quotes returned by the development API | 196 | 1 |
| Inputs reported missing by the development API | 58 | 529 |
| Missing inputs that traded in the sampled GGG hour | 10 | 335 |
| Dates of returned market observations | 8–9 October | None |

The sole PoE 2 quote is the identity conversion of chaos to itself, requiring no captured observation. The PoE 1 API returns more quotes than the single current-hour sample because it selects older observations independently for each pair. Absence from one GGG hour does **not** prove an item is permanently unavailable. The official feed provides completed-hour trade history, rather than current offers. [GGG exchange documentation](https://www.pathofexile.com/developer/docs/reference#currencyexchange).

Ten PoE 1 inputs were missing locally despite trading in the sampled upstream hour: Blacksmith's Whetstone, Abrasive Catalyst, Screaming and Shrieking Essence of Contempt, Wailing Essence of Anger, Screaming Essence of Rage, Deafening Essence of Anguish, Deafening Essence of Dread, Frigid Fossil, and Deft Fossil. Screaming Essence of Rage directly affects the suppression-chest preset. This establishes a coverage difference, but does not prove its exact cause; capture scope, lag, direct pairs and conversion constraints require operational diagnosis.

The development `/api/v1/server/status` endpoint returned HTTP 500, while its exchange lookup returned HTTP 200. The production hostname did not resolve from the audit environment. Consequently these live findings describe **development**, not a verified production outage or production data inventory.

Equipment lookup also succeeded in development. Necrotic Armour returned a compatible chaos quote dated 9 October at 10:00 UTC. Helical Ring returned the correct cohort at the same timestamp, but only divine prices; the chaos lookup explicitly refused it with “No asking price in chaos is available for this cohort.” This directly confirms both the age and accounting-currency limitations for the otherwise supported preset inputs.

Live poe.ninja Allflame checks found positive quotes and listings for Craicic Croaker, Mountain Lynx, Wild Bristle Matron, and the exact tier-three Locus of Corruption temple. Core beast/temple identities therefore are not the immediate missing mapping. These feeds expose current listing estimates; the documented public API does not make them historical completed-sale data. [poe.ninja API documentation](https://poe.ninja/docs/api).

**Preset-by-preset purchase coverage**

Every purchase was checked against all 50,423 committed cohorts using the current engine and shared coverage function. Enabling the display-equivalent donor assumption added no matches. “Covered” below means the configuration can represent the purchase; a matching stored observation in the chosen realm, league and currency is still required.

| Preset | Covered purchases | Missing equipment prices | Additional assumptions |
| --- | ---: | --- | --- |
| Life on block shield | 0/3 | Shaper Heat-attuned shields with isolated T1 block / maximum resistance; Shaper Pinnacle life-recovery donor | Recombination service |
| Energy shield on block shield | 0/4 | Four Shaper Titanium donors: flat ES, percent ES + NNN evasion, flat ES + recovery, block + NNN evasion | Recombination service |
| Tailwind and Elusive boots | 0/2 | Unrolled Hunter Two-Toned Boots; prepared Redeemer Onslaught + Elusive donor | Imprint beast recipe with rare-beast assumption; 13 exchange cost IDs |
| Physical bow | 0/3 | Isolated Merciless, Dictator's and Flaring Spine Bow donors | Recombination service |
| Elemental bow | 0/3 | Isolated Carbonising, Crystalising and Vapourising Spine Bow donors | Recombination service |
| Suppression chest | 1/2 | Unrolled Zodiac Leather; ordinary Necrotic Armour has a cohort | Recombination service; four exchange cost IDs |
| Global defence chest | 1/2 | Grasping Mail with isolated `BreachBodyAllDefences1`; ordinary Necrotic Armour has a cohort | Recombination service; three exchange cost IDs |
| Rarity helmet | 0/4 | Hubris Circlets with isolated Janus rarity, ordinary rarity, life and chaos resistance | Recombination service |
| Triple energy shield chest | 0/3 | Three prepared Vaal Regalia donors: flat ES, percent ES + NNN, hybrid ES + NNN | Recombination service |
| Strength-stacking Helical Ring | 1/1 | No structural purchase gap for the ordinary ring | Imprint beast recipe with rare-beast assumption; ten exchange cost IDs |

The compatible purchases are the two Necrotic Armour inputs (`base:necrotic-armour:86-100:any-links`) and the Helical Ring (`base:helical-ring:85-100:any-links`). The Helical preset is the only preset structurally able to obtain every modeled price from existing automatic sources after explicitly selecting the rare-beast assumption, subject to live coverage.

The generator omits Spine Bow, Zodiac Leather, Hubris Circlet and Vaal Regalia entirely. It selects only the three highest-drop-level bases in each equipment/defence group, plus explicit additions. Influenced inputs are excluded, so the seven shield inputs and two boots purchases cannot match. Natural T1/T2 modifier cohorts cover fractures; the preset donors are unfractured. Curated donor coverage is limited to three Temple glove suffix families and a Grasping Mail lightning-resistance/critical-chance suffix, which is different from global defences. [Base selection](../../apps/poe.boats/scripts/generate-market-cohorts.ts#L43), [fracture generation](../../apps/poe.boats/scripts/generate-market-cohorts.ts#L149), [curated donors](../../apps/poe.boats/scripts/generate-market-cohorts.ts#L197).

Preset definitions: [shields and main presets](../../apps/poe.boats/app/lib/crafting-presets.ts#L215), [boots](../../apps/poe.boats/app/lib/crafting-preset-boots.ts#L29), [Helical Ring](../../apps/poe.boats/app/lib/crafting-preset-helical.ts#L89).

**Concrete implementation gaps**

1. **Successful refresh has no freshness requirement.** Equipment and exchange queries select the latest observation at or before the cutoff, without an age limit or ingestion-health check. This is observable in development: all 195 dated PoE 1 quotes were from 8–9 October, despite the successful 22 October lookup. Add an explicit age/coverage policy and report stale bindings separately from current quotes. Historical snapshots also carry preceding observations across capture gaps; their acceptable age needs a defined policy. [Exchange query](../../apps/poe.boats/app/db/queries/crafting-exchange.queries.ts#L92), [equipment query](../../apps/poe.boats/app/db/queries/crafting-market.queries.ts#L53).

2. **Bench replacement fees can be impossible to price through the graph editor.** The graph's price list calls `engine.costs(method)` without an item. Replacing a crafted modifier or flask enchantment can additionally consume removal currency, which the item-aware execution charges. Reproduction: start with prefix `bench:77`, apply suffix `bench:78`, and price every displayed input. The displayed list contains one Transmutation; execution spends one Scouring and one Transmutation. The completed graph correctly returns `meanCost: null` and missing `CurrencyConvertToNormal`, but does not add the missing price row. Enumerate potential replacement costs or expose actual missing costs as editable fields. The standalone workbench already accounts for this in its price list. [Graph enumeration](../../apps/poe.boats/app/components/crafting/graph-project-editor.tsx#L177), [actual fee](../../apps/poe.boats/app/lib/crafting-engine.ts#L3600), [workbench handling](../../apps/poe.boats/app/components/crafting/workbench.tsx#L418).

3. **Automatic lookup is not connected to standalone workbench pricing.** The graph has exchange and source pickers; the standalone workbench accepts custom chaos amounts and an optional starting-item cost. Its existing source capabilities do not automatically populate these fields. This affects all workbench method families. A blank starting-item cost is explicitly excluded, so these workbench totals can represent consumables only. [Workbench price controls](../../apps/poe.boats/app/components/crafting/workbench.tsx#L1610), [graph price pickers](../../apps/poe.boats/app/components/crafting/graph-project-editor.tsx#L625).

4. **Equipment listing currencies are not converted.** A divine-listed item cannot supply a chaos graph merely because a divine/chaos exchange quote exists. Lookup requires a price in the selected currency. The development Helical Ring lookup exhibited this exact limitation. Add conversion with time-aligned provenance if this limitation is to be removed. [Currency requirement](../../apps/poe.boats/app/db/queries/crafting-market.queries.ts#L110).

5. **Generated purchases share prices too broadly.** Different generated rare items use the same `generated:rare` cost key. A body armour and a ring therefore cannot carry distinct generation assumptions within one graph. Recombination similarly has one global service assumption, even if different steps warrant different gold/dust costs. [Generated/service keys](../../apps/poe.boats/app/lib/crafting-engine.ts#L3640), [global spending lookup](../../apps/poe.boats/app/lib/crafting-graph-trial.ts#L103).

6. **Legacy resonator choices have unresolved price availability.** All 16 extracted resonators are selectable, including duplicate names under legacy `DelveSocketableCurrency*` and stackable IDs. Only the four stackable chaotic variants had development quotes and traded in the sampled upstream hour. All eight legacy IDs and four stackable alchemical IDs lacked both in this check. Distinguish obsolete identities from temporary low-volume gaps; do not substitute prices by display name without validating equivalence. [Picker filter](../../apps/poe.boats/app/components/crafting/method-picker.tsx#L87).

**Full catalog coverage and intentional limits**

| Supported family audited | PoE 1 | PoE 2 | Pricing route |
| --- | ---: | ---: | --- |
| Currency methods | 83 | 99 | Canonical exchange IDs |
| Essences | 106 | 94 | Canonical exchange IDs |
| Bench recipes | 761 | 0 | Currency quantities, including conditional removal/surcharge costs |
| Harvest recipes | 57 | 0 | Lifeforce and sacred lifeforce |
| Beast recipes | 37 | 0 | 24 mapped whole recipes; 13 level-sensitive/manual |
| Anoint/instil recipes | 576 | 875 | Oil/emotion quantities |
| Named supported fossils | 25 | 0 | Fossils, resonators, optional sulphur |
| Socketable augments / upgrades | 0 | 303 / 1 | Canonical augment IDs |
| Locus | 1 | 0 | Exact temple source |
| Generated rarity methods | 3 | 3 | Manual generation assumptions |
| Genesis / recombination | 1 each | 0 | Manual input/service assumptions |

The census also includes 33 supported PoE 2 omens and auxiliary consumables. Combinations of fossils, omens and Allflame options are not counted as separate recipes. Reveal and jewel socket/removal operations have no consumable cost except applicable reveal omens. Validation deliberately excludes four unsupported bench recipes, one unsupported PoE 2 essence and nine unsupported special augments. Every one of the 254/530 canonical cost IDs resolves to extracted base-item data; this is identifier integrity, not proof of trading activity.

The committed equipment manifest contains 20,008 clean-base cohorts, 27,999 fracture cohorts, 604 broad donor cohorts and 1,812 affix-count donor cohorts. These cover 339 distinct base names. Of 1,370 non-Royale, non-corrupted, rare-capable catalog base names, 1,031 have no cohort; this denominator excludes magic-only categories such as flasks. Jewels/cluster jewels, flasks, maps, Heist items, logbooks and strongboxes lack generated equipment cohorts. A wider retained capture archive does not itself provide prices, and ordinary unselected bases may not be retained. [Manifest](../../packages/poe-market/data/cohorts-poe1.json), [capture policy](../../packages/poe-stash-ingest/src/ps/crafting-capture.ts#L44).

Other explicit limits:

- PoE 2 equipment is manual. Nonbaseline quality, modified implicits, enchantments, imprints, memory strands and unsupported prepared states also require manual prices or separate preparation steps. Complex logical requirements may not be provable by a cohort. [Prepared-state guard](../../apps/poe.boats/app/lib/crafting-market.ts#L35).
- Thirteen beast recipes need level-specific prices: eleven flask recipes and two prefix/suffix conversions. The other 24 have complete component mappings, but require the explicit Mountain Lynx assumption for additional rare sacrifices and positive prices for every component. There is no captured beast/temple history; historical snapshots correctly return a gap. [Source rules](../../apps/poe.boats/app/lib/crafting-sources.ts#L61), [historical refusal](../../apps/poe.boats/app/operations/crafting-market.server.ts#L131).
- Arbitrary crafted output/recovery sale values remain manual. Asking-price summaries are not completed-sale valuations, and confidence scores are not calibrated sale probabilities. [Sale price control](../../apps/poe.boats/app/components/crafting/graph-outcome-editor.tsx#L113).
- The Helical preset obtains strands through paid Remembrance steps; it does not omit a separate prepared-ring purchase. Prepared NNN donors are already purchased whole. Adding essence costs without replacing their purchase assumptions would double-count preparation. All preset purchases have default zero quality; quality finishing and links are outside their current targets.

**Recommended order**

First diagnose development ingestion coverage and add stale-price handling, especially for PoE 2. Then fix the hidden bench-removal price input and add the unrolled Zodiac Leather cohort. Next add preset-specific influenced/isolated donor cohorts or model preparation from priceable bases. Connect automatic lookup to standalone workbench prices, then consider currency conversion, per-input assumptions and historical supplemental sources. Keep intentional manual costs explicit throughout.

**Verification**

All ten preset graphs were constructed and checked against the complete committed cohort manifest. Catalog method/cost IDs were enumerated through the engine, and the hidden bench fee and shared generated-price key were reproduced. Sixteen focused suites passed: **160 tests** covering market bindings, exchange, supplemental sources, price UI, starting/trial costs, Harvest, anointing, Allflame, fossils, socket bench, augments, omens and bench replacement. Initial Windows sandbox cache failures were resolved by running in the permitted context; six missing-history-fixture failures passed after the repository's history preparation command. No application behavior was changed.
