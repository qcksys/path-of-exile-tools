# Maintaining feature parity

The app uses React Router framework routes (the Remix successor) on Cloudflare Workers. `/api/*` is a resource route that forwards the original Web Request to `OpenAPIHono`; `/mcp` uses the SDK's stateless Web Standard Streamable HTTP transport. The existing `/api/auth/*` and `/api/stash-ingest` routes remain more-specific resource routes.

The ingestion service endpoint also stores immutable stash cursor checkpoints and one compressed
daily response per realm/league. Its authenticated GET supports paginated metadata and single-sample
reads for the ingestion CLI. These contain raw stash/account data and are service-only, outside the
public UI/HTTP/MCP operation catalog. `validate-replay` is read-only. Historical cursor restoration
and its upload streams have been removed; old staging databases cannot publish or become live workers.
The service-only `probe-replay` CLI compares full/selected-field hashes across a bounded page range;
it neither publishes market data nor changes cursors or samples. The worker archives selected
crafting-input records from its configured league locally before price classification, independently
of the price projections. It retains full selected item details and tracked-stash removals, not the whole feed.
Its `capture-status` CLI reports archive counts and sizes; the archive is not exposed through public APIs.
The owning worker can reclassify the last 24 completed capture hours after a cohort manifest revision
changes. It processes up to five archived pages per cycle after exchange capture, newest hour first,
so missing older payloads do not block replayable newer hours. Missing payloads still fail without
marking their hour complete. It publishes each completed hour atomically with its original
observation times. This does not replace active
listings or cursors, expose raw archive records, or create uncaptured history. Existing market
history and pricing operations consume the corrected revision through the normal delivery path.
Live stash capture checkpoints between committed pages before requesting the next page,
releasing accumulated indexes while retaining atomic page writes and cursor advancement.
A failed page checkpoint stops capture before the next request; the saved cursor remains retryable.
With `PS_CHECKPOINT_THRESHOLD` set, pages are not checkpointed individually; DuckDB checkpoints
once its WAL reaches that size.
The PoE 1 pipeline checkpoints committed writes before replay so capture indexes do not
exhaust the memory needed for publication. Failed checkpoints defer replay while pending
delivery remains eligible; a failed rollback stops the process before checkpointing.

Source-preparation models 3 and 4 check Intangibility in captured item properties as well as
top-level fields. Positive or uncertain persistent state cannot be priced as the preset's
ordinary preparation source. Resolved incompatible fractures are excluded before source
projection; unresolved facts cannot establish a positive match. Modifier-text model 5 distinguishes complete unsupported
multi-line modifiers from ordinary explicit affixes that share one of their lines;
implicit magnitude safeguards remain conservative. Earlier model formats retain their
classification behavior, and replay publishes corrections under the new manifest revision.
Model 4 additionally recognizes a sole invariant literal fracture beneath a known defence-magnitude
enchantment when its paid source preparation removes that enchantment. Numeric or scalable fracture
text, competing identities, implicit magnitude effects and unsupported state remain uncertain.
The original captured item and ordinary cohort classification remain unchanged.

Source-preparation model 6 additionally proves clean uninfluenced Heat-attuned Tower Shields
with their exact native Scorch implicit and includes native-empty Vaal Regalia Scouring sources.
Crafting revision r16 adds a shared, paid influence route for the Life shield's Heat-attuned
checkpoints and four paid Vaal Regalia cleanup alternatives for the Triple ES preset. Cleanup
charges craft removal, enchantment removal and Scouring where applicable; adding influence
charges Transmutation, Regal, Shaper's Exalted and a final Scouring Orb. Earlier revisions and
source models retain their original eligibility, and unknown or incompatible state stays unpriced.

`app/operations/registry.server.ts` assembles the feature operation catalogs. HTTP routes, OpenAPI, MCP tool registration, and `/integrations` all read that catalog. A registration points at the function the normal UI uses; it is not an alternative implementation. Pure calculations can run locally in the browser, including the recombinator's Web Worker, without an HTTP round trip.

## Coverage

Season market browsing uses a parent layout and outlet with separate list and item-history
routes. Each category list lives at `/1/market/:category`; the web has no all-items list, so
`/1/market` redirects to `/1/market/currency` with its filters, and legacy `?category=` links
redirect to their category path. Legacy `?item=` bookmarks redirect to `/1/market/items/:item`
with all variant axes intact; item links keep `category` in the query for the way back. The item
page lists every variant of the item in the period (corruption and extracted signatures such as
Foulborn mutated modifiers) and links between them, including the same unique's markets in the
other identification state (unidentified uniques are keyed `unid:<icon>`). Foil and non-foil
listings of an item are one stored market, with no separate foil prices. Uniques are also stored by `links`, as poe.ninja splits
body armours and two-handed weapons: 5 or 6 for the largest linked socket group, otherwise 0. The
list merges every link count into one row; on the item page, a market with 5- or 6-link copies
lists its merged variant ("Any links", the default without a `links` filter) and each link count
("0–4L", "5L", "6L"), which combine with corruption and signature splits (e.g. Atziri's
Splendour [Armour] 6L). The `links` filter (`0`, `5` or `6`) selects one in history; list and
history rows omit `links`, and variants carry it (null when merged). Rows ingested before the
split, and listings whose stash has not been re-sent since, count as 0.
Each variant carries its `latestHour` in the period with that hour's `listingCount` and `prices`;
the item page shows the most listed currency's median beside each variant, and lists more than
20 variants as a searchable table grouped by state, or by class and ascendancy for Forbidden
Flame and Flesh. Those two jewels have their own `forbidden` category (left out of `jewels`),
which pairs them by notable under each class and ascendancy with the pair's combined price and
likely sales, sorted within each ascendancy by the list's `order` and with each jewel's recent sales
bars; the notable-to-ascendancy table in `app/data/ascendancy-notables-poe1.json` comes from GGG's passive
tree export (`vp run game-data:ascendancies`).
Stash markets are also stored by `tab`: `merchant` for Faustus's merchant tabs (the public stash
API's `stashType` `TradeStash`, where every item has a `~b/o` price and sells without contacting
the seller), `other` for every other public tab, and empty for rows ingested before the split,
which mix both. Every stash-based view (the list, item pages and their variants, history, mod pool
values, and stash commodity prices in crafting) shows merchant tabs unless the `tab` filter
("Stash tabs") picks `other` or `all`; only `all` merges every kind, including the empty rows, so
earlier history shows only there. Likely sales compare a removal only with other sellers' listings
in the same kind of tab. Crafting base cohorts count merchant tabs only and have no tab filter;
cohort hours delivered before the split mix both.
Items on the currency exchange get their own table in each category, dearest first, and leave
their stash listings out of the rows. Each row's price is the latest completed hour's chaos rate
(direct, or through divine, exalted or another traded item in that hour); without one, it is the
volume-weighted rate of the newest of the last 7 UTC days the item traded, marked as not current
with its last traded hour. Stash prices never convert at such an earlier divine rate. Rows also
carry each of those days' chaos price and the change across them, the chaos value traded per hour
over them, and the pair with the most units of the item traded at its newest rate. Values follow
the shared value display (adaptively, in chaos or in divine). Each row links to
`/1/market/exchange/<item ID after Metadata/Items/>` (`get_season_exchange_item`), which shows the
same row and the item's hourly chaos price and per-pair rates over the list's period, each with the
hour's lowest to highest traded rate as a shaded range (a converted price scales its pair's range
by the bridge item's chaos price), the lowest rate as a line, and `p25`/`p75`, an interquartile
range estimated from those rates and the volume-weighted rate as a triangular distribution (null
at 8 units or fewer, since the exchange digest has no individual trades). The history reads the item's chaos, divine and exalted pairs,
its eight other most traded pairs and the chaos markets that convert them. List filters stay in
the query for the way back. Exchange rows and history give amounts as `price` in the currency
named by `unit` (`exchangeUnit` on `get_season_market`).
The PoE 2 market at `/2/market/:category` (`get_poe2_season_exchange`) lists only the currency
exchange, since PoE 2 has no public stash data. It prices the same rows in exalted (direct, or
through divine, chaos or another traded item) and shows values adaptively or in exalted, chaos,
annul or divine. Its categories are the trade site's PoE 2 bulk exchange groups, generated into
`app/data/exchange-categories-poe2.json` by `vp run game-data:exchange-categories`; traded items
outside every group list under Other. Seasons come from the exchange alone and leave out private
leagues (names ending in ` (PL<id>)`); leagues sharing the latest hour list the most active first. Item pages live at
`/2/market/exchange/<item ID after Metadata/Items/>` and call `get_season_exchange_item` with realm
`poe2`. `/1/market` links with realm `poe2` redirect there, searching for their item.
Uniques whose mods come from a pool (ingest's `MOD_POOLS`: Watcher's Eye's aura mods, PoE 2
Loreweave's borrowed unique mods) are not priced by combination. Each listing counts once in the
item's market, with an empty `value`, which the category list and the item's variants show, and,
when it has at least two recognised mods, once at its full price in a market per masked mod and
mod count (`3 mods: Haste: You have Phasing`). Per-mod totals therefore exceed the item's, and a
mod's price includes the value of the mods alongside it. Every page of a pool unique, and the market
operation's `modValues`, list those markets with the same corruption: listings, cheapest and median
ask in the latest hour, likely sales and the median last ask before them over the period, in the
display currency. Each links to its own history.
Weapon, armour, accessory and flask categories list uniques only. Normal, magic and rare equipment is
listed under the Crafting bases group (`armour-bases`, `weapon-bases`, `accessory-bases`,
`flask-bases`, `cluster-jewel-bases`) from
`stash_poe1_cohort_hourly`: each base cohort the generator writes to
`packages/poe-market/data/market-bases-poe1.json` (item level 74 and up; bases that can reach six
sockets, body armours and two-handed weapons (`MARKET_BASE_LINK_CLASSES`), split into 1–5 and 6
links; armour also at ilvl 86+ with 25%+ and 30%+ quality) at its latest hour in the period, as
the newest catalog revision classified it. Cohorts hold uncorrupted, unmirrored, unfractured,
unsynthesised, uninfluenced items with no Intangibility (the item query's `intangible` flag); each
base row carries its level requirement (`level`, null for Cluster Jewels). Rarities are not split. Item level bands
start where the base's rare modifier pool changes. From ilvl 74 each base lists at most three
bands: of the levels that unlock at least a tenth of the top-tier (T1) spawn weight the base gains
above ilvl 74, the two highest split off and lower levels group together
(`significantLevelBands`), so each base type gets its own breakpoints (Focused Amulet: 74–83, 84,
85+; Stygian Vise: 74–84, 85, 86+; most weapons 74–81, 82, 83+). `flask-bases` lists every
utility flask and the three highest life, mana and hybrid flasks with fixed bands instead:
utility flasks 74–79, 80–83, 84 and 85+ (T1 Alchemist's at 80; Experimenter's, Armadillo and
Impala at 84; of the Cheetah at 85), other flasks ilvl 83+ only; its `baseClass` values space the game data's
flask classes (`Life Flask` for `LifeFlask`). `cluster-jewel-bases` lists
normal, magic and rare Cluster Jewels by size, added small passive skill (the first `Added Small
Passive Skills grant:` enchantment line, matched by the item query's `enchant` condition), passive
count and poe.ninja's item level bands (1–49, 50–67, 68–74, 75–83, 84+). Base rows have no
likely-sale estimates; they sort, search and range-filter in memory, with prices compared in
chaos, and filter by `baseClass` (item class; a Cluster Jewel's size), `attributes` (required
attributes, e.g. `str-int` or `str-dex-int`), `ilvl` (the band includes that level), `baseLinks` and `quality`.
The unique weapon, armour, accessory and flask categories also filter by `baseClass` and (armour)
`attributes`, matching each unique's base type through the generated
`public/game-data/market-base-types-poe1.json` (base type name to item class and attribute set).
List rows carry `recentSales`: likely sales in each of the 24 hours to the season's latest hour
(read through `idx_stash_unique_item` for the page's items) and on each of its last 7 UTC days
(`stash_market_daily`); the list charts them as 6-hour, 1-day and 7-day bars. Exchange rows of
both games' lists carry `recentVolume` the same way, as units of the item traded over all its
markets: hourly from `stash_*_currency_hourly` for the markets of the items the list shows,
daily from `stash_*_currency_daily`. The exchange table charts them in place of the 7-day price
trend line and notes the 7-day change under the value; the item page keeps the trend.
Each base row links to `/1/market/bases/:base` (`get_season_market_base`), the cohort's hourly
asking prices and listings over the period and every listed cohort of the same base type (and
Cluster skill) at its latest hour.
PoE 1 skill gems are captured from public stashes and keyed by `typeLine`, so transfigured gems
are their own items; a Vaal gem whose skill is transfigured is keyed as the trade site names it
(`Vaal Arc (Arc of Surging)`). `vp run game-data:gems` writes
`packages/poe-market/data/gems-poe1.json`: transfigured gems from the trade site's item list, and
Vaal gems from the game data's `vaal_gem` base item tag plus their transfigured forms (Vaal
Sacrifice and Vaal Temptation supports are not Vaal gems). Regenerate it when a league adds
transfigured gems. The game files give each gem effect a style (`GemEffects.ItemColor`:
transfigured X, Y or Trarthan, exceptional, default) but no source such as Heist or the
Labyrinth, and stash items do not record one. Each gem lists one market per level band, quality band and corruption state
(`signatureKind` `gem`, `signatureValue` like `Level 20 (max) · Quality 20%`). Level bands are
below, at and above the gem's maximum level: 1–19, 20, 21 for normal gems, 1–2, 3, 4 for gems with
the Exceptional gem tag, 1–3, 4, 5 for awakened exceptional gems (Awakened Empower, Enhance and
Enlighten), and 1–4, 5, 6 for other awakened gems; the max band says `(max)` so the tiers' bands
never share a value. Quality bands are 0–19%, 20% and 21–23%. Gem
markets belong to Skill gems whatever their base type. The Skill gems list replaces its corruption
select with tri-state toggles for each level band (Under Max, Max and Over Max, which match each
gem against its own tier's levels), each quality band, corruption, transfigured and
Vaal (include, exclude or neither; `gemTransfigured` and `gemVaal` are `all`, `true` or `false`); `gemLevel` and `gemQuality` hold the bands as `20,-21` (band tokens are a
normal gem's: `1-19`, `20`, `21` and `0-19`, `20`, `21-23`), and links to other categories drop
them.
PoE 1 tier maps (`Map (Tier 1)` to `Map (Tier 16)`) and Nightmare maps are captured from public
stashes, keyed by base type whether identified or not; unique maps stay keyed by name, and blighted
maps (type line `Blighted …` or `Blight-ravaged …`, same base type) are not captured. Both bases
belong to Maps, though their item class is `MapKey`. Each lists one market per corruption state and
variant (`signatureKind` `map`, `signatureValue` like `8 mods · Quantity 100–119% · Delirium 40%`):
mod count band 1–6 (normal maps included) or 8 (7 counts as 8), delirium 0–100% in 20% steps from
the `Players in Area are N% Delirious` enchant, and on tier 16 and Nightmare maps the Item Quantity
band (0–59%, then 20% steps to 200%+). An influence implicit appends `Shaper`, `Elder`,
`Elder Guardian` (any of the four guardians, which a Blessed Orb rerolls) or `Memory` (the
Originator's Memories). A rare map's random name is not stored. Unidentified maps show neither mods
nor quantity, so their value is `Unidentified · Delirium N%`; the identification is in the value so the rollup, which
groups by item key and signature, keeps the `identified` column true to each market. Several map
mods show two or more lines, so the mod count matches lines to the multi-line map mods of the game
data (`vp run game-data:maps` writes `packages/poe-market/data/maps-poe1.json`) and takes the
fewest mods that explain them. The Maps list adds tri-state toggles per band; `mapMods`,
`mapQuantity`, `mapDelirium` and `mapInfluence` (`none`, `shaper`, `elder`, `elder-guardian`,
`memory`) hold them as `8,-1-6`, and links to other categories drop them. A map's item page reads
the same parameters, plus `identification` and `corruption`, to narrow its variant table in the
browser; its loader ignores them and `shouldRevalidate` skips it when only they change.
The shared market query applies category, text, identification, corruption, gem and map bands,
column ranges and ordering before pagination. Without a `corruption` filter, the unique weapon, armour and
accessory categories list uncorrupted markets and every other category lists any corruption; the
category links clear the search text and the base filters, and carry a corruption choice only
when it differs from the current category's default. Identification and corruption apply only to
categories whose markets split by them (`marketHasIdentification`/`marketHasCorruption`: unique
equipment, flasks, jewels, tinctures, relics, maps, Other items and `all`, plus skill gems for
corruption); elsewhere the filter is hidden and the query and returned `filters` use `all`. The list's TanStack Table headers sort through `order` and filter
through the URL: the item column sets the text search, and range boxes bound the latest row's
selected-currency median, listings and sellers, and the period's likely sales. The item page's
hourly table searches, filters and sorts its loaded rows in the browser. Categories use the verified per-game base catalog, grouped like
[poe.ninja's economy navigation](https://poe.ninja/poe1/economy); unknown bases remain in Other items.
Price ordering compares only the selected original currency, with missing quotes last.
The item chart plots each hour's min, interquartile (above 8 observations) and average asks and
likely sales, total, new, likely sold and delisted listings (removals that are not likely sales,
relists or pending), and `soldAgeSeconds`, the likely sales' average time from first seen to removed.
Item history keeps the per-currency hourly summaries (count, min, mean, p10–p90 quantiles, max;
older rows lack mean and quantiles) and adds `merged`/`mergedSales`: each listing currency
converted to chaos at read time with that hour's same-league exchange rate (direct, or via divine),
reusing the latest rate up to 24 hours old, then into `historyUnit` (the game's first price
currency: chaos for PoE 1, exalted for PoE 2), whatever the display currency. The merged
distribution is the listing-count-weighted mixture of the per-currency quantile curves, so it is
exact for one currency and an estimate otherwise; listings without a rate are counted as
`unconverted`. Each hour's `priceRates` give the game's price currencies (PoE 1 chaos and divine;
PoE 2 exalted, chaos, annul and divine) per `historyUnit` at that hour. Crafting base history
(`get_season_market_base`) merges the same way into `historyUnit` with per-hour `priceRates`.
Every market page shares one value display (`ExchangeDisplayPicker` and `ExchangePrice` in
`app/components/market-exchange.tsx`): Adaptive (divine from one divine up, otherwise the
exchange unit, with the other as `≈`) or one of the game's price currencies, e.g.
`1,132.67 divine ≈ 384,214 chaos`. The choice is held by `MarketDisplayProvider` in each game's
market layout, so it carries between that game's list, item, base and exchange pages and stays
separate for `/1` and `/2`. Exchange rows, stash listing prices (each listing currency's median
converted through chaos, noting the listed amount when shown in another currency), the item and
base history charts (plotted in the chosen currency at each hour's rate) and hourly tables all use
it. Its rates are `priceRates` on `get_season_market` (stash rates at the season's latest hour,
else the exchange's), `get_season_market_base`, `get_season_exchange_item` and
`get_poe2_season_exchange` (from the exchange rows' prices).
The HTTP and MCP market operation exposes the same filters and category assignments, and still
accepts `category=all` for every category at once. With an `item`, it returns that item's history
and variants only (`rows` is empty), skipping the list query.
Period windows start at UTC midnight of their first day, so a 7-day window covers between 7 and
8 days of observations.

CI runs app tests in four shards and workspace package tests in a separate required job.
The workbench UI suites are grouped by behavior so individual files can run on different
workers; shared fixture catalogs are parsed once per test file. Browser cases use isolated
page state and run across two shards with one worker each. CI starts the prebuilt server,
retains per-shard timings and failure traces, and combines the browser reports. Updated
pull requests cancel obsolete validation runs; branch deployments remain serialized.

Item artwork and picker descriptions are presentation metadata. The verified crafting catalog exporter
also generates `items-poe1.json` and `items-poe2.json` from the extracted base and modifier datasets.
These browser catalogs share one request per game and provide GGG item artwork URLs, base levels,
attribute requirements and implicit descriptions. Pickers group equipment by type, then base level
and requirements; unknown drop restrictions are not inferred from tags or release-state labels.
Crafting calculations, saved item schemas and retained engine packages remain independent of this
presentation data. Graphs default to full width; width/fullscreen controls and empty initial selectors are browser UI state.
Item thumbnails also accompany recipe inputs and outputs, market rows and history, currency prices
and spending, crafting presets, socketed augments, recipe rings, scarab effects, process steps and recombinator results. Market
artwork uses the captured icon asset so unique variants keep their own art. Name-only recipe entries
resolve against the same per-game catalog; generic manual recipes label their artwork as illustrative.
Missing or failed images retain a thumbnail placeholder and the item label. Adjacent thumbnails are
decorative for assistive technology; item previews retain descriptive alternative text.
PoE 1 uses GGG's official image endpoint. PoE 2 uses the [PoE2DB artwork mirror](https://poe2db.tw/us/Rusted_Cuirass),
because the equivalent paths on the PoE 1 endpoint return 404. Both derive paths from the extracted
visual identity; artwork availability never changes item identity or crafting rules.

Crafting schemas publish named OpenAPI components for repeated item, modifier and method shapes.
The workbench project uses the same converter as other operations; embedding native JSON Schema
with root-relative `$defs` would produce invalid references inside the OpenAPI document. Contract
tests resolve every local reference and bound document size, while the production browser test
checks Scalar rendering at normal speed and fourfold CPU slowdown. The terminal target-depth
schema remains impossible (`not: {}`), matching its existing runtime `z.never()` validation.

The r9 Tailwind preset also offers an explicit Hunter-base preparation alternative:
buy uninfluenced Normal Two-Toned Boots, then Transmute, Regal, use a Hunter's
Exalted Orb and Scour. The shared preset builder retains the original purchase
choice and target; all four actions are charged by the existing graph runtime.
The source has its own exact canonical-base, level, rarity and influence cohort.
The Redeemer Onslaught/Elusive donor can use the same source acquisition: prepare a Redeemer
base, roll and isolate Onslaught, then Regal for Elusive. Misses pay for Scouring and rolling
again on the same influenced base. Both purchase options remain pinned until explicitly changed;
earlier preset revisions retain their existing routes. Sharing the ordinary source adds no cohort.

The r9 global-defence chest also offers paid Annulment isolation from three exact
Grasping Mail source states at item levels 84 and 85. Each has its own purchase
cohort and price; the original isolated-donor purchase remains selected by default.
Surviving global defences can be annulled again, while losing it discards the item
and buys another source. The existing recombination preserves the original target
and reaches item level 86. Earlier revisions and saved drafts remain unchanged.

The r14 RF helmet preset also offers paid preparation from a Royal Burgonet
verified by its Scouring source profile. The four cleanup profiles exclude
incompatible persistent state, including Eldritch implicits that prevent the
Hunter slam. Source cleanup, influence application and rerolls, Horror attempts,
the suffix lock and Scouring use the same graph runtime on all surfaces. The exact
prepared purchase remains the default; source quotes and preparation costs are
separate. Earlier revisions retain their routes.

The r14 rarity helmet preset also offers an isolated Magic Janus donor with its
own exact purchase cohort. It enters recombination directly and has the same
outcomes as the Rare donor. The original Rare purchase remains the default;
the Magic purchase must have its own quote, and no rarity conversion is charged.

| UI capability | HTTP family under `/api/v1` | MCP / shared implementation |
| --- | --- | --- |
| Server status, worker health, progress and stored league history | `server/status` | `get_server_status`; shared `getServerStatus`. Authenticated ingestion heartbeats report stages and committed progress without credentials, raw cursors or account data. Missing heartbeats and stalled stages are distinct from failures; stored coverage counts actual distinct hours from the `stash_hour_coverage` rollup. Optional `view=workers` reads worker reports and computes the same health without querying coverage; `coverage: []` means coverage was omitted, not that history is absent. Omitted `view` or `view=full` retains full coverage and the existing UI behavior. HTTP and MCP share this selection and validation. |
| Common craft presets in a new local project tab | `crafting/presets`, `crafting/graph/from-preset` | `list_crafting_presets`, `create_crafting_graph_from_preset`; shared `listCraftingPresets` and `projectFromPreset`. Fifteen PoE 1 examples include a Heist life-on-block shield with block and maximum resistances, an ES/block shield with NNN preparation, overlapping 2p + 2p bow/chest merges, rarity/life/resistance helmets and a Replica Alberon's Helical Ring with strand budgeting and imprint recovery. [Triple-elevated boots](crafting-preset-boots.md) include donor elevation, resistance, veiled movement speed and crafted life. [Five SpicySushiPoE samples](crafting-presets-spicysushi.md) add RF totem and Luminary block shields, an RF helmet, a fractured mercenary chest and Spectre boots, with real Allflame, fossil, influence and Eldritch steps. Hunter boots, suppression and global-defence donors include rolling and isolation from unrolled bases. Remaining prepared donors are explicit purchases with unknown prices; recoverable misses feed preparation inputs, and discarded items require fresh acquisitions. The nine recombination presets explicitly default to manual 0-chaos self-service, excluding gold and dust opportunity cost; the preset descriptions explain this assumption. Saved/manual prices and custom missing prices are unchanged. Presets create independent editable drafts. PoE 2 returns no presets and refuses PoE 1 recipe creation. |
| Graph outcome cards, line probabilities, item previews and automatic layout | Existing `crafting/graph/calculate`, `workspace/edit` | Opening or editing a project starts a bounded initial sample in the retained-engine worker; stale workers are terminated and late results ignored. Node cards show actual sampled modifiers and branch percentages, with unknown and observed zero distinct. Simple mode fits compact process icons and continuation percentages, with connection details on hover; detailed mode retains editable connection labels and manual positions. Final cards use trial probabilities. The r6 result includes the last sampled item at each visited node for the first three trials. Unsampled nodes only illustrate explicit modifier requirements; they do not invent blank crafting outputs. Pinnable popovers reuse the static `ItemCard`. Step, method, purchase and outcome editors remain inside scrollable graph nodes. Clicking away saves nested drafts through the existing operations and closes editing; invalid drafts remain open with their validation errors. Contextual help explains modifiers, conditions, connectors and sampled frequencies. Display modes, pointer/keyboard line bends and the active editor are local presentation state; they do not change graph semantics or calculations. Layout uses measured widths and heights, ignores recovery cycles, preserves manual positions until Auto arrange and provides step navigation for long chains. |
| Memory-strand graph conditions and Helical Ring checkpoints | Existing `crafting/items/match`, `workspace/edit`, `graph/calculate` | Shared item facts and range queries expose `memoryStrands` and `memoryStrandsSpent` since the current imprint. A missing imprint yields an unknown spending comparison. Engine r6 preserves essence-exclusive modifiers during Unravelling while attempting upgrades to eligible ordinary tiers. Revisions r1–r5 remain immutable; correction adoption is explicit. |
| Purchased Janus rarity helmets | Existing item preparation, `crafting/graph/from-preset`, `crafting/graph/calculate` | The shared engine accepts the extracted Janus unveiled suffix only on eligible helmets, treats it as exclusive during recombination, and preserves transferred level provenance. Ordinary and generic unveil pools cannot roll it. The rarity preset combines Janus with normal rarity, life and chaos resistance; recovery avoids combining duplicate exclusive donors. |
| Connected recombinator plan to a new graph tab | `crafting/graph/from-recombinator` | `create_crafting_graph_from_recombinator_plan`; shared `projectFromRecombinatorPlan` preserves all connected recombinations, distinct input acquisitions, bench preparation, conditional crafted-mod removal, the selected final step and modifier/base targets. Requires explicit concrete bases and minimum/maximum rolls; prices remain unknown. Browser previews before saving a new local tab. Custom modifiers, manual probability flags and idealized essence preparations are refused explicitly. The graph uses retained full-item crafting rules, so it does not claim identical odds to the standalone abstract model. |
| PoE 1 and PoE 2 arbitrage leagues, prices, recipes | `arbitrage/market` | `get_arbitrage_market`; `loadArbitrageMarket` prices recipe items by name from the game's PC exchange through `getMarketExchangePrices`, which shares `marketExchangeRows` with the season exchange list (latest-hour or newest traded day, bridged through divine). Unit tests cover league choice and unpriced categories; MySQL tests cover the price lookup. |
| Arbitrage filters, ranking, buffer, profit/ROI | `arbitrage/calculate` | `calculate_arbitrage`; `findArbitrage` |
| Manual recipe reference, calculator and trade links | `arbitrage/recipes`, `arbitrage/scenario`, `arbitrage/trade` | `list_vendor_recipes`, `calculate_recipe_scenario`, `build_recipe_trade_url` |
| PoE 2 exchange market by category | `market/poe2-exchange` | `get_poe2_season_exchange`; `getPoe2MarketExchange`, sharing `marketExchangeRows` (in exalted) and the season, search and ordering of the PoE 1 exchange rows. Unit tests cover exalted pricing and its divine-then-chaos bridges; UI tests cover the category list, value display, item page, redirects and refusals; HTTP/MCP parity covers success and an invalid category. Not yet covered against MySQL. |
| Season exchange item price, trend and pair history | `market/exchange-item` | `get_season_exchange_item`; `getMarketExchangeItem`, sharing `marketExchangeRows` with the list's exchange rows and adding the hourly `marketExchangeHistory` over the period (`days`). It reads only the item's markets and the chaos markets of the items it trades against. Unit tests cover latest-hour and earlier-day prices, conversions, trends, volume, pairs and hourly ranges; MySQL tests cover the daily rollup through ingest and the item read; UI tests cover the table, value display and item page; HTTP/MCP parity covers success and an invalid item ID. |
| Season crafting base history and variants | `market/base` | `get_season_market_base`; `getMarketBase`, reading the cohort's hours through `stash_cohort_history_idx` and its base type's listed cohorts with the list's `marketBaseRows`, preferring the current manifest revision per hour. Unit tests cover the base filters, descriptions and generated bands; MySQL tests cover history (merged into `historyUnit` whatever `currency` is), variants and revision choice; UI tests cover the list link, base page, variants and the way back; HTTP/MCP parity covers success and an invalid base ID. |
| Season market search, seasons, paging, variants, history, mod pool values | `market` | `get_season_market`; `getMarketData`, with mod values from the shared `modPoolValues`. Season boundaries use the existing index prefix; variant totals come from the `stash_market_daily` rollup and pagination precedes full-row primary-key reads. An item's foil and non-foil listings are one market: list rows, variants and history sum and mix every foil variation's hourly rows. Link counts merge the same way in list rows and in history without `links`; variants list each link count of a market with 5- or 6-link copies after its merged variant. Every read takes one stash tab kind (`tab`, merchant by default) or merges them all. MySQL regressions cover these query plans, variant selection, foil merging, link-count merging and splitting alongside mod splits, tab filtering and merging, search, column ranges and orders, history, merged-currency history in `historyUnit` with per-hour `priceRates`, list currency and value display rates, exchange-priced items (left out of the stash rows), page boundaries, crafting base cohort rows (latest hour, current revision, category), and each row's hourly and daily `recentSales` and exchange `recentVolume`. Unit tests cover the per-category identification and corruption filters, the unique base type filter, the value display in both games' price currencies, and the chart in each display; UI tests cover the shared value display on list rows, the item page's one merged chart and table, and the display carrying back to the list. |
| Recombinator equipment, modifiers, preparation recipes | `recombinator/catalog`, `bases`, `mods`, `recipes`, `draft` | Catalog, base/mod/recipe filtering, and `parseRecombinatorDraft` |
| Recombination outcomes, preparation, target odds | `recombinator/calculate`, `target` | `calculateRecombinatorPlan`, `matchesTarget`, `summarizeCounts` |
| PoE 1 and PoE 2 workbench catalog, calculation, process simulation and item emulation | `crafting/workbench/catalog`, `workbench/calculate`, `workbench/process`, `workbench/emulate` | `get_crafting_workbench_catalog`, `calculate_crafting_workbench`, `emulate_crafting_process`, `emulate_crafting_item`; shared `CraftingWorkbenchCalculation`, `CraftingProcess` and `emulateCraftingItem`. Current workbench catalogs and client-build validation match the browser; retained graph rulesets remain separate. HTTP calculations refuse manual-stop runs and requests above 5,000 trials or 100,000 potential steps. Allflame preview costs remain deferred until selection, reveal choices stay explicit, and paid bench failures retain the changed item and costs. Stateless operations never modify browser drafts. |
| Workbench fossil optimization | `crafting/workbench/optimize-fossils` | `optimize_crafting_fossils`; the browser worker and transports use `FossilOptimizer`, the same options schema and validated result contract. Supports explicit fossil combinations, Allflame, Tangled choices, partitions, intervals and unknown prices. Server requests are limited to 5,000 trials per combination and 100,000 trials in the requested partition; larger searches remain available in browser workers. Requires current client build and target requirements. Does not modify drafts. |
| Workbench starting-item editing and item-text export | `crafting/workbench/item`, `workbench/item-text` | `edit_crafting_starting_item`, `export_crafting_item_text`; shared `editCraftingStartingItem` creates bases, validates full item edits, adds seeded starting modifiers, switches game-specific flags and sets allocated passives. Workbench controls use the same helper; text export calls the existing shared exporter. These are hypothetical input edits and do not spend currency or record execution. Unsupported states, forged rolls, wrong-game flags and stale client builds are refused. Existing retained `items/query-from-text` returns all valid item interpretations for imports. |
| Multi-input crafting graph calculation at `/1/crafting/projects` and `/2/crafting/projects` | `crafting/graph/calculate` | `calculate_crafting_graph`; retained `CraftingGraphSimulation`, shared with the graph worker. Bounded sampled calculation, recovery, acquisition comparison and explicit sale revenue. Resolves exact catalog and executable revision through the published history index. |
| Conditional preparation steps | `crafting/workspace/edit`, `crafting/graph/calculate` | Shared `applyWhen` item query in engine r5. The first input is checked before crafting or acquiring a second input. Non-matching items pass unchanged through the same result routes; unknown matches stop the estimate. Skipped steps spend no currency and consume no items. Worker/HTTP/MCP report skipped visits. Older engines remain pinned and refuse this new field; revision adoption is explicit. |
| Full graph method options | `crafting/graph/method` | `replace_crafting_graph_method`; shared `replaceGraphMethod` preserves ports, conditions, routes and prices while applying workbench method settings. The editor uses an explicitly selected purchase as a reference for available controls; actual inputs still come from graph execution. A new second port consumes a separate item from the first port's source until reconnected. Inline inventory donors, stale method edits, unavailable era methods and removing recovery destinations are refused. The quick method selector uses the same core edit. No retained calculation implementation changes. |
| Workbench item handoff, graph connections and step removal | `crafting/graph/from-item`, `graph/edit` | `create_crafting_graph_from_item`, `edit_crafting_graph`; `projectFromItem`, `connectGraphInput`, `removeGraphNode`. Preserves full item state, rejects production cycles and removal of referenced steps. Other graph fields use the shared workspace update command. |
| Sampled graph outputs to new projects | `crafting/graph/calculate`, `graph/from-item`, `workspace/edit` | The existing calculation result includes full sampled items. The browser previews the first three trials and uses `projectFromItem` and the shared workspace create command to open a new tab with the sample's original ruleset. Its price remains unknown; an individual trial's spending is not reused as an expected acquisition cost. Stale calculations hide their samples, pending handoffs cancel when the selected sample changes, and destroyed results cannot become purchases. Game-text export falls back to full item JSON where text cannot represent the state. |
| Selected workbench craft to a new graph tab | `crafting/graph/from-method` | `create_crafting_graph_from_method`; `projectFromMethod` preserves the full input, method settings, consumed donor and entered prices. Donors become distinct acquisition inputs and are charged once. Missing prices remain unknown; missing donors and incompatible ruleset pins are refused. The selected retained engine validates the graph. The browser saves a new local project; stateless callers receive the draft. Workbench targets and multi-step processes are not imported; outcome and recovery queries remain explicit graph edits. |
| Per-step generated-item and recombination prices | `crafting/workspace/edit`, `crafting/graph/calculate` | Engine r8 resolves `node:${encodeURIComponent(nodeId)}:${encodeURIComponent(costId)}` before the shared cost price. The editor exposes manual overrides for generated items and recombination; clearing an override restores the shared price and explicit zero remains valid. The same trial accounting drives retries, production estimates and acquisition choices in the worker, HTTP and MCP. Earlier rulesets reject scoped keys at the shared boundary and retain their immutable behavior. Adoption of r8 is explicit for saved projects. |
| Standalone recombinator starting input to a crafting project | `crafting/items/from-recombinator` | `create_crafting_graph_from_recombinator_input`; shared `materializeRecombinatorInput` resolves canonical modifiers with an explicit concrete base, rarity and minimum/maximum roll assumption. Matching source catalogs are required. Custom text and manual probability flags are refused. The browser previews the item before saving a new local project, preserving the workbench draft. The graph records the roll assumption in its input label and leaves its purchase price unknown. This transfers one starting input, not the recombination plan or its conditional preparation recipes. |
| Editing prepared graph purchases in the full workbench | `crafting/graph/purchase-item` | `replace_crafting_purchase_item`; `replaceGraphPurchaseItem` preserves graph routing and acquisition choices, refuses intervening item changes and clears the quote only when the item changes. The operation validates the prepared item using the selected retained engine. The browser opens an isolated workbench session, applies through this operation, and preserves the standalone automatic draft. |
| Non-native natural essence sources on workbench and acquired items | `crafting/items/nnn-essences` | `list_non_native_essences`; `nonNativeEssenceSources` reads the selected catalog, excludes essence-exclusive modifiers, and optionally checks the other base. UI sorts known prices first and selects a recipe; graph selection creates an explicit essence step and pins the selected acquisition. Acquired-item controls can load exchange prices for eligible essences. |
| Crafting era revisions and explicit correction adoption | `crafting/rulesets`, `rulesets/correction`, `rulesets/adopt` | `list_crafting_rulesets`, `get_crafting_correction`, `adopt_crafting_ruleset`; shared revision resolution and availability checks, with validation by the selected retained engine. Project controls preserve old pins and offer explicit version changes. |
| Simple crafting outcomes | `crafting/graph/capability`, `graph/simple-outcome` | `describe_simple_crafting_method`, `configure_simple_crafting_outcome`; shared capability definitions attach to extracted currency actions and recipes. Remembrance, base/map/catalyst quality, supported socket currencies, socket bench recipes and basic rarity changes expose only supported targets. Minimum goals skip satisfied inputs and recover the same item on misses. Revision 7 validates generated routes; custom saved recipes stay intact until explicitly converted. Complex methods retain custom editing. |
| Recombination odds in project graphs | `crafting/graph/calculate` | Revision 7 enumerates model outcomes for actual consumed inputs, averages route probabilities across craft attempts and excludes skips. The UI uses these probabilities for step labels and line widths; terminal trial success is labelled after retries. Observed counts remain available separately. Historical engines retain sampled frequencies. Enumeration and graph simulation run in the browser worker and the shared retained runtime for HTTP/MCP. |
| Shared item-query matching and graph query editing | `crafting/items/match`, `workspace/edit` | `match_crafting_item`; `@poe-tools/item-query` tri-state matcher for API-shaped items and resolved facts. Graph requirements use the same query schemas through workspace updates. |
| Pasted items to editable graph requirements | `crafting/items/query`, `items/query-from-text` | `create_item_query`, `create_item_queries_from_text`; shared `queryFromItem` and `queriesFromItemText`. The browser verifies and parses the retained catalog in a worker. All valid text interpretations remain available; ambiguous results require explicit selection. Selected known fields become query conditions, with warnings for missing identities, slots and sockets. No execution progress is recorded. |
| Graph item requirements to PoE 1/PoE 2 trade searches | `crafting/items/trade` | `build_crafting_trade_search`; `buildCraftingTradeSearch` uses official per-game metadata and the chosen catalog. Browser translation runs in a worker; exact, approximate and omitted conditions are explicit. No listings or equipment prices are fetched. Searches default to instant-buyout listings; options set listing status, listing age and one listing per seller. See [translation boundaries](crafting-trade.md). |
| Buy-in prices per craft step | `crafting/buy-in/stages`, `buy-in/price`, `buy-in/compare` | `list_crafting_buy_in_stages`, `price_crafting_buy_in_stage`, `compare_crafting_buy_in`; shared `buyInTradeSearches`, `priceBuyInStage` and `calculateBuyIn`. The browser runs the same functions in the retained-engine worker. Listings are re-checked against each step with the project's catalog; instant-buyout listings price a step at the cheapest match (high confidence), opt-in in-person listings drop bait under half the median of the five cheapest. Prices are stored on the graph's `buyIn` field, keyed by a fingerprint of the step query, game, league and currency; retained engines never receive that field. The comparison calculates each priced step as a pinned purchase. **Collecting listings is browser-only**: the poe.boats extension runs the trade searches in the user's own browser session (see [the scope](../../../docs/crafting-buy-in-extension.md)); HTTP and MCP callers supply listings themselves, and the server never makes trade requests. Server comparisons accept at most 10 priced steps. |
| Equipment acquisition prices, live refresh and hourly history | `crafting/market/cohorts`, `market/bind`, `market/refresh`, `market/history` | `find_crafting_item_prices`, `bind_crafting_item_price`, `refresh_crafting_item_prices`, `get_crafting_item_price_history`; shared cohort coverage, `selectCraftingMarketPrice` and binding functions for bases, fractures and donors, including exact definitions for all configured preset purchases. Optional `adaptive-v1` widens below ten sellers to complete 6/24-hour listing windows with at most 10% movement. Optional `exchange-v1` converts another listing currency using the same-hour, same-realm/league exchange quote; converted medians use one hour and retain both sources, with unknown combined confidence. Lookups require an observation in the latest 24 completed hours at the cutoff; history stays raw and hourly. Unknown modifier identities never contribute a price. Sources retain scope and policies through refresh and historical calculation. Browser refresh failures block calculation until resolved or manually overridden. HTTP/MCP callers refresh explicitly before calculating; calculation uses supplied prices. PoE 2 equipment remains manual. |
| Both-game currency/essence prices and exchange history | `crafting/market/exchange`, `market/exchange/bind`, `market/exchange/history`, `market/refresh` | `find_crafting_exchange_prices`, `bind_crafting_exchange_price`, `get_crafting_exchange_price_history`, `refresh_crafting_item_prices`; shared direct-pair traded-volume estimate and scoped binding. Lookups require a positive observation at the selected completed cutoff hour; an absent, zero-volume or conflicting anchor stays unknown rather than reusing an older quote. Optional `adaptive-v1` widens that positive anchor to complete 6/24-hour windows below 100 input units while hourly estimates vary at most 10%; sums volumes without double-counting inverse pairs. Both conversion legs must be positive at that same cutoff and use the same window; a newer leg is never rolled back to an older common hour. An explicit historical cutoff applies the same rule at that historical hour. Policy survives refresh/history; old references stay hourly. The workbench explicitly copies the same lookup results into fixed chaos amounts. Manual prices survive bulk fill and refresh. Raw hourly history and explicit snapshot binding remain available; confidence is uncalibrated. The separate general-market display-rate fallback described above is unchanged. Scheduled collection captures PC PoE 1/2 independently of the equipment worker. |

| Whole-process cost history for both games | `crafting/market/snapshots`, `crafting/graph/calculate` | `get_crafting_price_snapshots` returns up to 24 independently repriced graphs at requested UTC hours; callers calculate with the existing retained-engine operation. The browser uses the same snapshots and runs each calculation in a worker, showing a chart and table. Missing or unsupported historical bindings produce gaps. Manual assumptions, acquisition choices and ruleset pins stay fixed; the live draft is not replaced. Observed timestamps and item asking-price confidence remain explicit. |

| Currency conversions and beast/temple sources | `crafting/market/exchange`, `market/sources`, `market/sources/bind`, `market/refresh` | The exchange picker defaults to `two-leg-exchange-v1`: it prefers direct and reference-currency pairs, then selects a deterministic bridge from other positive matching-hour exchange pairs. It retains both legs and refuses incomplete market discovery above 5,000 markets. Saved `reference-currency-v1` bindings retain their original chaos/divine/exalted-only policy during refresh and historical repricing. Explicit vendor ingredient estimates support the same conversion policies; failed refreshes block calculation while preserving the source for recovery, and the picker discards stale quotes. `find_crafting_source_prices` and `bind_crafting_source_price` share complete-recipe pricing and scope checks with the UI. PoE 1 PC captured stash asks (`stash-recipe`) cover verified named beast components, one generic Yellow Beast pool for the remaining rare sacrifices, and the exact Locus temple, at current and historical cutoffs. The pool uses a listing-count-weighted mean of eligible species asks with auditable provenance; prices saved from poe.ninja rebind to captured asks on refresh, and old Mountain Lynx references require explicit rebinding. Level-sensitive recipes remain manual. Manual prices survive bulk fill and refresh. See [source coverage and operation requirements](crafting-price-sources.md). |
| Local crafting project tabs and build membership | `crafting/workspace/edit`, `workspace/export`, `workspace/freeze-build` | `edit_crafting_workspace`, `export_crafting_bundle`, `freeze_crafting_build`; shared immutable workspace edits, revision conflicts, portable ID remapping, reference/value members and snapshots. Local UI includes tabs, build copies/references and JSON import/export. These stateless operations accept explicit state; account persistence uses the separate cloud operations below. |
| Private crafting account storage, sync and sharing | `crafting/cloud/get`, `cloud/save`, `cloud/preference`, `shares/create`, `shares/get`, `shares/list`, `shares/revoke` | Account-owned workspace with transactional revision checks; `get_saved_crafting_workspace`, `save_crafting_workspace`, `set_crafting_storage_preference`, and crafting share operations. Browser storage choice and sync use the shared conflict planner and guarded local replacement; conflicting drafts can be kept as independent copies. Frozen builds embed referenced revisions; live shares resolve only the selected target and dependencies. Publishing is explicit and links are revocable by their owner. Public `/crafting/share/:id` previews retain ruleset pins, refresh market prices and allow independent copies. Real MySQL tests cover successful and refused HTTP/MCP calls; browser tests cover both games, account changes and offline edits. |
| Local sets: create, select, rename, duplicate, delete, import | `idol-planner/edit`, `import` | `edit_idol_planner`, `import_idol_share`; shared immutable state operations |
| Inventory: add, edit, duplicate, delete, clear, search, paste parsing | `idol-planner/edit`, `inventory`, `parse` | Planner commands, localized inventory search, and parser |
| Grid placement, movement, removal, collision/unlock rules | `idol-planner/edit`, `can-place` | `editPlanner`, `canPlaceInSet`; also used by drag previews |
| Map-device scarabs, crafting options, unlocks | `idol-planner/edit`, `catalog` | Planner commands and shared reference data |
| Modifier catalog/search, unique idol picker, trade links, combined stats, scarab cost | `idol-planner/mods`, `mods/search`, `uniques`, `trade`, `stats` | Shared catalog, filters, trade builders, aggregation, and price calculation |
| League/realm, favorites, trade-weight preferences | `preferences/*` | Shared preference operations; caller stores returned state |
| Share creation, share loading, scarab prices | `idol-planner/share`, `prices` | Shared server operations; old planner URLs are compatibility adapters. `get_scarab_prices` reads the league's PC exchange through `getMarketExchangePrices` on each request. |
| Account profile | `account/me` | `get_account`; authenticated session identity |
| Saved sets and their inventory/placements | `sets/*` | Shared saved-planner operations, usable from `/integrations` |

Navigation, focus, dialogs, clipboard access, and drag gestures are browser presentation. A tool takes the pasted text or resulting command instead. Theme and locale cookie selection remain browser preferences; localized domain operations take an explicit locale. OAuth sign-in/out remain Better Auth protocol endpoints, not tools accepting passwords. Stash ingestion is a separate machine-to-machine pipeline with its own ingest credential; it is not an account operation and is never exposed through account tools.

Current graph calculations in HTTP/MCP use the prices supplied by the caller, including unrefreshed legacy stash bindings; they do not establish current exchange membership or freshness. Call `market/refresh` and check its issues before calculating current prices. The browser graph editor blocks calculation while that refresh is pending or failed. Stateless calculation also accepts historical snapshot graphs, so it cannot distinguish one from an unrefreshed old graph without a separate authenticated snapshot contract.

An exchange binding that cannot be refreshed is marked unavailable while retaining its source
reference for a later retry. Graph calculation and workbench copying refuse the cached amount;
a successful refresh restores the binding. Historical snapshots still use their requested hour.
Stateless HTTP/MCP calculations use supplied prices, so callers must refresh live graphs before
calculating; an unrefreshed graph is not proof of current exchange coverage.

Equipment donor-family lookup and binding also accept `assumption: "display-equivalent-v1"`.
The browser requires an explicit representative-item choice. The shared binding validates family
equivalence against the selected crafting catalog before treating the configured modifier as the
representative; other requirements still apply. The assumption is labelled and saved in the price
reference through serialization, live refresh and historical snapshots. HTTP/MCP success and
default-refusal cases, MySQL lookup and browser reload/manual-override tests cover this path.

Equipment refresh follows newer observations across retained definitions only when cohort ID, purpose
and exact parsed query agree. Historical snapshots can select an earlier compatible revision at the
requested cutoff. Missing definitions, truncated lookup and empty newest prices remain explicit
issues. HTTP/MCP success and refusal tests, MySQL history tests and browser reload coverage verify
this behavior; crafting rules and acquisition pins remain unchanged.

Generated preset cohorts scope explicit modifier IDs to their catalog prefix or suffix side.
For identified items, a known side count fully accounted for by distinct resolved modifiers can
rule out a different modifier on that side even when implicit identities remain unresolved.
Missing, ambiguous or contradictory evidence remains unknown. Unsided and implicit queries retain
their existing completeness rules. The added side produces a new cohort identity; saved unsided
bindings stay on their original definitions until explicitly replaced.

Definitions are matched to the item before the candidate limit is applied. Bounded
definition pages seek the indexed generated base key, revision and ID, and hourly reads use
exact revision/ID pairs. Single-base definitions are indexed by their base; multi-base and
unrestricted definitions use a fallback range and retain the exact JSON membership check.
Unrelated same-base cohorts cannot consume the 2,000 relevant-candidate allowance;
item-matching but uncovered cohorts retain their coverage reasons. A genuinely truncated
result still prevents refresh from silently choosing an older or incomplete price.

Every stash table exists once per game (`stash_poe1_*`, `stash_poe2_*`), so their columns and
indexes can diverge; equipment cohorts are PoE 1 only. Ingest keeps four rollups per game, each
recomputed from the hourly rows it summarises after every 200-row batch, because the ingester
re-pushes whole hours with later sale corrections: `market_daily` (per listed market per UTC
day: sums, newest and newest listed hour, base type, rarity and name), `currency_market` (each
exchange market's first hour), `currency_daily` (per exchange market per UTC day: units of each
side traded in the hours where both traded, those hours' count and the newest) and
`hour_coverage` (stored rows per stream, league and hour). The daily rollup stores only a mod
pool unique's item market (Watcher's Eye, Loreweave), not its per-mod markets, which count each
listing more than once. It has no `links` column:
the list merges link counts, and the item page reads them from the hourly rows. It keeps `tab`,
which the list filters by. A category list without
text search reads the daily rollup through its covering base-type index; other lists read it by
primary-key range. Both precede fetching the selected full hourly rows. A day keeps one name
(the greatest), so searching a renamed item's older name is best-effort, and the list's text
search no longer matches a pool unique's individual mods (its item page filters them). Latest
nonempty observations, variant identity and period totals otherwise retain their semantics.
The exchange lookup reads
`currency_market`; exchange trends, volumes, pairs and earlier-day prices read
`currency_daily`; the latest hour's prices and an exchange item page's history read hourly
snapshots. MySQL plan and result regressions live in
`test/e2e/market-query.test.ts` and `test/e2e/crafting-market-performance.test.ts`.

Full server status reads each game's `hour_coverage` and reuses each database/realm/league
summary for up to one minute per Worker isolate. Concurrent requests share a pending read;
failures are evicted. Worker reports and health remain live. `coverageCheckedAt` identifies
the coverage snapshot through the UI, HTTP and MCP, and is null for `view=workers`.
`test/server-status.test.ts` covers expiry, scope isolation, failed reads and transport parity.

Both scheduled and worker currency ingestion use the same primary-key-ordered batches.
Only a deadlock victim (MySQL 1213) is retried, with jitter and at most three attempts per
autocommitted batch. Other failures and exhausted retries propagate. Unit and MySQL
concurrency tests preserve replay, correction and zero-volume behavior.

Apply the [market covering index](../app/db/migrations/20261024143220_market_covering_index/migration.sql),
[cohort base lookup](../app/db/migrations/20261024143620_cohort_base_lookup/migration.sql) and
[status coverage indexes](../app/db/migrations/20261024143909_status_coverage_indexes/migration.sql)
migrations before deploying these query changes: the queries name the indexes explicitly.
The generated cohort key indexes existing definitions automatically. Roll back application
code before removing any of these indexes.
Apply the [market rollups](../app/db/migrations/20261027115536_market_rollups/migration.sql)
migration before deploying the code that reads them; it creates and backfills the three
rollups from the hourly tables (a one-off scan of each). After deploying, rerun its backfill
statements with `ON DUPLICATE KEY UPDATE` for hours the previous worker wrote in between: the
coverage and market statements with `WHERE hour >= <migration hour>`, and the daily statement
with `WHERE hour >= <UTC midnight of the migration day>`, because each daily row must be
recomputed from its whole day (`refreshStashRollups` in
`app/db/queries/stash-rollups.queries.ts` builds the same statements). The
[market daily](../app/db/migrations/20261027135202_market_daily/migration.sql) migration follows
the same order: apply it before merging, then rerun its backfill from UTC midnight of the
migration day. So does the [exchange daily](../app/db/migrations/20261027155209_exchange_daily/migration.sql)
migration, whose backfill groups every stored exchange hour by market and day. New indexes add storage and ingestion write work;
check live Query Insights after deployment rather than treating local timings as production results.
PoE 1 market lists show the 169 yellow beast species as one `Yellow Beast` market, whose hourly
rows ingest merges from the hour's stored species rows (`refreshYellowBeastHourly`). Hours stored
before that are backfilled after deploying with `vp run db:backfill-yellow-beasts <league> [days]`.

Equipment lookup exposes per-lookup `Server-Timing` diagnostics through both HTTP and MCP:
`equipment_db` measures the total cohort database awaits, `equipment_parse` measures validation and
coverage checks, `equipment_fx` measures exchange conversion and price selection, and
`equipment_total` covers the whole lookup. `equipment_counts` reports database awaits, returned
cohort rows and returned exchange rows as numeric counts. Failed database awaits are counted;
the header contains no SQL, parameters, item details or credentials. These measurements do not
change lookup results, coverage requirements or pricing policies.
For an MCP batch containing multiple equipment lookups, these metrics describe the last
completed lookup; overlapping calls keep independent clocks and counts.

Equipment lookup, binding and refresh also require the cohort to guarantee the configured
starting base, exact item level, rarity, affix counts, influences and supported flags.
Broad base or donor medians cannot price an already prepared input. Exchange history remains
accessible when a current quote is missing or lookup fails; inspecting it does not fill prices.
Revision 11 adds an explicit fractured fossil source acquisition. Capture proves the sole retained
fracture and eligible armour base, then matches a separate projected cohort for each combination
of crafted modifiers and enchantments. Disposable affix identities and replaceable Eldritch
implicit tiers do not constrain that source quote. The original captured item and ordinary cohort
matching remain unchanged. Acquisition pays the source price, required bench removals, the first
fossil roll, Lesser Ichor and Greater Ember before returning a fully modeled item. The shared
runtime includes those actions and inputs in comparisons, missing-price reporting and totals.
Lookup, binding, saved-price refresh and historical snapshots require the same intrinsic source
policy; a source quote cannot price an ordinary clean-item purchase. Manual prices retain the
preparation steps. Earlier retained engines refuse the new field and preserve their behavior.
For bases sharing a display name, the capture classifier resolves a canonical base ID only when
the complete native implicit descriptions identify exactly one catalog variant. The generated
model covers Two-Toned Boots and Two-Stone Rings; missing, altered, overlapping or unsupported
implicit evidence remains unknown. Exact boot preset cohorts require the canonical base ID.
Engine-derived item facts make lookup, binding and refresh require that proof; older display-name-only
cohorts remain browsable but cannot price an ambiguous variant. HTTP/MCP parity and the real-storage
capture-to-query, binding and refresh regression verify that cheaper alternative variants do not
enter the selected variant's price. Capturing identity adds no price until a listing is observed.
Modifier inference also applies the client's explicit required-influence rules to captured influence
flags. Missing or dual-influence evidence retains ambiguity; fixed all-influence bases require their
native implicit text. Native spawn weights do not exclude legitimate non-native donors. Proven
modifier metadata constrains inference without preventing other affixes from being identified.
Metadata identities use the same retained equipment domains as the modifier text model.
Watchstone-only and other non-equipment modifiers cannot introduce false name collisions into
equipment matching. Unsupported or null-text candidates within the retained equipment domains
still preserve ambiguity, including legitimate non-native modifiers.
Modifier text model version 2 can derive one omitted affix count when every supported
interpretation of the complete displayed modifier text agrees. It preserves supplied
counts and the raw source item, shares the existing search budget across possible counts,
and keeps ambiguous, unsupported or incomplete evidence unknown. Version 1 retains its
original behavior; the new model produces a separate capture revision. Version 3 also
intersects complete identified Magic item names with modifier descriptions and supplied counts.
Canonical blank names and same-name ambiguities remain possible; incomplete, decorated or
special item names do not constrain inference. Existing model formats retain their behavior.
Fifteen ordinary donor alternatives, including the flat-ES/recovery prefix/suffix pair, offer a
separate Magic purchase where the complete immediate recombination outcomes match the existing
Rare purchase. Each rarity has an exact cohort; a Magic
quote never prices a Rare item. New presets retain the original pinned purchase for previews, while
users can select the Magic alternative or compare actually priced alternatives automatically. The
revision 9 presets also offer fourteen explicit preparation alternatives for isolated natural
donors: acquire the exact Normal base, Transmute, roll Alterations and Annul an opposite affix.
Losing the target returns to paid rolling on the same item. Real-engine tests cover every route's
recovery charges, source-cost discovery and full-recipe output equivalence. Prices remain unknown
until supplied, and the original Rare purchases stay pinned. Saved graphs and older revisions
retain their recipes. The [ES shield preset](crafting-preset-es-shield.md) also prepares its two
NNN donors with Weeping Doubt, paid Annulment isolation and Exalted attempts. Losing the NNN
prefix requires paid Scouring and another Essence on the same base. Its flat-ES/recovery
donor can use Transmutation and Alteration to roll the exact existing Magic purchase shape.
Five concrete Magic or Rare
Shaper shield purchases can be Scoured into the four existing Normal shield acquisitions;
shared source definitions still buy a separate item for each consumer. These preparation
choices remain optional, with the original purchases pinned.
The [ES chest preset](crafting-preset-es-chest.md) prepares its two NNN donors from
the existing Normal Vaal Regalia acquisition with Screaming Doubt and paid Annulment
isolation. Losing either required prefix returns the same item to the Essence step;
all retries are charged and missing input prices keep the total unknown.
Revision 12 adds four paid Scouring source profiles to seven existing Normal acquisitions:
the three life-shield bases, the shared ES-shield base and the three ordinary Hubris donors.
Identified Magic/Rare sources must prove their exact base, level, influence, native implicits
and removable explicit state. Crafted modifiers and enchantments are removed when present,
then Scouring is charged once. Every acquisition pays again. Unknown persistent state or a
fracture prevents a clean Normal projection; raw source records remain intact. Source quotes
are bound to their preparation profile and cannot price an ordinary clean purchase. Missing
purchase or preparation prices keep the total unknown, and existing choices remain pinned.
The shared classifier, binding, calculation and UI expose the same policy. Earlier revisions
retain their published behavior.
Revision 13 adds the same four paid profiles to the uninfluenced Normal Cold/Lightning
Two-Toned Boots and Zodiac Leather inputs. The boots must retain their native resistance
implicit, and Zodiac Leather must have no implicit. Both preserve the exact item level and
feed the existing influence and modifier preparation routes. These two source bases require
revision 13 even when an older graph already supports shield and helmet Scouring.
Revision 15 adds optional Shaper-base preparation to the Life on block and ES on block shields.
An eligible uninfluenced Pinnacle Tower Shield or Titanium Spirit Shield is Transmuted,
Regaled, given Shaper influence with a Shaper's Exalted Orb, then Scoured. The result is the
exact Normal Shaper base consumed by the existing affix preparation. Source model 5 proves
the clean Normal input's native implicits and absence of incompatible persistent state;
this eligibility profile adds no cleanup action. The four paid Scouring profiles also remain
available for Magic/Rare sources. Every currency and cleanup fee is charged separately,
existing choices remain pinned, and earlier revision graphs and source model behavior remain
unchanged. Browser, HTTP and MCP use the same preset, eligibility and price-binding logic.
Capture fixtures cover every new base without modifier metadata;
definitions do not imply observed inventory or available quotes.

Source lookup and binding also accept uniquely identified supported PoE 1 PC crafting currencies
and essences through a distinct `stash-commodity` source. Stored imprints and unsupported stateful
currencies are excluded. This uses already captured unit asking prices and preserves the completed
observation hour, range and priced sample count separately from total listings and sellers. Selection
is explicit, manual amounts survive bulk fill and refresh, and historical snapshots use the requested
cutoff. An unavailable exchange quote remains unavailable; captured currency asks are a separate price source.
Optional `exchange-v1` converts only the newest captured bucket using matching-hour rates. Shared
lookup, binding, refresh and snapshots preserve the original asking range and exchange evidence;
the UI requires explicit selection and labels the conversion. Native quotes take precedence.
Query, MySQL, HTTP/MCP and browser regressions cover conversion and refusal of older rates.

Prime Chaotic Resonator asks require the forward-captured `empty-resonator-v1` / `reroll:4`
bucket. The two retained four-socket reroll IDs are accepted only when their catalog metadata
agrees; quotes and saved references retain explicit emptiness provenance and the selected ID.
Generic historical resonator buckets remain ineligible. The UI identifies the empty state and
links its exact variant history. Newest-bucket selection, completed hours, explicit source
selection and matching-hour conversion apply unchanged; an unpriced newer tagged bucket
cannot reuse an older price. Missing tagged observations remain unpriced.
The tagged bucket accepts both legacy frame 5 and modern Currency captures represented by
frame -1; ordinary commodity buckets still require frame 5. Imported untagged or misbound
resonator stash references cannot enter browser/API/MCP calculation or be copied into workbench
prices. Explicit refresh removes those invalid market entries and reports the issue; saved drafts
remain editable, retained runtimes are unchanged, and explicit manual amounts remain accepted.

The same source lookup, binding and refresh operations support explicitly selected vendor
ingredient estimates: verified forward essence upgrades and one-step NPC currency purchases.
Currency purchases retain their exact quantities and Purchase Items instructions, including
four Transmutations for one Augmentation at Nessa. They require a positive captured ingredient
quote and never replace an unavailable direct quote automatically. The graph and workbench
pickers expose the recipe, observed hour and traded volumes before explicit application.
Saved ingredient choices survive refresh; forged paths, quantities and provenance are refused.

## Adding a capability or Hono subrouter

The idol planner's non-drag placement controls use the existing placement, movement and removal
commands and `canPlaceInSet` validation. Project deletion confirmations, mobile workbench section
navigation, accessible control labels and sign-in feedback are presentation changes; domain
operations and transport contracts remain shared. Browser regressions cover keyboard placement,
unavailable cells, persisted drafts, deletion cancellation, mobile layouts and sign-in retries.

1. Implement or extract a feature function. For data owned by an account, take `OperationContext` and check its caller before reading or writing. For a local draft, take explicit state and return new state without accessing browser storage.
2. Define input and result Zod schemas from the domain schemas. Use concrete result fields, including empty/error states. `defineOperation` checks the result at runtime; output-contract failures are internal errors, not client validation errors.
3. Add `defineOperation({ name, family, path, method, description, ui, access, readOnly, input, output, execute })` to a feature catalog and include it in the registry. GET operations use flat query fields; calculations and commands use JSON POST bodies. A new `family` creates an `OpenAPIHono` subrouter automatically and mounts it with `api.route('/v1/<family>', subrouter)` beneath `/api`.
4. Call the same function from the UI or its loader/action. Keep parsing requests and serializing transport errors in the adapters. Existing compatibility URLs must delegate to the shared operation rather than retaining old business logic.
5. Add tests proving UI/core, HTTP and MCP result parity, invalid-input handling, and ownership refusals. The catalog-wide test also checks operation discovery and the served OpenAPI request/result contracts. Add the UI capability to the table above.

The Hono adapter authenticates account routes in route middleware **before** the Zod validators. Its `defaultHook` produces structured validation errors. Each subrouter uses that same hook. The assembler registers method refusals and derives `Allow` from the catalog, so adding a path does not leave an undocumented manual 405 list.

## Authentication and transport

Public features do not require an account. Account operations accept the existing Better Auth session cookie or bearer session token; the bearer plugin is already configured in `auth.server.ts`. Every request resolves the session again, so session expiry/revocation applies equally to API and MCP. The caller cannot choose another user's ID. This is session-bearer authentication, not a new MCP OAuth authorization server; clients must support supplying the bearer header.

MCP exposes public tools to anonymous callers and adds account tools when authenticated. It creates a server/transport per request, uses JSON responses, and closes them after the request completes. GET/DELETE receive 405 because this endpoint has no persistent sessions or SSE subscriptions. Tools return both text and structured results validated by the same output schema as HTTP.

Both transports reject foreign Origin headers, cap operation bodies at 1 MiB, and return non-cacheable results. No request-specific identity lives in module globals. `ASSETS` reads the bundled recombinator catalog without a public self-fetch. Crafting account storage uses the workspace/share migration; equipment history uses the cohort migrations.

The browser reference at `/integrations` lists every operation, its schemas, and an explicit Run button. Submitting a write there performs the operation under the signed-in account. `/api/openapi.json` is the machine-readable OpenAPI 3.1 contract; `/api/docs` serves the Scalar API reference using that same contract on the current origin. The integrations page links to both.

Crafting revision r9 estimates only dependencies reachable from the project entry and its selected acquisition routes. Pinned purchases leave their unused production alternatives explicitly unestimated; automatic choices still compare every route. Validation continues to cover the whole graph. Potential input and action costs, including skipped conditional actions, must be priced before a production route can supply a complete cost or win automatic selection. Retained revisions r1 through r8 keep their published behavior.

## References

- Rennix reference implementation: `apps/rennix-app/docs/agents/api.md`, `docs/agents/mcp.md`, `app/routes/api.ts`, and the parity section of its `AGENTS.md`.
- [Hono Zod OpenAPI](https://hono.dev/examples/zod-openapi), [Hono subrouters](https://hono.dev/docs/api/routing).
- [React Router resource routes](https://reactrouter.com/how-to/resource-routes).
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x).
- [Cloudflare asset bindings](https://developers.cloudflare.com/workers/static-assets/binding/).
