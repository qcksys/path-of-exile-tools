# Crafting price sources

Equipment lookups require the `stash_cohort` and `stash_cohort_hourly` migrations,
including the `baseTypes` column. Apply the existing migrations to the target
database before deploying code that queries them (`APP_ENV=dev vp run db:migrate`
from this app). An HTTP 500 here is a deployment failure, not missing market data.

The app's existing 15-minute schedule captures the six most recent completed
exchange hours for PC PoE 1 and PoE 2, across all leagues in each digest. Failed
hours are retried on the next sweep; older gaps require a historical backfill.
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
| Base items and supported prepared donors | Captured public stash cohorts | Asking-price distributions, seller counts and coverage checks. Requires actual matching observations; unsupported modifiers, exact preparation and PoE 2 equipment remain manual. |
| Beast recipes | [poe.ninja Beast overview](https://poe.ninja/docs/api) | Derives the full component list from the project's retained catalog. Maps verified component IDs to exact feed identities, and requires every component to have a positive quote with listings. Includes all four sacrifices. The user must choose `rare-beast-mountain-lynx-v1` to use Mountain Lynx as the price assumption for extra rare beasts. Level-sensitive recipes remain manual because this feed does not distinguish beast levels. |
| Locus of Corruption | [poe.ninja IncursionTemple overview](https://poe.ninja/docs/api) | Exact `locus-of-corruption-tier-3-temple` entry only, for one usable room; combined temple variants are not substituted. |
| Recombination service, gold, dust, time, arbitrary rares and unsupported prepared inputs | User-entered assumption | No reliable automatic chaos price. These inputs remain unknown until the user supplies an amount. They are never treated as free. |

Equipment and exchange lookups use the latest 24 completed hourly buckets at
the requested cutoff. Historical cutoffs remain inclusive, but cannot select
an incomplete future hour. Older observations remain available in history and
are not returned as current prices. Failed refreshes preserve saved assumptions
and report an issue; the browser blocks calculation until it is resolved.

Equipment lookup can opt into `exchange-v1`: prefer the requested listing
currency, otherwise convert a chaos, divine or exalted hourly median with an
exchange observation from exactly the same hour, realm and league. Converted
estimates use only the one-hour listing pool, even with `adaptive-v1` selected.
The saved reference retains the source currency and full exchange quote;
combined confidence is unknown. History continues to show raw listing medians.

The cohort generator derives 26 exact definitions from all 27 purchases in the
ten configured presets. These preserve the configured base, level, rarity,
influences and explicit modifier counts/identities. Capture retains their bases,
including influenced donors. Raw-listing tests can populate 24 purchases; the
three elemental bow donors remain unknown when visually identical modifier
identities cannot be distinguished. A definition does not imply available stock
or a captured price. Regenerate and restart the equipment worker after updating
the manifest so new definitions and observations reach the database.

Beast and temple sources are PoE 1 PC current listing estimates. They support
chaos, divine and exalted via the corresponding upstream values. Counts are
listings, not unique sellers or completed sales. The saved timestamp is retrieval
time; confidence is uncalibrated. The backend caches according to response
`Cache-Control`/`Age`, revalidates with `ETag`, uses a descriptive User-Agent,
bounds response size and does not substitute expired data after a failed fetch.

The UI, HTTP and MCP operations use the same lookup and binding functions.
Selecting a quote explicitly replaces a manual value; the bulk action only fills
unpriced inputs. Refresh retains source scope and the rare-beast assumption.
Historical process snapshots return an explicit gap for these current-only
sources; they never reuse today's quote for an earlier date.

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
- [Mountain Lynx in the Bestiary](https://www.poewiki.net/wiki/Bestiary).

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
