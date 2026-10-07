# Browser coverage

Run `vp exec playwright test` from the app directory. Playwright builds the application and starts the
real Cloudflare runtime through `test/e2e/server.ts`, using validated inert `.env.test` values and
Varlock's serialized environment binding. The test server disables Wrangler's inspector explicitly:
with Wrangler 4.84.1 on Windows, forwarding thousands of inspector events from a retained-catalog
fetch stalls HTTP delivery after the application has already returned its response. This setting
does not replace the application, asset binding, validation, or HTTP transport with mocks.

When running another checkout concurrently, set a distinct port in that shell before invoking
Playwright, for example `$env:PLAYWRIGHT_PORT='46733'`. The server and browser use the same value;
the default remains 4173. This avoids a second checkout becoming ready on the shared default port
while the current build is still starting.

`crafting-history.spec.ts` executes both games' retained revisions in the actual browser worker and
compares their results with the real HTTP operation. It also checks pinned artifact requests,
immutable caching, cancellation/replacement while the page remains responsive, and corrupt-data
refusal.

`crafting-projects.spec.ts` uses the visible project controls for both games: new tabs, manual prices,
worker calculations, duplication, reload, workbench handoff, build references versus independent
copies, portable export/import, query edits, recovery branches and manual ordering. It also verifies
catalog loading in a worker with a recoverable HTTP failure and explicit historical correction adoption.
Prepared Incursion glove suffixes can be selected in the workbench, handed to a new r4 project and
reopened with the modifier intact. Earlier retained revisions remain available.
Both games prepare trade links in a worker, retain a league containing spaces, and invalidate the
link after an edit. A modifier query displays fidelity warnings and produces the same URL through
the worker and the real HTTP operation. External listings are not fetched by these tests.
Both games also generate queries from copied items in a worker and preserve the selected fields.
Ambiguous hybrid/separate-mod text requires a choice, and invalid text leaves existing requirements
unchanged.
The NNN graph case calculates two fully specified purchased donors through recombination, verifies
the full 31-chaos cost and suppression retention, then selects an eligible essence preparation step.

The crafting adapter's NNN regressions use the same original
[single-mod transfer research](https://www.reddit.com/r/pathofexile/comments/1ljll69/using_recombination_and_essences_for_guaranteed/)
as the recombinator cases below. Recipe identities and base eligibility come from the extracted
catalog. The tests distinguish natural essence modifiers from essence-exclusive modifiers and
cover the requested Grasping Mail crit modifier; they assert model behavior, not new server measurements.

Conditional preparation cases configure the first-input query through the UI in both games, retain
it across reloads, and compare a skipped craft's costs and action counts with the real HTTP operation.
The history suite executes all ten game/revision combinations through the retained worker and HTTP.
Core regressions additionally fill missing suffixes, preserve prepared prefixes, skip donor acquisition,
refuse unknown conditions and bound non-productive recovery loops.

The equipment-price cases exercise cohort selection, history display, persisted source references,
refresh after reopening, outage refusal and explicit manual overrides. They switch from hourly to
adaptive equipment estimates, verify the six-hour preview and persisted policy, and cancel stale
results when the window or purchased item changes. Incomplete coverage is refused. Browser responses are fixtures;
the separate MySQL ingestion integration verifies real capture, historical lookup and process costs.
Whole-process history cases exercise both games' date sampling, retained-worker costs, missing-data
gaps, cancellation and preservation of the live draft. Historical market responses are fixtures;
the MySQL replay separately verifies before-first-observation gaps and early/middle-league repricing.

`crafting-cloud.spec.ts` covers both games' storage choice, private autosync, frozen shares, preview
calculations with refreshed prices, independent copies and revocation. It also covers offline edits,
conflict preservation, live build references versus value copies, account changes and disabling uploads
in local mode. Authentication and cloud persistence responses are fixtures; the actual graph worker,
retained rulesets, storage adapter and UI execute in the browser. Separate MySQL integration cases in
`test/e2e/crafting-cloud.test.ts` verify persistence, transactions, ownership and HTTP/MCP behavior.

`crafting-workbench.spec.ts` compares both games' actual calculation worker messages with real HTTP
results for identical projects and seeds. It also compares item and process emulation, checks draft
preservation and undo, and makes no mocked calculation responses. Manual-stop simulations are browser
only; bounded API refusals and HTTP/MCP equivalence are covered by the transport suite.
The selected-craft handoff cases create persistent graph tabs in both games, calculate with the
copied prices, preserve full recombination donors and charge each once. A missing donor leaves the
workbench draft in place without creating a project. These cases use the real authoring HTTP operation.

The fossil optimizer case runs two real browser workers, compares their combined rankings with
the HTTP optimizer, selects a recipe and passes it into a graph without changing the starting item.
Both-game starting-item cases compare manual flag and level edits with the HTTP editor, preserve
prices, and compare exported text with the shared HTTP exporter. Transport tests additionally cover
MCP parity, allocated passives, invalid edits, stale builds and optimizer request limits.

The both-game exchange cases switch from hourly to adaptive estimates, verify stale lookup results
are cleared, display the selected six-hour window, and preserve the adaptive binding and saved-price
label through refresh/reload. Manual overrides remove the binding. Market responses are fixtures;
separate MySQL ingestion tests exercise actual 24-hour lookups, weighted volumes, historical cutoffs,
unchanged hourly history and whole-process prices. Core tests cover widening limits and unusable data.

## Recombinator

`recombinator-crafting.spec.ts` also transfers a connected four-input, three-recombination example
through the real HTTP authoring operation. It requires concrete bases, invalidates previews when roll
assumptions change, preserves target queries and connections, creates a new tab and restores it after
reload. Purchases stay unpriced. Core tests cover bench preparation, conditional crafted-mod removal,
cost accounting, HTTP/MCP equality and unsupported idealized essence preparation.

The suite covers preparing a catalog-selected input for a new crafting project:
explicit concrete-base selection, rarity and rolled-value assumptions, preview invalidation after
changes, persistent item state, unknown purchase price, and preservation of the workbench draft.
Custom modifier text is refused without creating a project. Generic INT body armour is resolved to
a compatible Vaal Regalia; a hybrid base is not a member of that generic category.

These tests exercise `/1/recombinator` through its visible controls, generated item/mod/recipe catalog, and calculation worker. They use fixed expected probabilities rather than importing the calculator as a test oracle. All donors are already prepared; rolling, annulling, costs, and retries are excluded.

## Common crafts

The crafting project suite also exercises the full method editor for both games: cancelling leaves
the draft unchanged, applying preserves reference items, conditions, prices and routes, fossil
settings survive reload, and recombination creates a separately consumed second input. Methods
cannot remove a port that receives recoveries; the full and quick selectors both enforce this.
The method editor uses the existing workbench controls and the real shared HTTP operation.

Both-game sampled-output cases compare the browser's selected item with the retained HTTP
calculation using the same estimate-iteration setting, then verify a new tab preserves every item
field and the older r4 pin while leaving its acquisition price unknown. The source draft is unchanged,
the copy survives reload, and editing the source hides stale outputs. Same-page draft notifications
let nested handoff controls update the visible tabs immediately.

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
