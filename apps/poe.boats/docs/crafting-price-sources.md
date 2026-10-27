# Crafting price sources

Equipment lookups require the `stash_cohort` and `stash_cohort_hourly` migrations,
including the `baseTypes` column. Apply the existing migrations to the target
database before deploying code that queries them (`APP_ENV=dev vp run db:migrate`
from this app). An HTTP 500 here is a deployment failure, not missing market data.
Lookups read only revisions listed in `stash_cohort_revision_hour`, which ingest
writes with each equipment batch. Its migration backfills existing observations;
after deploying, rerun that backfill with `WHERE hour >= <migration hour>` so hours
written by the previous worker in between are listed.

The app's existing 15-minute schedule captures the six most recent completed
exchange hours for PC PoE 1 and PoE 2, across all leagues in each digest. Hours
whose digest markets are already all stored are not rewritten. Failed or partially
stored hours are retried on the next sweep; older gaps require a historical backfill.
Exchange collection runs independently of scarab collection. Deploying this
code activates collection using the existing database and cron configuration.

Equipment capture still needs the persistent worker described in
[stash ingestion](../../../packages/poe-stash-ingest/README.md).
Use a separate database/Compose project for each realm and league. A new stash
cursor starts at the oldest available page; moving to current listings skips
uncaptured history and requires an explicit operator decision. Exchange ingestion
waits until the saved hour has completed. Committed pages, pending deliveries and
captured history survive restarts. DuckDB 1.4.5 contains the upstream fix for the
[fatal column-update race](https://github.com/duckdb/duckdb/pull/20334) observed during dev ingestion.

| Cost | Source | Coverage and limits |
| --- | --- | --- |
| Currency, essences, oils, fossils, resonators, lifeforce and other canonical exchange items | [GGG hourly currency exchange](https://www.pathofexile.com/developer/docs/reference#currencyexchange) | Direct traded-volume ratios in the selected game, realm and league. Optional `reference-currency-v1` tries a two-leg conversion through chaos, divine, then exalted when a direct quote is absent. Both legs must have positive volume and the same hour and adaptive window. The result exposes both legs and does not invent direct traded volume or a traded range. Old bindings retain direct-pair behavior. |
| Supported PoE 1 crafting currencies, essences, fossils and verified empty Prime Chaotic Resonators | Captured public stash commodity buckets | Explicit alternative asking-price source for supported currencies with a unique matching ID/name in the retained catalog. Fossils also require agreeing extracted fossil metadata. Only the two allowlisted Prime Chaotic Resonator IDs may share a name, with matching retained metadata and mandatory `empty-resonator-v1` / `reroll:4` capture provenance. Generic resonator buckets, stored imprints and other unsupported stateful currencies are excluded. Requires exact base type, empty name, currency frame and ordinary item flags; ordinary commodities require no variant signature. Quotes and references preserve the resonator variant and selected ID. Prices are per item in the selected league and currency, with observed hour, range, priced sample count, total listings and total sellers. Never silently replaces an exchange quote. |
| Base items and supported prepared donors | Captured public stash cohorts | Asking-price distributions, seller counts and coverage checks. Requires actual matching observations; unsupported modifiers, exact preparation and PoE 2 equipment remain manual. |
| Beast recipes | [poe.ninja Beast overview](https://poe.ninja/docs/api) | Derives all four sacrifices from the project's retained catalog. Named recipe beasts use exact feed identities. Remaining rare sacrifices use one generic Yellow Beast pool: the listing-count-weighted mean of positive eligible species estimates. Every component needs a positive quote. Level-sensitive recipes remain manual because this feed does not distinguish beast levels. |
| Locus of Corruption | [poe.ninja IncursionTemple overview](https://poe.ninja/docs/api) | Exact `locus-of-corruption-tier-3-temple` entry only, for one usable room; combined temple variants are not substituted. |
| Recombination service, gold, dust, time, arbitrary rares and unsupported prepared inputs | User-entered assumption | No reliable automatic chaos price. Missing assumptions remain unknown. New recombination presets explicitly use the requested 0-chaos self-service assumption, excluding gold and dust opportunity cost. |

The eight presets containing recombination start with a shared `service:recombine`
price of 0 chaos, recorded as `source: manual` with unknown confidence. Their
descriptions state the self-service assumption. The engine charges one service
unit per attempt, including retries; users can replace the shared amount or set
a price for an individual step. Gold and dust are not separately quantified price
inputs. This default applies only when creating those presets. Saved graphs,
existing manual amounts and custom graphs with missing prices are unchanged.

Equipment, exchange and captured currency lookups use the latest 24 completed hourly buckets at
the requested cutoff. Historical cutoffs remain inclusive, but cannot select
an incomplete future hour. Older observations remain available in history and
are not returned as current prices. Failed refreshes preserve saved assumptions
and report an issue; the browser blocks calculation until it is resolved.

Equipment lookup matches cohort definitions to the configured item before applying
the 2,000-candidate response limit. Definitions are scanned in bounded pages using
database ordering; only matching definition/revision pairs receive hourly lookups.
Unrelated cohorts sharing a base name cannot hide an eligible quote. Item-matching
cohorts that do not cover every requirement remain visible with their reasons.
More than 2,000 relevant observations still produces an explicit truncated result;
refresh refuses to establish a latest price from an incomplete result.

Equipment lookup can opt into `exchange-v1`: prefer the requested listing
currency, otherwise convert a chaos, divine or exalted hourly median with an
exchange observation from exactly the same hour, realm and league. Converted
estimates use only the one-hour listing pool, even with `adaptive-v1` selected.
The saved reference retains the source currency and full exchange quote;
combined confidence is unknown. History continues to show raw listing medians.

Automatic purchase pricing must guarantee the configured starting base, exact
item level, rarity, affix counts, influences and supported item flags, as well
as its explicit modifiers and output requirements. Matching a configured item
to a broader cohort is insufficient: mixed-rarity or level-band medians can
omit preparation costs or change the available modifier pool. Such cohorts
remain market evidence for a manual assumption, not a complete purchase price.
The same validation applies to binding and refreshing existing prices.

Fractured-source model 4 can identify one exact invariant literal fracture despite a known
defence-magnitude enchantment. The selected source profile still charges enchantment removal;
the exception does not apply to numeric/scalable fracture text, ambiguous identities or
implicit magnitude effects. Earlier capture models retain their original classifications.

The cohort generator derives 53 purchase-specific definitions from all 62 purchase
alternatives in the ten configured presets. These preserve canonical base identity,
level, rarity, influences and explicit modifier counts/identities. Capture retains
their bases, including influenced donors. Fifteen Magic alternatives are available
for equivalent immediate recombination donors, including the flat-ES/recovery
prefix/suffix pair; the presets retain their pinned Rare defaults.
Users may explicitly choose a Magic alternative or
automatic acquisition, which considers only alternatives with known prices and
refuses an entirely unpriced set.

Revision 9 presets also offer explicit production alternatives for fourteen isolated
natural Magic donors. Each acquires its exact Normal base, uses Transmutation and
Alterations to roll the target, and uses Annulment to remove an opposite affix.
Losing the target returns to Alterations on the same item. Base purchases and
every currency attempt are charged separately; their prices start unknown.
The fourteen base acquisitions share six exact definitions. Additional explicit
preparations cover the paired ES recovery donor, supported NNN donors and influenced
boots. Five concrete shield sources offer paid Scouring into the existing Normal
base acquisitions. Janus and the drop-only Grasping Mail modifier still require
their exact prepared purchases. Older revisions and saved graphs retain their existing recipes.

Capture fixtures exercise both optional modifier identity metadata and documented
descriptions, flags and required-influence constraints. Metadata identities share
the text model's equipment domains, so unrelated item domains cannot create false
name collisions. Overlapping displayed equipment identities and unsupported text
remain unknown. Fixture coverage does not guarantee live coverage. A definition does not
imply available stock or a captured price. Regenerate and restart the equipment
worker after changing cohort queries so new definitions and observations reach
the database. Display-name-only changes can continue using compatible retained
query revisions.

Two-Toned Boots has multiple canonical base variants with the same display name
and different native implicits and defences. Native implicit evidence establishes
the canonical base only when it uniquely identifies a catalog variant. Generated
boot queries require that canonical `baseId`; genuine ambiguity remains unknown.
Legacy name-only cohorts remain browsing evidence rather than complete acquisition
prices.

Exchange history remains available for canonical items without a current quote,
including after a failed lookup. Zero traded volume is shown as zero volume and
an unknown price. Viewing an older positive observation never fills a current
price or replaces a manual amount.

Captured currency asks are an explicit source choice, separate from completed
exchange trades. Bulk listing ratios such as `~price 10/5 chaos` are normalized
to 2 chaos per item at capture; stack size does not multiply or divide that amount
again. The latest compatible bucket must contain a positive requested-currency
distribution; a newer empty or invalid distribution does not fall back to an older
positive bucket. Sample counts include priced listings in that currency, while
listing and seller counts include the whole exact-identity bucket. Sparse asks
can vary widely and confidence remains uncalibrated. Binding records the canonical
ID, source kind, realm, league, currency and observed hour. Refresh and historical
process snapshots query stored buckets at their own cutoffs; no current-only quote
is substituted for history. The history link opens the raw asking distributions.

Captured currency lookup can explicitly enable `exchange-v1` conversion, with the UI option
unchecked by default. Native asks in the project currency take precedence;
otherwise the same newest bucket may supply chaos, divine or exalted asks. The
existing exchange resolver must supply a positive rate from that exact hour,
realm and league, optionally through its verified two-leg reference-currency
path. Older listing hours and older exchange rates are never substituted. A
present but invalid native distribution remains unknown. Quotes and saved
bindings preserve the original currency, median, range and full exchange quote;
displayed converted ranges are scaled asking ranges, not exchange trade ranges.
History opens the original listing currency, and combined confidence is unknown.
The explicit conversion policy survives binding even when native asks currently
win, so subsequent refresh and historical snapshots use the same policy. Old
bindings remain direct unless the user explicitly selects a new quote.

Beast and temple sources are PoE 1 PC current listing estimates. They support
chaos, divine and exalted via the corresponding upstream values. Counts are
listings, not unique sellers or completed sales. The saved timestamp is retrieval
time; confidence is uncalibrated. The backend caches according to response
`Cache-Control`/`Age`, revalidates with `ETag`, uses a descriptive User-Agent,
bounds response size and does not substitute expired data after a failed fetch.

The Yellow Beast pool uses a finite derived allowlist from game build `3.29.3.3`:
169 active ordinary capturable species names, cross-checked against the
`AnyCreature`/`Rare` recipe requirement. Named recipe components, legendary,
unique and disabled-only identities are excluded. Unknown names and ambiguous
duplicate feed identities are rejected. This is a reviewed inference from the
game tables, not an official interpretation of their unnamed boolean columns.
The generated data records the schema and table hashes; regeneration with
`scripts/generate-yellow-beasts.ts` requires those exact reviewed inputs.

`listing-count-weighted-mean-v1` weights each eligible species estimate by its
upstream listing count. It is not a median of individual asks or a count of unique
sellers. The returned generic component retains the contributing estimates for
arithmetic validation; there are no individual yellow-beast price controls or
stored species price series. An empty positive pool leaves the whole recipe
unpriced. New beast quotes use this pool without a species assumption checkbox.
Saved `rare-beast-mountain-lynx-v1` references remain readable, but lookup/binding
refuse them with an instruction to select a new generic quote; refresh does not
silently change their meaning.

The UI, HTTP and MCP operations use the same lookup and binding functions.
Selecting a quote explicitly replaces a manual value; the bulk action only fills
unpriced inputs. Refresh retains source scope and the generic beast pricing policy.
Historical process snapshots return an explicit gap for current-only beast and
temple sources; they never reuse today's quote for an earlier date.

The standalone workbench uses those same lookups and explicitly copies selected
estimates into its chaos-price fields. These are fixed amounts, with no automatic
refresh; existing manual entries survive bulk filling. Starting-item cost remains
a separate assumption. Both editors discover possible bench-removal fees and
expose any additional costs recorded during calculation.

Revision r8 adds graph prices per crafting step for generated items and
recombination. Each override uses an encoded node/cost key and falls back to the
shared price when blank. Zero is an explicit assumption. The same prices apply
to retries and acquisition comparisons. Existing projects remain on their saved
revision until explicitly upgraded; r1–r7 calculation artifacts are unchanged.

Recipe identity references:

- [Extracted Bestiary component identities](https://www.poewiki.net/wiki/Module:Bestiary/components).
- [Black Mórrigan recipe components](https://www.poewiki.net/wiki/The_Black_M%C3%B3rrigan).
- [Four-sacrifice beastcrafting](https://www.poewiki.net/wiki/Beastcrafting).
- [Pinned generic-beast classification](../app/lib/crafting-yellow-beasts.generated.json).

The 3.29 imprint beast is named Craicic Croaker in the current feed. A missing or
renamed source identity fails closed; no fuzzy name match or cheapest unrelated
beast is used.

New resonator selections omit the eight old non-stackable identifiers. An existing
selection keeps its exact identifier and is labelled legacy; no name-based price
alias is applied. Stackable alchemical resonators remain selectable as
"Ruthless / legacy": [GGG's 3.16 notes](https://www.pathofexile.com/forum/view-thread/3186390#delvechanges)
removed their normal acquisition sources but preserved existing items, and the
[wiki's resonator history](https://www.poewiki.net/wiki/Resonator) records their
Ruthless availability and conversion of old non-stackable items on pickup.

PoE 1 essence vendor upgrades are a separate, explicit ingredient-cost estimate.
The source picker resolves the selected lower-tier essence through the existing
verified vendor-recipe catalog and exact, unique canonical essence/currency IDs.
It accepts only forward three-for-one steps; no downgrade, corrupted essence,
cross-family or PoE 2 substitution is inferred. For example, nine Weeping Essences
of Rage produce three Wailing Essences of Rage and then one Screaming Essence of
Rage ([Wailing recipe](https://www.poewiki.net/wiki/Wailing_Essence_of_Rage),
[Screaming recipe](https://www.poewiki.net/wiki/Screaming_Essence_of_Rage)).

`vendorUpgrade.inputId` explicitly selects the ingredient in the existing source
lookup operation. The returned `vendor-upgrade` quote and saved binding retain
the ordered recipe IDs, canonical input/output IDs, quantities, original positive
exchange quote, observed hour and traded volume. Optional
`reference-currency-v1` conversion retains both matching-hour exchange legs.
The resulting amount is ingredient quantity multiplied by its unit quote, not
a direct market quote for the produced essence. Confidence remains unknown:
three traded ingredient units do not establish that the nine required units are
available, and the estimate excludes acquisition gold and time.

Refresh and historical snapshots keep the selected ingredient and recipe path;
they do not choose a cheaper ancestor or silently switch to direct captured asks.
The exchange resolver's cutoff and newer-zero rules still apply. A failed refresh
keeps the saved amount with an explicit issue, while an unavailable historical
point remains unknown. Direct essence asking prices remain separately selectable.
Manual amounts change only on explicit selection; the standalone workbench copies
the chosen estimate as a fixed numeric amount using its existing semantics.

The same explicit ingredient estimate also supports one-step PoE 1 NPC currency
purchases from the curated vendor catalog. For example, [Nessa sells one Orb of
Augmentation for four Orbs of Transmutation](https://poedb.tw/us/Orb_of_Transmutation).
The picker and saved reference retain the Purchase Items instructions and recipe
source; selling those ingredients has a different result. Currency purchase paths
never chain multiple recipes or include sell-window downgrade recipes. A missing
or zero-volume direct Augmentation quote remains unavailable until the user
explicitly selects the separate estimate from a positive Transmutation quote.
