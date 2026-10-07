# Crafting projects and item economy design

Agreed requirements from the design interview on 7 October 2026. Crafting projects connect acquisition,
crafting, recovery, and sale steps so users can calculate the economics of a complete process. The user
confirmed the scope; remaining technical investigations are listed below.

## Confirmed requirements

### Items and crafting processes

- A graph consumes and produces items. Recombination requires two supplied inputs. Recoverable results
  can return to an earlier input, reducing the items that must be acquired again.
- Outcome branches describe properties the user cares about through item queries. A branch can require
  certain modifiers, their tiers, open prefix or suffix slots, rarity, item level, base, links, and flags.
  Unspecified properties do not exclude an otherwise matching result.
- Default routing order puts queries with more conditions first, then prefers the lower-probability
  complete matching outcome. Use the branch's match probability, not individual modifier spawn
  weights. The user can override the order by dragging branches. Preserve manual order until the
  user restores automatic ordering; keep stable order when probabilities cannot be compared.
- Use the same query semantics for graph outcomes, project inputs, market groups, the internal item
  index, and generated trade searches. Trade-site filters and pseudo stats are the reference vocabulary.
  Handle imperfect translations case by case. Hybrid-modifier queries can falsely match separate
  lower-tier modifiers with similar displayed totals; document this limitation rather than assuming
  that a stat-range search establishes exact modifier identity. Detailed compatibility policy is deferred.
- Align source item attributes with GGG's API model. PoE 1 and PoE 2 may share generic structures without
  sharing crafting rules, rarity valuations, or method availability.
- Both games are required in the first release. Their examples and validation cases must be separate.
- Support preparation sequences, repeated attempts, recovery loops, multiple input recipes, and several
  acceptable terminal outcomes. Terminal outcomes can be the intended item, a useful or profitable
  alternative, or a discarded item.
- Calculate per-item expected costs and returns. Completion milestones and batch progress are not
  required. Scaling expected returns by quantity assumes unchanged prices and sufficient supply; it
  does not make uncertainty or cash requirements scale in the same way.
- Preserve historical crafting eras and their methods, data, probabilities, and behavior. Removing a
  method from a new era must not remove it from old projects. Generate versioned data from game files
  where possible; preserve researched rules and behavior implementations separately where needed.
  Era definitions are curated, normally around major gameplay patches, rather than inferred solely
  from client build numbers. The user's selected splitting example retains one output; output count
  must belong to the specific operation
  and ruleset rather than a universal assumption that splitting always yields two usable items.
- Expose applicable non-native natural modifier sources, including eligible essences, for an item.
  Compare market costs for eligible methods and acquisition alternatives, including buying a prepared
  input. Show acquisition alternatives at each stage and update their comparisons with prices. Users
  need to compare guaranteed purchases with cheaper but uncertain or time-consuming crafting routes.
  Automatic choice selects the lowest known expected acquisition cost. Selecting an alternative pins
  it through price refreshes until the user returns to Automatic. Show other alternatives and their
  confidence, expected actions, and outcome guarantees alongside the selected route.
- Run crafting calculations primarily in the browser, with expensive work off the UI thread. The
  backend uses the same domain logic and versioned data for validation and programmatic operations;
  routine graph interaction must not require server rendering or a calculation round trip.

### Economy and historical prices

- Index useful crafting inputs and outcomes, including good bases, T1/T2 fractures, desirable isolated
  modifiers, and valuable modifiers on transfer bases. Generic low-value listings need not each have
  a dedicated price chart.
- Market groups may overlap. Base families, item-level breakpoints, affix isolation, rarity, influence,
  fracture state, sockets, and links can define different groups where they affect a craft.
- Start with broader market groups and add distinctions when observed pricing errors justify them.
  Rebuilding derived data is a development operation. Do not introduce a production raw-event archive
  or a runtime replay feature for this work. Historical rebuilds depend on source data actually
  available to the development process; complete upstream replay is not yet established by the
  sources checked. Preserve existing charts across development rebuilds. Backfill additional groups
  when source data supports it and retain explicit coverage boundaries otherwise. The user does not
  consider this limitation a blocker for the initial implementation.
- Prices are live by default, including when opening saved projects. Keep historical estimates and
  confidence information so the same process can be evaluated at earlier points in a league.
- Use stash observations and currency-exchange data according to their available coverage. Wider
  time windows for low-volume periods are desired; the underlying retained resolution is undecided.
- Confidence should account for evidence such as volume. Purchase cost, asking price, likely sale
  evidence, and recovery value need explicit definitions rather than one undocumented price field.
- Add seeded replay coverage spanning early and middle league conditions, with thousands of updates
  or more. Tests should start with source responses and exercise ingestion, classification, persistence,
  prices, and resulting process costs. Replay fixtures are development assets, not a production archive.
- Configure and run the local ingestion pipeline through Docker Compose. Include documented startup,
  shutdown, configuration, and developer replay commands. Persist ingestion state across container
  restarts, keep credentials outside committed configuration and images, and preserve the existing
  single-writer constraint for the local ingestion database.
- Do not automatically price arbitrary rare-craft misses or most rare items in the initial release.
  Explicit sale branches can use a manually entered price or a tracked market group. Other misses
  receive no recovery credit in the calculation, labelled as excluded recovery rather than a verified
  market value of zero. Curated fractured or isolated-modifier groups remain useful even when the
  qualifying items are rare.
- Do not ingest PoE 2 stash equipment for the initial release. Generate a trade-search URL from the
  desired item query; the user checks the results and enters an equipment price. Currency-exchange
  data remains usable where available. This basic manual-price path is required, independently of
  the deferred advanced assumptions interface.

### Projects and persistence

- A new item crafting plan opens in a new in-app tab. It can have multiple acceptable outcomes and
  target only selected modifiers; other modifiers are optional unless a query constrains them.
- Group item plans into a build and allow sharing at either the item-plan or build level. Final names
  for these two levels remain open.
- A build can save an item plan by reference or by value. A reference follows the saved plan; a value
  copy is independent of later source edits. Expose this choice when adding an existing plan. Frozen
  build shares capture all included plan revisions, including plans normally attached by reference.
- Save anonymously in local storage by default. Offer account storage and synchronization.
- At sign-in or account creation, offer a default storage choice. When cloud storage is selected,
  synchronize drafts privately; synchronization does not itself publish a project.
- Support both frozen process snapshots and live links to saved processes. Prices remain live by
  default. The relationship between frozen process revisions and historical calculations needs to be
  explicit.
- Corrections to a historical probability model create a new model revision within the same era.
  Existing projects retain their revision and show that a correction is available, with an action to
  recalculate using it. New projects use the latest corrected revision for their selected era.
- Preserve portable serialization and JSON import/export.
- New functionality must follow the repository's shared UI, HTTP, and MCP operation requirements.

## Example processes to preserve

These are user-proposed workflows. Their exact eligibility and probabilities must be checked against
the selected game's ruleset; the numerical probabilities discussed in the interview were illustrative.

### Physical axe recombination

1. Produce a donor with T1 increased physical damage through alteration crafting.
2. Independently produce a donor with T1 hybrid physical damage.
3. Consume both in recombination. Route a result with both target modifiers forward. Route a result
   retaining only one target modifier back to its corresponding input. Handle other results through
   an explicit disposal or recovery route. Ignore suffixes in these particular outcome queries.
4. Prepare the successful donor using the proposed crafted-prefix, suffix-filling, craft-removal,
   and influenced-exalt sequence where legal.
5. Prepare the desired base using an eligible non-native natural essence source until it also has
   the target flat physical modifier.
6. Recombine the prepared donors. Evaluate base selection, eligible modifiers, exclusivity, and
   selection rules before classifying results. Route acceptable partial results and failures
   according to their queries; do not assume every failure destroys all prior usable inputs.

The graph must charge only for consumed resources and newly required inputs. A recovered item is not
a fresh purchase, and one physical output cannot simultaneously supply two consumptive inputs.

### Energy shield armour acquisition

Compare buying a suitable Necrotic Armour against acquiring and preparing one. Query constraints can
include item level, absence of disqualifying flags, and six links. Compare applicable linking methods
and buying an already linked base. After preparation, repeat alteration crafting until the target
energy-shield query matches, then pass the resulting item to the next operation.

The method model must determine the success probability. A modifier's share of one eligible pool is
not automatically the probability of the complete transmute or alteration outcome. Expected attempts
and attempts needed for a chosen success probability are distinct results.

### Grasping Mail and fractured inputs

Price the required ring inputs, generate Grasping Mail outcomes, identify the target modifier, and
route misses according to their useful modifiers and isolation state. Include recovery and transfer
costs where supported. Separately compare buying a desired fractured input against acquiring a base,
rolling the target, and applying the relevant fracture process with its possible failures.

## Deferred scope

- Recording actual purchases, crafting actions, sales, and progress against a hypothetical plan.
- Matching a pasted real item to positions in a plan for execution assistance. Preserve this intended
  capability without requiring an execution ledger in the initial release.
- A full interface for supplying and editing uncertain probabilities, prices, and method assumptions.
  The initial behavior for unknown inputs still needs a decision; unknown values must not silently
  become factual zero-cost or guaranteed-success inputs. Simple manual equipment prices are in scope.
- Comprehensive automatic resale valuation for arbitrary rare outcomes and exhaustive trade-query
  translation. Address supported translations and meaningful market groups incrementally.
- User-authored reusable templates and content-creator build craft libraries. Keep developer-defined
  reusable processes possible so later templates do not require an unrelated calculation model.
- Automatic discovery of a complete crafting strategy is not required. Comparisons among explicit
  user-selected acquisition or preparation alternatives remain in scope.

## Proposed historical era publication

Keep complete logical data snapshots and publish a small manifest for each supported era. Store
unchanged files once by content hash. Generate a change report when updating an era, but do not require
the browser to reconstruct a catalog through a chain of historical deltas. Load only the requested
era and cache immutable files. The current PoE 1 and PoE 2 crafting catalogs compress to approximately
1.10 MB and 0.645 MB with gzip, respectively; these figures cover catalogs, not all source assets.

Keep the following identities separate:

| Identity | Purpose |
| --- | --- |
| Game and crafting era | Select the user-visible rules period, such as PoE 1 3.29 |
| Client build | Identify the exact source game files used in extraction |
| Dataset revision and hash | Identify the exact normalized data and extraction result |
| Rules implementation revision | Identify probability models and executable operation behavior |
| Market valuation time | Select current or historical prices independently of crafting rules |

An era manifest references the dataset, compatible rules implementation, and available mechanics.
Removing Allflame from a newer era changes that manifest and its applicable rules without deleting
the older implementation. Reuse handlers while their semantics are unchanged; preserve a separate
handler revision when semantics change. Availability needs explicit era metadata because a record's
presence in client files does not prove it is usable in that league.

Extraction should automate new records and changed values wherever their meaning is already
understood. New operation semantics or previously unknown server probabilities can still require
code or research. Configuration files cannot by themselves establish those rules.

The browser worker should load and validate its pinned catalog and execute the matching rules.
Server operations must resolve the same known revisions and use the same domain implementation.
Project JSON references versions; it does not embed a complete catalog or arbitrary executable code.
Keep historical regression fixtures for the supported revisions. Saved projects retain their exact
model revision until the user opts into a correction.

For example, an era can publish model revisions `r1` and `r2`. Each immutable revision manifest points
to a dataset hash and a rules implementation identifier. If only weights change, `r2` points to a new
dataset and reuses the existing implementation. If the algorithm changes, it points to the corrected
implementation as well. Unchanged data files are reused by hash. A small latest-revision pointer lets
the UI detect corrections without overwriting `r1`. This naming is illustrative, not an implemented
file layout. Graph revisions and market valuation times remain independent of model revisions.

The existing [extraction pipeline](../packages/poe-game-data/src/pipeline.ts) already publishes immutable
raw and normalized snapshots with schemas, hashes, extractor sources, and dependency provenance.
Its [documentation](../packages/poe-game-data/README.md) describes offline replay. Those ignored local
snapshots need durable retention if they are to support future regeneration; Git alone does not
preserve them. This game-data retention is separate from the rejected production market-event archive.

Today, [package materialization](../packages/poe-game-data/src/distribute.ts) and the
[browser exporter](../apps/poe.boats/scripts/export-crafting-catalog.ts) overwrite the latest package
and catalog. The [page loader](../apps/poe.boats/app/routes/crafting/page.tsx) fetches that current catalog,
and project validation pins only the client build. Introducing addressable historical datasets and
rules implementations is therefore new work, rather than enabling an existing era selector.

## Implementation baseline and source constraints at interview

The existing [project schema](../apps/poe.boats/app/schemas/crafting.ts) and
[process simulator](../apps/poe.boats/app/lib/crafting-simulation.ts) already support conditional routes,
restarts, loops, resource costs, and exact or sampled calculations. They carry one current item;
recombination embeds a fixed donor. A production graph must add input consumption and recovery semantics.
Current routes are ordered and use the first match, with coverage in
[branch tests](../apps/poe.boats/test/crafting-branches.test.ts).

The [item-text importer](../apps/poe.boats/app/lib/crafting-item-text.ts) can return several interpretations
of ambiguous pasted text. The existing [item predicates](../apps/poe.boats/app/schemas/crafting.ts) cover
many modifier, flag, stat, and slot constraints, but are not a general trade-compatible item query.

GGG's documented item modifier fields contain descriptions and flags without exact modifier IDs or
tiers; a real stash-feed sample is still needed to establish its current behavior. The documented
public stash endpoint covers PoE 1; the currency exchange supports both games and supplies hourly data.
[Official API reference](https://www.pathofexile.com/developer/docs/reference)

### Verified trade response

A live official PoE 1 Standard search and successful fetch on 7 October 2026 returned populated
modifier metadata under `item.explicitMods[].mods[]`. The older `item.extended.mods` shape should not
be adopted as the current trade contract. A sanitized excerpt from one fetched item is:

```json
{
  "typeLine": "Merciless Solar Maul of Haemophilia",
  "baseType": "Solar Maul",
  "rarity": "Magic",
  "ilvl": 84,
  "explicitMods": [
    {
      "description": "179% increased Physical Damage",
      "domain": "explicit",
      "hash": "stat.explicit.stat_1509134228",
      "mods": [
        {
          "name": "Merciless",
          "tier": "P1",
          "level": 83,
          "magnitudes": [{ "min": "170", "max": "179" }]
        }
      ]
    }
  ]
}
```

The official UI's custom search submitted `query.term: "Merciless"`. This verifies magic-affix text
search, not dedicated exact prefix/suffix-name filters. The broad search also matched unrelated items,
so generated searches still need base, rarity, and other applicable constraints.
[Reproducible official search](https://www.pathofexile.com/trade/search/Standard/H4sIAAAAAAAACh3KQQqAIBBA0bv8tSfwDp0gXEhNIFiKMy1EvHvk-r2BWrRX8YNSLZUHT3w602HSbjybtCNlUcWtrPh9YL3KqieOK2WT9kOYYX5MvmZMVAAAAA)

The same item had two displayed bleeding rows associated with the suffix `of Haemophilia`, tier `S0`.
Another result used the name `Merciless` for a `P0` global physical-damage modifier on a shield. Thus
one displayed stat row is not necessarily one affix, and a modifier name alone is not a canonical
identity across item classes. This evidence comes from trade fetch, not a public-stash observation.

The checkout has 1Password references for the stash client, but the investigation session had no
resolved service credentials, usable `op` command, installed ingestor dependencies, or recorded stash
payload. No real stash response was fetched. This is an access limitation of this check, not evidence
that live stash items lack the metadata observed in trade responses.

### Other implementation constraints

PoE 2 equipment coverage is deliberately manual in the first release. Account character items and
currency-exchange history do not supply market-wide equipment listings. Calculator support for both
games does not imply automatic equipment-price coverage.

Original recombinator experiments report weight-dependent modifier retention in some situations,
but leave the exact formula unresolved. The experimenter's 3.26 follow-up also reports changed
exclusive-modifier behavior and uncertainty about low-weight ordinary modifiers. The repository's
current rule of uniform draws without exclusives, weighted draws with any exclusive, a fixed weight
of 1000 for exclusives, and 50/50 side order is a model requiring validation for the selected ruleset.
Do not present it as a confirmed universal game rule.
[Original 3.25 experiments](https://www.reddit.com/r/pathofexile/comments/1exyavx/325_updated_guide_to_recombinators/),
[experimenter's 3.26 follow-up](https://www.reddit.com/r/pathofexile/comments/1ldc3lz/326_recomb_psas_a_few_useful_tipsconfirmations/),
[current implementation](../apps/poe.boats/app/lib/recombinator.ts).

The current [capture filter](../packages/poe-stash-ingest/src/shared/capture.ts) excludes ordinary, magic,
and rare equipment. [Ingestion](../packages/poe-stash-ingest/src/ps/ingest.ts) overwrites the latest raw item
and stores reduced hourly observations. [Pruning](../packages/poe-stash-ingest/src/shared/prune.ts) removes
eligible old history. These data cannot reconstruct arbitrary historical item groups. Replayable
reclassification requires source responses with usable original timing. The user has chosen development
fixtures and available upstream data instead of adding a production archive.

GGG documents the stash endpoint as cursor pagination through current and newly listed stashes, without
a date-seek parameter or a complete-league replay guarantee. Its public stash objects have no documented
observation timestamp. Currency-exchange data is explicitly historical, but its documentation warns
that old history may be removed. A rebuild tool must report actual coverage; deleting a local database
does not establish that identical historical input can be fetched again.
[Feed reference](https://www.pathofexile.com/developer/docs/reference#publicstashes)

Current [market aggregation](../packages/poe-stash-ingest/src/ps/rollup.ts) stores hourly counts and price
summaries. Exact longer-window medians cannot be recovered by averaging hourly medians. Rebuilding
cohorts must also replace obsolete aggregates, rather than only upserting newly produced keys.

Existing [market pipeline tests](../apps/poe.boats/test/market-pipeline.test.mjs) include a repeated
1,000-item stash. [Ingestion integration tests](../apps/poe.boats/test/e2e/stash-ingest.test.ts) exercise
the API client, local database, rollups, receiver, and migrated server database. They provide a
foundation for the requested longer replay scenarios.

Crafting HTTP and MCP registration is currently pending in
[surface coverage](../apps/poe.boats/docs/surfaces.md). The new project and economy work must preserve
the operation and ownership rules in [AGENTS.md](../apps/poe.boats/AGENTS.md).

## Initial implementation investigations

These were recorded before implementation. The current acceptance audit below records their
resolution and the remaining coverage limits; later checkpoint notes are retained as history.

- Validate a real public-stash payload independently of the now-verified trade response. Preserve
  source metadata and ambiguity rather than assuming the two endpoints return equivalent fields.
- Validate exact modifier identification, source-specific tier interpretation, and compound stat
  grouping against real samples for both games. Trade translation remains case by case.
- Establish source coverage for each development replay dataset and preserve existing production
  charts when rebuilding derived data. Do not claim more historical coverage than the input provides.
- Select initial purchase estimators and confidence measures, with unknown prices visibly incomplete
  rather than treated as free inputs. Compare alternatives without silently removing pinned choices.
- Choose retained price resolution and longer chart windows without treating medians as additive.
- Finalize manifest storage and catalog publication, while preserving old revisions and sharing
  identical files. These are implementation details of the agreed historical behavior.
- Define account-sync conflict handling that preserves both edits, ownership checks for referenced
  plans, and self-contained frozen shares. Sharing is read-only unless a later feature adds editing.

## Implementation status

The agreed initial implementation is locally verified. Both-game projects, item queries, economy
integration, retained rulesets, persistence/sharing and Compose ingestion are implemented. Real
public-stash samples verify supported source-text modifier identification; ambiguous or unsupported
items remain unknown and cannot supply automatic prices. Universal fracture/donor identification is
not claimed. Deployment and production migrations are outside this implementation request.

A subsequent recent-page inspection also found no complete modifier metadata: 4,857 items and
15,874 explicit modifier objects at 21:34 Sydney time on 7 October 2026. GGG's public
`/api/trade/data/change-ids` returned an end cursor whose stash page was empty; poe.watch's documented
status endpoint supplied a slightly earlier cursor that returned data through the authenticated GGG
API. No ingestion cursor or remote summary was changed. A further page provided real fractured and
crafted examples, including seven displayed rows across five affixes and a Helical Ring with four
suffixes. Sanitized attribute excerpts are saved in
`packages/poe-item-query/test/fixtures/poe1-public-stash-2026-10-07.json`; two regression cases preserve
their observed counts/flags and unknown identity/tier behavior. All 20 item-query tests pass.

The shared source-text resolver now searches complete affix combinations against generated catalog
text, source affix counts and crafted/fractured flags. It sums combined displayed stats, prevents
same-group affixes, retains only identities common to every interpretation, and withholds results
when its 20,000-visit bound is exceeded. Catalog alternatives outside the curated price set remain
in the model. Its data and format participate in the cohort revision hash.

The captured Vaal Gauntlets resolve fractured T1 cold resistance; the Conqueror's Helmet resolves
fractured T1 intelligence and matches its cohort. A DuckDB replay uses those helmet attributes with
synthetic prices/sellers and verifies exclusion of a cheaper unknown listing and preservation of
earlier history. Generated-catalog tests also resolve isolated Grasping Mail critical-chance text.

Temple donors now have additional display-equivalent family cohorts generated from records that
differ only in required level. Exact-ID cohorts remain separate. Shared item facts can retain one
affix with several `possibleIds`; queries accepting all possibilities can match, while an exact-ID
query stays unknown. Query generation retains the alternatives and warns about the ambiguity.
DuckDB capture/rollup verifies that a description-only Temple donor prices its family but only adds
unknown evidence to the exact cohort. HTTP/MCP parity includes the new shared matching shape.

Source-text limitations: complex searches, unsupported states and ambiguous identities can remain
unknown. Family quotes cannot silently cover exact-ID prepared items or output
requirements. Acquisition binding now requires an explicit, saved representative-item assumption,
validates family equivalence against the selected crafting catalog and retains every other coverage
check. The browser labels the assumption; HTTP/MCP share the same bind operation. Live refresh and
historical snapshots retain it, while manual price edits remove it.
The earlier abbreviated Helical Ring projection stays unknown without complete scaling context.
Supported automatic fracture/donor pricing does not imply that every observed item has a unique
canonical interpretation.

A further authenticated page at 22:28 Sydney on 7 October 2026 supplied actual catalyst properties:
20% Life and Mana Modifiers on a Vermillion Ring, and 20% Prefix Modifiers plus a native 50% prefix
magnitude implicit on a Manifold Ring. Other jewellery omitted `properties` entirely. Sanitized
modifier-context projections retain field presence in
`packages/poe-item-query/test/fixtures/poe1-public-stash-quality-2026-10-07.json`. Ordinary jewellery
without reported quality uses unscaled ranges; malformed or unrecognized quality context remains
unknown. The inspection
used cached credentials and changed neither the ingestion cursor nor remote summaries.

The family/quality checkpoint passed 34 item-query tests, 23 market-package tests and 101 application
query, transport, ingestion and curated-market tests. Item-query, market, ingestor and application
TypeScript checks passed; repository Biome checked 814 files and `git diff --check` passed. The
manifest now has 49,897 cohorts, including 960 additional display-equivalent donor-family groups.
An earlier local warmed 100-iteration measurement of the captured helmet's resolver averaged
1.50 ms per item; this is one sample, not an ingestion throughput guarantee. No retained crafting
engine artifact was changed.

The representative-item binding checkpoint passed three production-build browser cases and a focused
MySQL integration case. Browser checks cover default refusal, explicit selection, saved-reference
reload and manual override, plus the existing adaptive/outage and obsolete-result flows. The MySQL
case verifies that lookup only applies the assumption to family cohorts and preserves it through
historical repricing. The generated Temple family is also exercised as a retained-engine graph
acquisition; family assumptions do not alter retained engine artifacts or the cohort manifest.

The subsequent repository gate passed Biome (814 files), all builds and typechecks, and all shared
package tests (including 34 item-query, 23 market and 203 game-data cases; three game-data cases
remain skipped). The application run passed 2,681 tests and failed ten stale assertions: nine still
expected the former one-hour credential cache, and one expected the old incomplete-modifier warning.
Those expectations were corrected to the requested 12-hour TTL and current ambiguity-aware wording;
all 40 tests in the two affected files then passed. No implementation changed to suppress these
failures, and the full ten-minute application run was not repeated. This includes the generated
Temple-family acquisition regression. Unrelated generated Wrangler metadata was restored.

The next checkpoint implements catalog-derived catalyst and fixed native magnitude interpretation.
The shared pure stat renderer is also used by the workbench; numeric scaling occurs before
translation and truncation/decimal formatting. Conditional rules are partitioned, categorical
lookups are enumerated within bounds, and only facts common to all feasible interpretations are
retained. Source implicit text must confirm a fixed native effect. Explicit modifier effects,
enchantments, unrecognized quality and exhausted searches remain unknown.

The real Vermillion Ring sample now resolves scaled regeneration and the crafted modifier. The
Manifold sample resolves its life-on-kill suffix without claiming an identity for the ambiguous
fracture. Synthetic full-context tests cover T1 fractures on Simplex, Focused, Helical and Manifold
bases. Helical/Manifold rings are now included in the curated base set; the manifest contains 50,423
cohorts at revision `198f5ee72d219113cf4d1b7efe2e893ab346c7967428227d10c379c7b15b22c2`.
Existing definitions/history and retained crafting executables remain separate and unchanged.

Scaling verification passed 40 item-query tests, 28 market tests and 128 focused application tests
covering rendering, quality, binding, curated acquisitions, ingestion and HTTP/MCP parity. The added
scaled-fracture rollup then passed with all 12 equipment tests. Application, item-query, market,
ingestor and game-data typechecks passed; Biome checked 817 files and `git diff --check` passed.
The production-build browser test preserved both recombination donors and their single charges.
The final rebuilt Compose image completed 8,400 offline observations and resumed its saved database
and cursor (`resumed: true`); replay containers were removed and the test volume retained.

The completion review found and fixed a live-price gap: refresh previously selected only the saved
cohort revision. It now selects the newest compatible observation after comparing the retained
cohort ID, purpose and exact parsed query. Historical snapshots also recover earlier compatible
revisions at their cutoff. Empty newest prices, truncated lookups and missing retained definitions
remain explicit issues rather than silently retaining an older usable quote. Old hourly rows,
crafting rules and acquisition pins remain unchanged. The 97 market/transport tests and focused
MySQL integration case pass, including historical process costs and immutable original history.
The production-build browser regression passes for revision persistence after reopening and explicit
manual override during an outage. Application TypeScript also passes.

### Acceptance audit

This audit incorporates the connected-plan, real-source modifier, scaling and compatible-price
revision checks. Live source samples establish only the supported interpretations described above;
synthetic replay verifies accounting and persistence, not complete upstream historical availability.

| Requirement | Implementation and behavioral evidence | Assessment |
| --- | --- | --- |
| Distinct item inputs, recovery loops and per-process accounting | `crafting-graph-trial.ts` consumes unique item tokens, recovers to named ports and charges upstream acquisitions; graph trial/simulation tests and axe, armour, fracture and Grasping Mail examples exercise these paths. | Implemented; model probabilities remain explicit assumptions. |
| Queries, relevant outcome branches and user ordering | Shared `poe-item-query`; `crafting-query-routing.ts` orders complete queries, with pilot match probabilities supplied by the simulation. Policy tests cover overlap, specificity, manual order and unknown matches. | Implemented. |
| Item handoff and preparation | Workbench item/method transfer, connected recombinator conversion, graph samples and prepared-purchase editing share operations and preserve full item state. | Implemented; idealized standalone essence donors require explicit real preparation steps. |
| Acquisition comparisons and NNN sources | `crafting-acquisition.ts`, graph simulation, NNN catalog queries and node controls compare known costs/actions and retain pinned choices. Armour and fracture tests compare buying with preparation. | Implemented. |
| Both games and browser calculation | Per-game catalogs/rules, retained graph workers and both-game browser cases. `poe2-ingest.test.ts` explicitly forbids stash calls while retaining exchange ingestion. | Implemented; PoE 2 equipment prices are manual by design. |
| Shared API item attributes, paste and trade searches | API-shaped records preserve unknown fields; item-text interpretation and per-game trade translation use shared operations with fidelity warnings. Live PoE 1 trade and public-stash responses were inspected and sanitized fixtures retained. | Implemented for supported translations; missing fields and ambiguous modifier identities remain explicit. |
| Curated base, fracture and isolated-modifier markets | 50,423 generated overlapping cohorts, bounded source-text matching, real fracture/crafted/quality examples, source-shaped DuckDB replay and MySQL process-cost tests. Display-equivalent donor families require an explicit representative assumption. | Implemented for supported modifier interpretations; unsupported scaling, ambiguous exact identities and exhausted searches cannot contribute automatic prices. |
| Live and historical prices, confidence and longer windows | Shared equipment/exchange binding and refresh; independent historical snapshots; deduplicated 1/6/24-hour policies; market/MySQL/browser regressions. | Implemented with documented uncalibrated confidence and window policies. |
| Rare misses and explicit sale recovery | Graph sale prices are explicit; discard counts are labelled excluded recovery. Grasping Mail and fracture regressions verify no invented proceeds. | Implemented; arbitrary rare appraisal remains deferred. |
| Era retention, corrections and generated publication | Content-addressed retained catalogs and standalone engines r1–r5, immutable publication checks, runtime hash validation and explicit revision adoption. | Implemented; source extraction archives remain separately retained development inputs. |
| New tabs, local storage and portable serialization | Shared workspace operations and guarded local storage; tests cover import/export, new tabs, reload, quota failures and intervening edits. | Implemented. |
| Builds, references/value copies, private sync and sharing | Shared workspace/sync logic, transaction-locked cloud queries, account storage preference, frozen/live shares and revocation. MySQL tests inspect privacy, concurrent writes and both transports. | Implemented; no production deployment or migration was requested. |
| UI, HTTP and MCP parity | Operation registry and shared schemas/core functions; `surfaces.md`, transport success/refusal tests and ownership integration tests. | Implemented. |
| Docker Compose and source-timed development replay | Persistent single-writer DuckDB volume, mounted host-resolved credentials, graceful shutdown and health reporting. Offline Compose replay verifies 8,400 observations and restart; MySQL replay verifies early/middle-league process costs and preserved charts. | Implemented and fixture-verified. Authenticated read-only source inspection passed; continuous production ingestion and deployment were not performed. |

The source-evidence dependency is resolved for the supported initial market groups. Public-stash
payloads lack complete canonical name/tier/level metadata, so generated text inference retains only
facts common to all interpretations. Exact fracture examples, isolated-modifier fixtures, donor
families and supported catalyst/native scaling have separate regressions. Unknowns remain excluded;
broader automatic appraisal and exhaustive translation remain deferred as agreed.

### Earlier acceptance checkpoints

Final local acceptance runs passed all 71 browser cases against the production build and all 17
cloud/ingestion MySQL integration cases. These supplement the full repository gate and rebuilt
Compose replay reported below. Browser cloud responses are fixtures; the MySQL integration separately
verifies transactions, ownership, sharing and HTTP/MCP behavior. No live inspection process remains
running. The same credential authorization dependency persisted across the equipment, connected-plan,
API-compatibility and acceptance-audit turns. Further source-dependent implementation requires that
authorization; the goal is not complete.

At 21:25 Sydney time on 7 October 2026, the authorized read-only inspection succeeded. Its first
available page contained 159 public stashes, 4,334 items and 13,955 explicit modifier rows, all objects;
none had complete name/tier/level metadata. It started at the oldest available cursor, so this is
sample evidence rather than a claim about current-league coverage. The command did not open the
ingestion database, advance its cursor or deliver summaries. This supersedes the credential blocker
recorded above, but does not establish automatic fracture/donor prices.

The app, ingestor and tracker now request encrypted disk caching for local/development 1Password
values with a 12-hour TTL. All six resolved ingestor entries were verified to store exactly that
duration. A fresh process loaded the configuration successfully while 1Password CLI invocations
were explicitly blocked, demonstrating cache reuse without another authorization. Direct CLI
session checks are not a proxy for Varlock cache availability.

- [x] Docker Compose local worker configuration, persistent per-project DuckDB volumes, host-resolved
  mounted credentials, unprivileged container, graceful stop, and cycle health reporting.
- [x] Offline Compose replay through the real HTTP client, DuckDB and fixture summary receiver:
  8,400 item observations, 3,000 retained unique listings, 600 unique removals, price updates, and
  cursor persistence across database reopen and container restart. The equipment portion covers
  3,000 observations at early league and day 21, with overlapping base/link cohorts and preserved
  prices. The separate MySQL integration verifies their use in process costs below.
- [x] Shared API-shaped item/query package with explicit unknown matches, same-mod identity/tier/flag
  conditions, affix-slot pseudos, ranges and trade-style logical groups. Trade metadata is kept
  distinct from canonical game modifier identity. Unknown source fields survive serialization.
- [x] Adapters to each existing crafting engine's modifier identities, affix limits, stat totals and
  partially known socket links; full crafting state remains the engine's responsibility.
- [x] Tested branch ordering and acquisition-selection policies, including manual ordering, unknown
  branch matches, incomplete prices and pinned acquisition choices.
- [x] Multi-input graph schema, item consumption, recovery pools, cyclic production, full-process
  probabilities/costs and existing crafting/recombination integration.
  The schema and sampled calculation core now consume distinct item instances, reuse recoveries at
  named input ports, compare acquisition alternatives, and retain complete engine item state between
  operations. Production dependencies are acyclic; recovery branches provide retry cycles. Tests cover
  two inputs from one source, left/right recovery, explicit sales, missing prices, work limits,
  incompatible inputs, catalog pins, and buy-versus-craft behavior in both games. Recombination's
  recovery cost agrees with an independent analytic calculation. Revision r3 connects natural essence
  NNN modifiers and essence-exclusive modifiers to the existing recombinator model; retained r2 still
  refuses them. Fixed-probability tests cover suppression transfers on Zodiac Leather, Triumphant
  Lamellar and Necrotic Armour, with full item-state validation and graph cost accounting. Broader
  exclusive/drop-only transfers are covered by retained r4. Connected standalone recombinator plans
  now transfer to graph projects; idealized essence preparations require explicitly authored real
  steps and outcome queries, as described in the conversion boundary below.
  Revision r5 adds conditional preparation using the shared first-input query. Non-matching items
  route unchanged without craft costs or second-input acquisition; unknown conditions stop calculation.
  Both-game tests cover suffix filling, already-ready inputs, preserved rolls and recovery limits.
- [x] Graph worker and UI, new-project tabs, shared item handoff, acquisition comparisons and NNN sources.
  Both games now have project tabs, a graph canvas, named consumption/recovery inputs, query and
  branch editors, manual prices, acquisition alternatives, sampled estimates, and workbench item
  handoff. Calculations and catalog parsing/validation run in workers. Edits invalidate earlier
  estimates. Workbench and acquired-item controls now list extracted NNN essence sources, sort known
  prices first and select a recipe. Full method settings now reuse workbench controls with an explicit
  reference purchase, preserved connections and protected recovery destinations. Connected recombinator
  plans now transfer their concrete inputs, steps, bench preparation, removal and targets; idealized
  essence preparation remains an explicit conversion boundary. Purchased inputs have a full-workbench editing session for arbitrary prepared states,
  with explicit apply/cancel and separate standalone automatic drafts. Applying checks the selected
  retained engine, refuses stale item edits and clears changed-item prices while keeping routes and
  pinned choices. All 34 project/history/cloud browser cases and 172 existing crafting component
  cases passed after this integration.
- [x] Trade query translation and pasted-item query creation, including explicit fidelity limitations.
  Graph output requirements now generate official trade URLs for both games, with shared browser
  worker/HTTP/MCP translation, per-game official filter metadata, retained catalog resolution,
  persisted league selection and explicit approximate/omitted-condition warnings. Hybrid modifier
  searches use displayed stats and do not claim exact tier or affix identity. PoE 2 equipment prices
  remain manually entered. Every graph query editor now previews copied game/PoB items, retains
  ambiguous interpretations for explicit selection, and creates requirements from selected known
  properties through shared browser-worker/HTTP/MCP operations. Missing modifier identities and
  socket/slot knowledge produce warnings rather than invented constraints. Comprehensive exact
  stat/mod translation remains deferred, as agreed. See [trade translation boundaries](../apps/poe.boats/docs/crafting-trade.md).
- [x] Curated overlapping equipment cohorts, historical price/confidence integration, currency coverage
  for both games and manual PoE 2 equipment pricing.
  The generated PoE 1 base manifest now contains 19,878 cohorts for 176 base names. Item-level
  bands follow modifier-pool changes, and six-link cohorts overlap general base cohorts. Separate
  DuckDB capture and permanent MySQL summaries retain seller counts, unknown membership, native
  currency asking prices and an explicitly labelled confidence heuristic. Observed cohort definitions
  retain their revision and catalog hash. Delivery retries, same-hour membership corrections,
  previous-hour preservation and safe pruning have behavioral coverage. MySQL HTTP integration
  replays 2,000 equipment observations across early/middle league and preserves existing charts.
  Purchases can now bind a compatible cohort median, retain league/realm/revision provenance, refresh
  on open/focus/edit and every minute, and display hourly history. Missing or incompatible refreshes
  block calculation until resolved or manually overridden. Core, HTTP and MCP use the same coverage
  checks; API/MCP calculation uses supplied prices and offers explicit refresh separately. Seeded
  MySQL replay verifies a base plus preparation at 22 chaos early league and 7 chaos later. Browser
  tests cover saved bindings, reopening, outages, manual overrides and obsolete lookup cancellation.
  Both games now bind currency and essence costs from direct exchange pairs, with hourly history,
  realm/league isolation, observation timestamps, explicit manual overrides and automatic refresh.
  Estimates use traded-volume ratios with uncalibrated confidence; zero-volume and missing pairs
  remain unknown. Eligible NNN essences can load these prices and sort the known alternatives first.
  The expanded manifest now adds 27,603 T1/T2 fracture groups, 1,092 donor affix-count groups and
  364 broad donor groups. Canonical identity requires complete unambiguous API metadata/text;
  missing or ambiguous evidence contributes no price. The three Incursion glove suffixes and the
  Grasping Mail crit suffix are covered on source and transfer bases. Whole-process cost history now
  uses independent historical price snapshots and the retained worker calculation, with gaps for
  unavailable prices and fixed manual assumptions. It exposes observation times and item confidence;
  live authenticated stash-metadata verification remains unfinished. Both-game exchange and PoE 1
  equipment now offer explicit adaptive 1/6/24-hour estimates while preserving hourly history; see
  the final verification checkpoint below for policy and coverage limits.
  See [cohort policy and storage](../packages/poe-market/README.md).
- [x] Immutable historical ruleset/catalog manifests, publication, revision selection and corrections.
  Retained catalog/engine artifacts, a revision index, publication/materialization scripts, exact
  browser-worker/server resolution, availability checks, and explicit correction-adoption operations
  are implemented. Both games retain r1, r2, r3, r4 and r5 publication builds. Behavioral tests
  execute each retained implementation, verify deduplication and immutable publication, and refuse
  corrupt data, altered pins and methods disabled in a newer revision. Eight browser tests verify all
  retained game/revision combinations against the real HTTP operation, cancellation without blocking
  the page, and corrupt-data refusal. The project editor exposes retained revision selection and
  explicit correction adoption; opening a project does not change its pin.
  See [publication instructions](../apps/poe.boats/crafting-history/README.md).
- [x] Local project/build persistence, cloud storage preference and sync, frozen/live shares, and
  build members saved by reference or value.
  Shared workspace operations now create/select/close project tabs, preserve drafts after closing,
  update versioned projects, manage build references and copies, export/import portable bundles with
  remapped IDs, and freeze all build members by value. Referenced deletion and stale updates are
  refused without changing caller state. A local-storage adapter and React subscription preserve
  unsaved work on quota errors or detected intervening writes, and do not overwrite unreadable data.
  Twelve domain/storage tests and HTTP/MCP success/refusal cases cover these behaviors, including
  independent edits to embedded build copies. Visible local project/build controls, independent-copy
  editing and portable export/import are implemented. Account persistence now has shared HTTP/MCP
  operations, a generated workspace/share migration, transaction-locked revision checks and a storage
  preference. Frozen item/build shares and live references resolve only the selected process;
  revocation checks account ownership. Shared sync planning distinguishes uploads, downloads,
  conflicts and connecting existing drafts to another account. Guarded local replacement preserves
  intervening edits, storage conflicts and quota-failed drafts. Browser controls now offer storage
  choice, private autosync, explicit conflict preservation, publication and revocation. Public share
  previews calculate with retained rules, refresh market prices and save independent local copies.
  Account changes require connecting existing drafts; choosing local storage disables uploads.
- [x] UI/HTTP/MCP operations and transport/ownership parity for the new capabilities.
  Graph calculation and item-query matching are registered with shared input/output schemas and
  HTTP/MCP parity tests. The graph worker uses the same retained calculation implementation.
  Item handoff, graph connection/removal, local workspace edits, ruleset listing and correction
  adoption have HTTP/MCP parity as well. Account persistence, equipment and exchange pricing use
  shared operations with ownership and transport coverage. Workbench calculation, emulation, fossil
  optimization, item editing and connected recombinator conversion also use shared contracts.
- [x] Source-timed season replay through cohorts and process costs, full repository checks and browser E2E.
  Seeded Compose/MySQL replay and browser evidence are recorded below. The full repository gate
  passed after connected recombinator conversion: builds, typechecks, shared-package tests and all
  2,677 app tests. Live authenticated source inspection remains a separate evidence gap.

Verified so far: ingestion package typecheck; app typecheck; shared-query tests; crafting adapters for
both games; worker lifecycle and existing market pipeline tests; real Compose build, offline startup
and restart; 56 focused graph/history/transport tests; all 17 browser tests; app build and repository
Biome check. The local project editor additionally passes seven browser workflows and 46 focused
graph-authoring/HTTP/MCP tests; its latest build, app typecheck and repository Biome check pass.
The NNN integration additionally passes all 27 browser tests, the focused graph/history/transport
suite and existing PoE 1/PoE 2 crafting regressions. Retained r2 still refuses the NNN input that r3
calculates successfully; the prior artifacts have not been overwritten.
Trade search translation additionally passes nine focused cases and the HTTP/MCP suite (58 tests
combined), all 28 browser tests, the app build, app typecheck and repository Biome check. Browser
coverage verifies both game URL formats, worker execution, persisted league text, stale-link
invalidation, approximate-modifier warnings and equality with the real HTTP operation.
Pasted-item requirements additionally pass 70 focused adapter/import/transport tests, the shared
query package's 14 tests and typecheck, app typecheck/build, and all 29 browser tests. Browser
coverage requires explicit ambiguous-match selection, exercises generated crafted-modifier edits,
and verifies that invalid text preserves existing requirements. Missing pasted socket information
and unidentified affix counts remain unknown. No execution ledger or progress tracking was added.
Live authenticated stash payload verification remains open. No existing market data
or remote charts were deleted.

Equipment capture additionally passes 99 focused ingestion/storage/transport tests, six shared market
tests, seven MySQL HTTP integration tests, app and package typechecks, app build and repository
Biome. The updated offline Compose image builds and passes both initial and resumed 8,400-observation
replays. Local replay containers have been removed; their isolated verification volumes are retained.
PoE 2 processing skips the unavailable public-stash stream while retaining exchange ingestion and
delivery; a separate behavioral test verifies that no equipment request is made.

Equipment purchase binding additionally passes 76 focused price/transport/catalog/fullscreen tests,
seven MySQL ingestion/history/process-cost tests, and all 20 project/history browser tests on an
isolated local port. Coverage refuses unpriced preparation state, missing modifier guarantees and
ordinary-base prices for configured socket/link requirements. Latest app build/typecheck and
repository Biome/diff checks pass. The repository-wide run passed builds, generated types and package
tests; its app suite recorded 2,548 passes and 16 failures in two component files whose catalog-worker
fixtures were outdated. Both files now pass in the focused rerun using the same catalog validator as
the real worker. A final clean repository-wide run remains part of release verification.

Browser validation supports `PLAYWRIGHT_PORT` to prevent a concurrently starting checkout from
satisfying readiness on the default port with a different build. The final project/history run used
46733 and passed all 20 cases; the earlier shared-port run is not treated as valid feature evidence.

Exchange pricing additionally passes 59 focused exchange/transport/ingestion tests, nine shared
market tests, two API-client tests, eight MySQL ingestion/history/process-cost tests, and all 22
project/history browser cases. Seeded exchange replay prices the same craft at 12 chaos and 10.5
chaos at different captured hours, isolates PoE 2 prices, and refuses a later zero-volume observation.
The API client now uses GGG's public exchange CDN without resolving or attaching OAuth credentials;
authenticated stash access remains separate. App and affected-package typechecks and repository
Biome checks pass. The latest browser run builds the app before testing.

The rebuilt Compose image also passes the resumed 8,400-observation replay. Verification exposed
and fixed a replay-fixture error after the wall-clock hour changed: currency verification now uses
the persisted hour actually ingested. A dedicated regression seeds a previous-day cursor and checks
the complete replay. No production data or retained verification volumes were deleted.

Cloud persistence has real MySQL coverage for concurrent saves, account isolation, invalid build
references, frozen and live build behavior, link revocation, and successful/refused HTTP and MCP
calls. Shared sync and local-storage tests cover safe pull/push planning, account changes, retained
tab choices, keeping both copies, intervening edits and quota failures. These establish the server
and sync foundation.
Verification: five isolated MySQL cases (including both-game persistence and retained PoE 2 r2
sharing), nine sync/storage cases, 55 surface-parity cases, app typecheck and production build pass.
The migration was generated locally and exercised in test containers; it has not been applied to
production.

Browser cloud storage and sharing additionally pass all 27 project/history/cloud browser cases and
81 focused sync/storage/component/transport tests. Both games publish, open, calculate, copy and revoke
frozen shares. Tests verify live build references versus value copies, market refresh without altering
frozen snapshots, offline edits, conflict copies, account changes and local-only preference. Browser
cloud/auth responses are fixtures; the separate MySQL cases exercise real persistence and authorization.

A subsequent clean `vp run ready` passed repository lint, builds, types, package tests and all
2,572 application tests. This was before the following curated-market/r4 additions; those additions
have separate verification and still require final repository-wide validation.

Curated-market classification now has deterministic canonical-modifier resolution from source
metadata and complete roll text. It preserves ambiguous membership and checks affix isolation
without conflating multi-line modifiers. Tests cover T1/T2 fractures, isolated Temple donors,
Grasping Mail transfer bases, unknown-price exclusion, and early/middle league DuckDB observations.
Prepared Temple glove inputs exposed an engine eligibility gap, fixed in a new retained r4;
existing r3 remains unchanged. Eighty-two focused engine/history/pricing/transport tests pass.
The rebuilt Compose image successfully resumes the retained 8,400-observation replay volume,
including separate unknown donor summaries and the prior base-cohort revision. No history was deleted.

The expanded curated manifest additionally passes nine MySQL HTTP ingestion tests. Fractured physical
damage, isolated Temple cold damage and Grasping Mail crit donors retain early/middle league prices;
ambiguous source records contribute unknown counts without affecting medians. Graph purchases use
the stored 100-chaos and 40-chaos quotes, with no mutation of the unpriced source draft.

Whole-process historical valuation uses the same refresh implementation with an explicit observation
cutoff. A bounded snapshot operation sorts and deduplicates UTC hours, preserves ruleset pins and
manual assumptions, and refuses cached prices without supported historical bindings. A missing
bound price returns a gap instead of carrying a current quote backwards. The browser calculates
snapshots in retained-engine workers, supports cancellation, and invalidates results after edits.
Real MySQL replay verifies a gap before observations and whole-process costs of 22 and 7 chaos at
the two captured hours, while the live graph stays priced at 7 chaos.

All 32 project/history/cloud browser cases passed; the final sampling-interval display additionally
passed both games' history cases and was visually inspected. App typecheck and repository Biome
passed. A repository-wide `vp run ready` completed lint/builds/types but stopped on two five-second
timeouts in the existing game-data extraction suite. All 132 cases in that file passed in isolation
with unchanged limits. A subsequent `vp run -r --concurrency-limit 1 test` passed the package
suites (including all 203 game-data tests, with three existing skips). The application suite recorded
2,586 passes and two failures after new authoring tests were edited while the run still held the
older module in its cache. A clean focused run passed all 65 authoring/transport cases. That mixed
revision run is not a clean full-suite result; final repository-wide validation remains required.

Prepared-item editing also exposed an actual production startup failure: shared Zod schemas could
be constructed before the OpenAPI extension loaded. Crafting contracts now use native schema metadata;
the import-order regression and all 34 browser cases pass with the production build.

The official ItemMod API reference was rechecked on 7 October 2026: it documents descriptions and
flags, not the name/tier/level metadata used by the current identity resolver. The enriched seeded
fixtures prove the classification and storage path, not live public-stash coverage. Items without
that metadata remain unknown; authorized live-payload verification remains required.

The current workbench now exposes catalog, calculation, process emulation and individual item actions
through shared HTTP/MCP operations. The browser worker and HTTP calculations use the same exact-or-
sampled runner. Browser item actions and the API share Allflame previews/selections, reveal choices,
currency costs and paid bench failures. These operations validate the current client build; they do
not substitute the current engine for historical graph revisions. Server calculations refuse manual-
stop runs and requests exceeding 5,000 trials or 100,000 potential steps. Fossil optimization and
supplementary workbench editing helpers still need programmatic registrations.

Verification: 72 core/transport/contract cases, eight focused bench/reveal component cases, app
typecheck and repository Biome passed. All six new browser cases compare real worker/item/process
results with real HTTP responses for both games. The combined browser run passed 39 of 40 cases;
the remaining cloud case could not hydrate because Chromium reported `net::ERR_NO_BUFFER_SPACE`
for the i18n JavaScript request. It passed separately on the unchanged successful build. Rebuilding
for that recheck hit Windows `EPERM` replacing the generated PoE 1 catalog; the source and temporary
catalog hashes were identical. A temporary ignored configuration reused the verified build for the
recheck and was then removed. A subsequent clean sequential repository test run passed all package
suites and all 2,603 application tests across 191 files. This is the checkpoint before the following
selected-craft handoff was registered.

The workbench can now send its selected craft into a new local graph tab. Full input and donor state,
method settings and entered prices are preserved; consumed donors become distinct acquisitions and
are charged once. Missing prices remain unknown, missing donors are refused, and the selected retained
engine validates the graph. The shared HTTP/MCP operation returns the same unsaved graph. This imports
one selected craft, not workbench target conditions or a multi-step process; outcome queries and
recovery routes remain explicit graph edits. The separate abstract recombinator handoff remains open.

Verification: 73 core/transport/contract cases, app typecheck, repository Biome and all ten workbench browser cases passed.
The browser cases rebuilt current application sources against the unchanged verified catalogs. The
standard export step still encounters Windows `EPERM` replacing the PoE 1 catalog, despite matching
source/temporary hashes, normal file permissions and a successful exclusive-read check. No generator
behavior was changed to conceal that failure. The temporary browser configuration was removed after
verification; the standard full build still requires rechecking once the replacement issue is resolved.

Conditional preparation is now published as r5 for both games. An optional first-input item query
controls whether to apply a craft. Non-matching items retain their identity and rolls and follow
the configured result routes without craft spending or second-input acquisition. Unknown conditions
stop the estimate; output requirements and recovery-loop limits still apply. Skipped visits and
trace entries are reported. The editor exposes the shared query controls only for a supporting
revision; existing r1–r4 artifacts remain intact, and adopting r5 is explicit.

Verification: 125 focused graph/history/market/transport cases passed, followed by 79 condition and
transport cases including both games' suffix-filling examples. All 43 project/history/workbench
browser cases passed through the standard production build, including all ten retained game/revision
combinations. The earlier catalog replacement error did not recur in this build; its underlying
Windows cause was not established. Repository lint passed. Repository-wide verification of r5 is ongoing.
The subsequent recursive build again hit the same catalog replacement `EPERM`, both inside and
outside the sandbox. The successful standard browser build remains valid evidence, but the separate
recursive build gate has not passed. The sequential repository test run has passed every package
suite and is currently running the full application suite without concurrent source edits.

That sequential repository test run finished successfully: all package suites and 2,625 application
tests across 193 files passed. This establishes the r5 checkpoint before the standalone recombinator
input handoff below.

Standalone recombinator starting inputs now have an explicit conversion to a full crafting item.
The user chooses a concrete base for a generic category, rarity and minimum/maximum roll assumptions,
reviews the item preview, then saves a new local project. Canonical modifier identity and item level
are preserved; the assumption remains in the input label, and purchase price stays unknown. The full
prepared-item workbench remains available in the resulting project. Custom modifier text and manual
probability overrides cannot silently become physical item attributes. Shared HTTP/MCP calls return
the same preview without saving. Full-plan/preparation and outcome handoff remain unfinished.

The catalog exporter now validates and compares generated bytes before replacing output. Identical
catalogs keep their existing file; changed catalogs still use the existing temporary-file rename,
and read/write failures remain errors. The new regression failed on unnecessary replacement before
the change and now verifies unchanged modification times, actual changed-output replacement, and
failure propagation. This avoids the observed unchanged-file replacement failure without claiming
to resolve all possible Windows file locks.

After this change, the recursive repository build and all 14 recursive typecheck tasks passed.
The standalone input handoff and catalog exporter passed 80 focused cases; all 11 existing
recombinator browser cases passed. A new handoff fixture incorrectly requested a DEX/INT armour
from the pure-INT category; after changing it to Vaal Regalia, both new handoff browser cases passed.
The stale temporary catalog was removed after verifying its SHA-256 matched the generated output.

Graph steps now expose full workbench method settings in a separate editor. A reference purchase
controls which options are shown; it never replaces the graph's actual inputs. Applying preserves
input connections, conditions, prices and routes, refuses inline inventory snapshots and stale edits,
and prevents removing ports targeted by recovery branches. Adding a second port consumes a separate
item from the first port's source until the user changes that connection. The quick selector uses
the same core operation. HTTP/MCP validate the resulting graph against its retained engine. No
retained calculation artifacts changed. Focused authoring and transport verification passed 86 cases;
the method, handoff, contract and existing pinned-method suites passed another 27 cases. All 37
project, workbench and standalone input-handoff browser cases passed through the production build,
including the four new method-editor workflows. Initial native-select locators included option text;
the corrected tests use the controls' accessible roles and names. Application typechecking, repository
Biome and diff checks also passed. The 2,625-test full-suite checkpoint predates these authoring edits;
the focused and browser results above cover the new changes.

Calculated graph trials now preview their full output items and can open an independent local
project pinned to the same historical revision. The acquisition price stays unknown; one sampled
trial's spending is not treated as the expected cost of producing that item. Source edits hide stale
outputs, changing samples cancels pending copies, and destroyed items cannot become purchases.
States that cannot be represented by game text retain an inspectable JSON representation. Same-page
workspace notifications open the newly created tab immediately without overwriting the source draft.
Twelve focused sample, subscription, storage and sync cases passed, as did all 44 project, cloud,
workbench and recombinator-handoff browser cases through the production build. Application
typechecking and diff checks passed. This remains separate from the earlier full-suite checkpoint.

The named PoE 1 examples now have ten graph integration cases in
`test/crafting-example-{axe,armour,fracture,grasping}.test.ts`. Together with existing graph,
conditional-step, sample-preview and workspace-subscription coverage, all 35 focused cases pass.
These exercise actual retained-model operations, full item state, shared queries and consumed costs:

- The physical axe example rolls separate T1 percent/hybrid donors, recovers a partial recombination,
  fills suffixes with a crafted prefix in place, removes it, slams influence, prepares a two-prefix
  NNN/flat-physical recipient, and handles both successful and wrong-base final recombinations.
  Screaming Essence of Torment is an eligible NNN prefix source in this catalog; Screaming Woe's
  modifier is essence-exclusive and must not be substituted as a natural modifier.
- Necrotic Armour compares buying six links, the 1,500-fusing bench recipe, and the extracted linking
  beast recipe. Price changes update automatic selection while pinned choices remain fixed.
  Alteration misses retain the base and its links; a successful transmutation skips alterations.
  Its eligible T1 flat defence modifier is hybrid evasion/energy shield, not the pure-ES modifier.
- Fracturing includes rolling, regal/exalt preparation, replacement after a wrong fracture, Allflame
  selection with one recipe charge, and purchasing the desired fracture as an acquisition alternative.
- Grasping Mail includes generation, Kishara isolation and NNN transfer. Split selection yields one
  continued item, while recombination consumes two distinct items. Unvalued misses get no revenue.
  The ring set is currently an explicit `generated:rare` recipe-total price; the zero-priced output
  configuration is not a free source of generated items. Omitting the recipe price leaves total cost
  unknown. This does not establish automatic pricing of the sixty individual ring requirements.

Example prices are manual test assumptions. Some cases select specific positive-weight outcomes to
exercise recovery and failure paths deterministically; they verify accounting and eligibility, not
new probability estimates or the accuracy of the retained model's researched assumptions. Ordinary
fusing/Omen alternatives are not assigned invented odds when the catalog does not support them.
No historical executable artifacts were changed by these tests. Application typechecking passes.

Workbench fossil optimization, starting-item editing and text export now have shared HTTP/MCP
operations. The optimizer preserves seeded partitions, Allflame options and unknown prices; server
requests are bounded to 5,000 trials per combination and 100,000 trials in the requested partition.
Starting-item edits are hypothetical inputs and do not charge currency or record execution. Both
games use the same editor helpers through the UI and transports, including full-item validation,
modifier sources, flags and allocated passives. Text export retains its existing unsupported-state
refusals. Retained graph revisions are unchanged.

All 40 project/workbench browser cases passed through the production build, including actual
partitioned optimizer workers, selected-recipe handoff, both-game flag/level edits and text export.
The focused transport, optimizer, contract and item-text run passed 125 cases across five files;
application typechecking passed. A schema-publication timeout exposed repeated expansion of the
new item-edit union. Its workbench-specific named item contract now produces OpenAPI references,
verified by a regression, and the publication test passes with its original timeout. This checkpoint
precedes the next repository-wide verification run.

The subsequent repository-wide run passed lint, recursive builds, typechecks and all package suites.
Application results were 2,656 passed and five failed across 202 files. All five failures were existing
recombinator component tests missing router context after the new input-handoff control added
navigation. Wrapping their renderer in `MemoryRouter` fixes the setup; all 12 tests in that file then
passed. Production code was unchanged by this repair. The full ten-minute suite was not repeated
after this test-only fix. Generated Wrangler environment metadata was restored to avoid unrelated
checkout changes. The goal remains active; live stash metadata coverage and the remaining economy
scope have not been declared complete.

Both games now offer adaptive currency/essence exchange estimates alongside latest-hour estimates.
The explicit `adaptive-v1` policy considers complete 1/6/24-hour windows, widening below 100 traded
input units while hourly volume-ratio prices vary by at most 10%. It sums traded volumes, deduplicates
inverse-pair observations, rejects conflicting copies and retains unknown latest zero-volume hours.
Missing hours stop widening. The thresholds are estimation assumptions, not calibrated confidence.
Bindings retain their policy through reopening, refresh and historical process calculations; old
bindings stay hourly. Lookup previews display actual windows and saved-price labels identify the
adaptive policy. Hourly source/history data and retained crafting executables are unchanged.

Verification: seven shared exchange/window tests, 83 application exchange/transport tests, and all
11 MySQL ingestion cases passed. The expanded two-case MySQL regression also verifies historical
process prices and zero-volume gaps. Both-game browser workflows passed through the production build,
then passed again after adding the saved-price label. Application and market-package typechecks
passed; application typechecking passed again after the final label/test addition. All 16 market
package cases, repository Biome (801 files) and diff checks passed. Wider equipment aggregation and
live public-stash modifier coverage remain unfinished.

The public-stash investigation now has a bounded read-only `ps inspect` command. It uses existing
credential references, reads one to five pages, and reports metadata-field counts and sanitized
examples without opening the ingestion database, changing its cursor or pushing summaries. Tests
cover private-field removal, incomplete metadata, empty pages, pagination limits and unsupported
PoE 2 inspection. A current host check located the installed 1Password CLI outside the filesystem
sandbox; the earlier inability to locate it did not prove it was absent. The CLI reported no signed-in
account, and the configured Varlock app-auth flow subsequently ended with an authorization timeout.
No live payload was obtained. The user has been asked to unlock/allow the existing credential request;
do not retry repeatedly or treat seeded metadata as live-feed evidence.

Inspection of equipment storage confirms that local hourly observations retain item/account identity,
membership and asking prices for calculating wider windows before pruning. The next equipment step
is to retain deduplicated 6/24-hour summaries alongside unchanged hourly prices, with explicit coverage
and policy metadata; averaging hourly medians would not meet the requirement. This is a remaining
implementation step, not a completed feature.

The inspection helper's three behavioral tests and the ingestor/application typechecks passed.
Repository Biome passed across 803 files. The live command terminated after credential resolution
failed; it is not a running background inspection and must be started again after authorization.

Equipment aggregation now retains optional trailing 6/24-hour summaries inside the existing price
JSON. Each summary deduplicates by revision, league, account and item before checking the latest
membership and computing the exact median. Every source hour must contain equipment observations
for that league/revision; gaps or pruned history prevent widening. This is observed-data coverage,
not a claim of complete market coverage or currently available inventory. Hourly values remain
separate, and a latest hour without a price stays unknown. Historical corrections dirty affected
later windows; pruning protects observations needed by unacknowledged summaries.

The optional equipment `adaptive-v1` policy widens below ten priced sellers while hourly medians
vary by at most 10%. These are fixed, uncalibrated assumptions. Browser, HTTP and MCP share the same
selector and binding; the policy survives reopening, refresh and historical process calculations.
The picker shows the selected window, sample/seller counts and unknown matches. Existing references
and charts remain hourly. No schema migration, production raw archive or retained-engine changes
were required.

Verification at this checkpoint: all 19 shared market cases, 97 focused application/transport/storage
cases and 12 MySQL ingestion cases passed. Application and ingestor typechecks passed. Both equipment
browser cases passed through the production build after correcting a test selector to use the
dropdown's verified accessible name. The updated Compose image passed initial and resumed offline
8,400-observation replays. No live stash payload has been obtained; the authorization question remains
pending. The overall goal remains active, including the remaining whole-plan handoff and final
repository-wide verification.

The final equipment checkpoint also passed the four replay/watch/PoE 2 ingestion regressions,
market-package typechecking, repository Biome across 805 files and `git diff --check`. The verification
container was removed after its successful restart; its replay volume remains. No generated Wrangler
configuration changes were introduced.

Connected recombinator plans now have a preview-and-save path into new graph tabs, backed by shared
HTTP/MCP authoring. Concrete bases, rarity and roll assumptions remain explicit for every input.
The converter retains input multiplicity, all recombinations and bench preparation, conditional
removal of surviving crafted modifiers, the selected final step and exact/non-exact modifier/base
targets. Purchase and crafting prices remain unknown. A four-input/three-craft regression verifies
40 chaos of purchases plus six chaos of services exactly once. Full item calculations use the
retained engine and need not match the standalone modifier-only model.

The standalone essence preparation is an ideal donor assertion, sometimes retaining chosen natural
mods or omitting all other rolls. It is not an actual essence operation. Conversion explicitly refuses
that assumption, custom text and manual probability flags instead of silently substituting a random
reroll or assigning invented preparation costs. Such preparation can already be authored as real
essence steps and outcome/recovery queries in the graph; automatic conversion of that idealized
preparation remains unresolved. Existing workbench item and selected-method handoffs remain available.

This checkpoint passed 105 focused conversion, recombinator component and HTTP/MCP tests, application
typechecking and all three recombinator handoff browser cases through the production build. Browser
checks cover concrete-base requirements, changed-preview invalidation, preserved connections/targets,
new-tab persistence and reload. No retained engine artifacts were changed.

The repository-wide `vp run ready` gate subsequently passed: Biome across 808 files, all builds and
typechecks, all shared-package tests, and 2,677 application tests across 204 files. The game-data
package reported 203 passed and three skipped cases. Unrelated generated Wrangler metadata was
restored after the check.

The [current official item schema](https://www.pathofexile.com/developer/docs/reference#type-Item)
marks numeric `frameType` optional and deprecated. The API client now accepts both historical numeric
frames and current `frameTypeId` payloads. Unique capture, names, modifier signatures and icon-to-name
learning use explicit rarity with a legacy numeric fallback. Ingestion stores an absent numeric frame
as `-1` and preserves the opaque source ID in raw item JSON; it does not guess its meaning. Numeric
frame metadata is not a market-series key. Legacy and current-shaped fixtures retain the same unique
identity, including unidentified mappings, and the summary receiver accepts the unknown sentinel.

After this compatibility change, 47 focused ingestion/metadata regressions and both API-client tests
passed, along with API-client, ingestor and app typechecks. The rebuilt Compose image passed its
8,400-observation offline replay using the persisted volume (`resumed: true`). This is fixture
verification, not live-feed evidence. Authenticated stash inspection still awaits the pending
1Password authorization; the goal remains active until that investigation is resolved.
