# Equipment market cohorts

`@poe-tools/market` defines shared item-query cohorts and asking-price summaries. PoE 1 public
stash ingestion uses the same tri-state matcher as crafting projects. An item can enter several
cohorts. Unknown membership is counted separately and never contributes a price.

Generate the initial base manifest from the extracted crafting catalog:

```powershell
vp run poe-boats#game-data:market
```

The generator selects the three highest drop-level equipment bases per item class and defence
combination, plus a small explicit list of jewellery bases and Grasping Mail. This is an initial
capture policy, not a claim that drop level measures market value. Generated selections need review
when game data changes. Duplicate display names share a cohort; level boundaries include changes
to every selected variant's pool.

For each base, the script compares native, uninfluenced rare modifier pools at all possible spawn
and maximum-level boundaries. Adjacent unchanged pools merge. The generated manifest currently
contains 19,878 base cohorts for 176 base names, including overlapping any-link and six-link groups where
the base supports six sockets. Clean-base groups exclude corrupted, mirrored, fractured,
synthesised and influenced items, and combine normal, magic and rare rarity. They do not identify
the cheapest listing or automatically remove the cost of preparing a rare item.

The complete manifest has 48,937 groups: those base groups, 27,603 T1/T2 native-fracture groups,
1,092 affix-count donor groups and 364 broader donor groups. Fractures use the selected bases and
three initial item-level bands (1–83, 84–85 and 86–100), with distinct modifier identities and tiers.
These intentionally broader fracture bands do not claim identical remaining modifier pools.
Donors cover the three elemental Incursion glove suffixes and the Grasping Mail lightning-resistance
critical-strike suffix, on eligible body-armour/glove bases including lower-level transfer bases.
Suffix counts of one, two and three overlap the broad donor group. Mirrored, corrupted, synthesised
and influenced items are excluded; donor groups also exclude fractures. This is useful-input
classification, not a valuation of every extra affix on a rare item.

The manifest revision hashes its catalog hash, cohort definitions and modifier-identity dictionary.
Ingestion retains definitions
for observed cohorts in DuckDB and sends them before summaries. Permanent definitions are keyed by
revision and ID; newer definitions do not overwrite older ones. This preserves the meaning of an
old chart after the generated current manifest changes. Forward ingestion also retains filtered
crafting-input observations locally; see the [capture policy](../poe-stash-ingest/README.md#durable-forward-capture-and-diagnostic-checkpoints).

`ps_equipment_listing` keeps current captured item state. `ps_equipment_hour` keeps the last observed
state per account, item, revision and UTC hour, deduplicating stash moves. Changing an item replaces
its membership for that hour; groups it leaves receive a zero-count correction. Earlier hours keep
their original observations. Unlisting or making a stash private marks current state removed but
does not assert a sale or retract a previously observed asking price.

Prices remain in their listed currency and include count, distinct sellers, minimum, median and
maximum. `asking-sellers-coverage-v1` is a data-quality heuristic:

`confidence = sellers / (sellers + 10) * priced listings / (matched + unknown listings)`

This is neither a probability of sale nor a statistical confidence interval. Unpriced items and
uncertain membership lower coverage; many listings from one seller do not imply high confidence.
Arbitrary rare outcomes are not valued. A rare item's listing in a clean-base cohort is an asking
price for an eligible base, not an appraisal of its affixes.

The `equipment` delivery stream is separate from legacy unique/currency summaries. Only fully
acknowledged hours can be pruned locally. Pruning removes completed-hour replay markers with the
observations so a later empty rollup cannot erase permanent history. Active inventory and undelivered
observations survive row limits. Small cohort definitions remain available for historical delivery.

The metadata resolver uses API name, side and level metadata plus all associated display lines,
matched against the extracted catalog text and roll ranges. Names or displayed totals alone do not
establish an identity. Ambiguous catalog matches, missing lines, combined stat rows and legacy
string-only modifiers remain unknown and contribute no price. Source tier labels are preserved;
they are not assumed equivalent to catalog tiers for special modifiers. Source affix counts can be
used directly; inferred counts are withheld on sides with unresolved identities. The dictionary
includes non-curated modifiers too, so curation cannot hide an alternative interpretation.

The richer metadata shape has been observed in real trade responses, but authenticated public-stash
inspection on 7 October 2026 did not supply it. A recent page contained 4,857 items and 15,874 explicit
modifier objects, none with complete name/tier/level metadata. Equipment samples did contain fracture
and crafted flags plus `extended.prefixes`/`suffixes`. Sanitized excerpts are retained in
`../poe-item-query/test/fixtures/poe1-public-stash-2026-10-07.json`. This is bounded sample evidence,
not a guarantee about every item in the stream. PoE 2 equipment continues to use manual prices and
trade links.

On 7 October 2026, the [official ItemMod contract](https://www.pathofexile.com/developer/docs/reference#type-ItemMod)
documents descriptions and flags, without promising the name/tier/level metadata used by this
metadata resolver. Description-only items now also use the generated `modifierTextModel` through
the shared item-query package. It searches complete affix combinations using source prefix/suffix
counts, modifier groups and separate crafted/fractured flags. Displayed numeric contributions are
summed, so compound modifiers and combined stat rows are not treated as independent affixes.
Interval sums over-approximate correlated rolls; only identities present in every complete
interpretation become facts. Non-curated and off-base catalog alternatives remain in the search.
Missing translations, unsupported states and the 20,000-visit limit produce unknown membership.
The generated model and its format participate in the cohort revision hash. Existing retained
cohort definitions, hourly history and crafting executables are unchanged.

The captured Vaal Gauntlets now resolve fractured T1 cold resistance, and the Conqueror's Helmet
resolves fractured T1 intelligence and matches its priced cohort. A DuckDB replay uses the captured
helmet attributes with explicitly synthetic sellers/prices and verifies that missing affix counts
exclude a cheaper listing without changing earlier history. Isolated Grasping Mail critical-chance
text also resolves in a generated-catalog regression. These examples do not prove complete coverage.

Automatic fracture/donor pricing is limited to supported interpretations in the selected catalog.
Enchantments and unmodelled scaling states remain unknown. A scaled value must not receive an
unscaled tier. The Temple
cold modifier has two catalog IDs with identical text/ranges and different required levels; without
metadata its exact ID remains unknown. Some complex items also exceed the bounded search. Unresolved
cases remain excluded from priced membership, and no rare resale value is inferred.

Temple modifiers now also have explicitly labelled display-equivalent family cohorts. These are
generated from catalog records that differ only in required level; exact-ID cohorts remain separate.
The shared item model can retain `possibleIds` for one affix. A query accepting every possible ID can
match it, while a query selecting only one remains unknown. Query generation preserves that choice
set and warns about the ambiguity. The family list participates in the cohort revision hash.
A description-only Temple donor contributes to the family price and to the exact cohort's unknown
count, never its price. This is verified through DuckDB capture and rollup.

Display equivalence does not assert identical crafting eligibility. Family prices cannot silently
satisfy an exact-ID prepared purchase or output requirement. The equipment picker offers an explicit
representative-item assumption; lookup and binding expose the same optional
`assumption: "display-equivalent-v1"`. Binding verifies the family's modifiers against the selected
crafting catalog, then uses the configured modifier as the representative for coverage. Other item
and output requirements still apply. The saved quote reference retains this assumption through
serialization, live refresh and historical snapshots, and the price editor labels it. Editing the
amount clears the binding and makes the price manual. Ordinary cohorts do not inherit the assumption.

Ordinary jewellery without a reported quality property uses unscaled ranges. Known catalyst
properties apply their catalog-derived tag/side rules and quality limits. Unknown quality labels,
duplicate quality properties and malformed context remain unresolved. Fixed native effects on
Simplex/Focused amulets and Helical/Manifold rings require the corresponding implicit text in the
source; missing or different implicit values remain unknown. A second authenticated
sample at 22:28 Sydney on 7 October 2026 confirmed named 20% resource/prefix quality properties,
items with no `properties` field, and a Manifold Ring with both prefix quality and a native 50%
prefix-magnitude implicit. The modifier-context projections are in
`../poe-item-query/test/fixtures/poe1-public-stash-quality-2026-10-07.json`. Absence of a reported
quality property is treated as no catalyst for full API inputs; callers supplying projections must
retain that context.

The generated model includes raw scalable-stat ranges and only the referenced stat translations.
The resolver uses the same pure stat renderer as the crafting workbench, truncates scaled raw values
before translation, and partitions conditional translation rules before bounding displayed values.
Non-scalable values such as gem levels stay unchanged. Lookup alternatives are enumerated within a
bound, and range correlations remain over-approximated. Missing translations or exceeded bounds
produce unknown results. Eight compiled scaling contexts are cached per classifier; no runtime
game-file access or large table of every quality/roll combination is required.

The captured Vermillion Ring now resolves catalyst-adjusted regeneration and its crafted modifier.
The Manifold sample resolves its life-on-kill suffix while its ambiguous fracture stays unknown.
Generated-catalog tests cover scaled T1 fractures on all four native-effect bases; DuckDB replay
prices a scaled fracture while excluding a cheaper listing with unrecognized quality. Helical and
Manifold rings are explicitly included in the curated base set. The new cohort revision preserves
old hourly definitions and prices rather than rewriting them.

## Crafting price bindings

Graph purchases can select a cohort median in their accounting currency. Eligibility checks the
configured item, its explicit modifiers, sockets and links, and whether the cohort guarantees every
output requirement. Unsupported logical coverage and unknown modifier identities prevent automatic
pricing. Broad base prices therefore cannot value a prepared modifier or a six-link input. The first
version proves conjunctions of supported conditions; more complex queries remain manual.
Crafting-only preparation state outside cohort coverage, including quality, enchantments, altered
implicits and imprints, requires a manual quote or preparation after buying the base. An upper-bound
modifier count is only guaranteed when the cohort uses the same modifier predicate.

The existing graph price contract stores a qualified cohort reference in `cohortId`, retaining realm,
league and definition revision alongside the observed hour, sample count and confidence. Retained
graph engines accept these prices without changing historical crafting behavior. Choosing a price
does not change the acquisition choice or pin it. Editing its amount creates a manual override.

The browser refreshes bound prices on opening, edits, window focus and once a minute. Failed or
incompatible refreshes preserve the cached amount but prevent a new calculation until corrected or
overridden. Refresh follows the newest observation across definitions with the same cohort ID,
purpose and exact parsed query. Changed definitions require another selection; a missing retained
definition, truncated lookup or newest compatible observation without a usable price reports an issue.
The selected revision is saved in the price reference. Historical snapshots can select an earlier
compatible revision at their cutoff without rewriting hourly history or changing crafting rules.
Observation timestamps remain visible; a successful lookup is not evidence of new listings.

Shared HTTP/MCP operations expose lookup, binding, refresh and paginated hourly history. Calculation
remains deterministic from supplied graph prices; programmatic callers explicitly refresh first.

## Currency and essence exchange prices

Both games can bind graph consumables and eligible NNN essences to captured hourly exchange data.
Canonical item IDs select direct pairs in the graph's accounting currency (chaos, divine, exalted,
or a canonical currency ID). Realm and league are mandatory; PoE 2 uses its separate realm. The
shared lookup also accepts an observation cutoff for historical calculations.

`traded-volume-ratio-v1` divides traded quote units by traded item units. This is a historical
volume-weighted estimate, not a current listing or guaranteed purchase price. The UI shows the
captured hour, units traded and observed ratio range. Missing or zero-volume pairs remain unpriced;
the lookup does not substitute an older positive-volume hour. Confidence remains uncalibrated,
and Gold, trading time and indirect currency conversion are excluded. A currency priced in itself
has unit cost one without an exchange observation.

Exchange lookup optionally accepts `window: "adaptive-v1"`. This versioned policy starts at the
latest captured hour and considers complete six-hour and 24-hour trailing windows while the current
estimate contains fewer than 100 traded input units. A wider window is accepted only when every UTC
hour is captured and the highest positive hourly volume-ratio estimate is at most 1.1 times the
lowest. The estimate divides summed quote volume by summed input volume; it never averages hourly
prices. These thresholds are explicit estimation assumptions, not calibrated confidence or trade
counts. A busy market stays hourly; a sparse market may still have fewer than 100 units after 24 hours.

A latest hour with no usable trades stays unknown. Captured older zero-trade hours may participate
in a window, but absent/invalid hours stop widening. Reversed pair IDs are deduplicated per hour;
conflicting copies are unusable. Historical cutoffs exclude later observations. Responses expose
`windowStart` and the latest `hour`, volumes and ranges; incomplete ranges stay unknown. Existing
hourly history is retained unchanged, and its history endpoint continues to return unaggregated rows.
No additional ingestion storage is required. Equipment medians are not aggregated by this policy.

The picker offers hourly and adaptive estimates. Selecting an adaptive quote stores its policy in
the existing exchange reference, so reopening, refresh and whole-process historical calculations
keep the choice. Old references retain latest-hour behavior; editing the amount removes the binding.
The saved price label identifies the adaptive estimate and explains that its timestamp is the latest
observation. The lookup preview shows the actual selected window. Future changes to these thresholds
or semantics require a new policy identifier rather than modifying `adaptive-v1`.

Bindings use an `exchange:v1:` reference in the existing graph price contract and share the live
refresh and explicit manual-override behavior above. Bulk loading only fills unpriced inputs;
replacing a manual value requires selecting that estimate. The NNN list sorts compatible quotes in
the graph's accounting currency before unpriced recipes. Shared HTTP/MCP operations expose lookup,
binding, refresh and paginated history. The ingestor uses the [public GGG CDN feed](https://www.pathofexile.com/developer/docs/reference#currencyexchange)
without resolving or sending its OAuth token; authenticated stash requests remain separate.
The browser displays up to 168 historical observations. Historical lookup accepts an observation-time
cutoff, and seeded MySQL integration verifies a complete craft at two league points: 20/5 chaos for
the same base plus a fixed 2-chaos preparation gives total costs of 22/7 chaos.

## Whole-process cost history

`get_crafting_price_snapshots` / `POST /api/v1/crafting/market/snapshots` accepts a graph and up to
24 UTC-hour timestamps. It sorts and deduplicates them, looks up each bound input at or before each
timestamp, and returns independent graph snapshots. Missing bindings and unsupported market-price
sources return gaps; present-day cached quotes are never substituted. Call the retained graph
calculation operation on each available snapshot. The browser performs those calculations in workers
and shows a chart and table without saving the historical prices over the live project.

Rules, pinned acquisition choices, manual input prices and manual sale assumptions stay fixed across
the series. Automatic acquisition choices are compared again at each date. Observation times and the
lowest item asking-price confidence remain visible; this is not a combined confidence interval for
the process. Cost sampling intervals describe simulation sampling only. Exchange estimates still have
uncalibrated confidence. The cutoff uses the latest captured hour, which can be older than the chosen
date; it does not promise a listing was still available then. Adaptive exchange bindings use the
policy above at each historical cutoff. Equipment bindings use the policy below.

## Adaptive equipment estimates

Equipment lookup accepts an optional `window: "adaptive-v1"`. Existing references and hourly
charts keep their original behavior. The ingestor computes optional trailing 6/24-hour summaries
inside each currency's `prices.windows` JSON before pruning. It keeps the latest observation per
revision, league, account and item within each window **before** testing cohort membership, then
computes the exact median and distinct seller count. It never averages hourly medians. Asking
observations do not establish current inventory, completed sales or market-wide coverage.

This version widens below ten priced sellers, first to six hours and then to 24, provided every
source hour has equipment observations for that league/revision and the highest hourly median is
at most 1.1 times the lowest. Missing/pruned hours stop widening; old summaries without windows
remain hourly. A latest hour without a price stays unknown. Unknown matches are excluded from
prices and retained in the window's confidence denominator. The confidence heuristic and the
ten-seller/10% thresholds are explicit, uncalibrated assumptions. Future changes require a new
policy identifier.

Repeated observations count once even if the price, currency or cohort membership changes.
Corrections mark later dependent summaries dirty, and pruning preserves source observations until
those summaries are acknowledged. No raw archive or database migration is added. Development replay
can regenerate these summaries from source data; previously published hourly prices stay separate.
The browser, HTTP and MCP use the same selector and binding. The chosen policy survives reopening,
refresh and historical process calculation; the picker displays its actual window and observation
count, and editing an amount makes it a manual assumption. PoE 2 equipment remains manual.
