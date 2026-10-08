# Crafting price sources

Equipment lookups require the `stash_cohort` and `stash_cohort_hourly` migrations,
including the `baseTypes` column. Apply the existing migrations to the target
database before deploying code that queries them (`APP_ENV=dev vp run db:migrate`
from this app). An HTTP 500 here is a deployment failure, not missing market data.

Run the persistent worker described in [stash ingestion](../../../packages/poe-stash-ingest/README.md).
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

Recipe identity references:

- [Extracted Bestiary component identities](https://www.poewiki.net/wiki/Module:Bestiary/components).
- [Black Mórrigan recipe components](https://www.poewiki.net/wiki/The_Black_M%C3%B3rrigan).
- [Four-sacrifice beastcrafting](https://www.poewiki.net/wiki/Beastcrafting).
- [Mountain Lynx in the Bestiary](https://www.poewiki.net/wiki/Bestiary).

The 3.29 imprint beast is named Craicic Croaker in the current feed. A missing or
renamed source identity fails closed; no fuzzy name match or cheapest unrelated
beast is used.
