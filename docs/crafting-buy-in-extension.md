# Crafting buy-in prices through a browser extension

Scope agreed 27–28 October 2026 and implemented on 28 October; the decisions are recorded at the
end. Where the implementation differs from the original proposal, see
[Implementation notes](#implementation-notes). The extension lives in
[apps/poe.boats-extension](../apps/poe.boats-extension/README.md); the poe.boats side is described in
[Buy-in prices](../apps/poe.boats/docs/crafting-trade.md#buy-in-prices).

## Goal

For each stage of a crafting graph, compare the expected cost of crafting an item up to that stage
with the price of an item at that stage on the official trade site. Show the stage at which buying in
gives the lowest expected total cost to the final outcome.

Trade searches run in the user's own browser with their own pathofexile.com session. poe.boats never
receives, stores or forwards the session cookie. Only the resulting listing prices and item data
reach poe.boats, and they are saved to the user's craft through the existing account sync.

## What already exists

- Every graph node has an `output` item query (`app/schemas/crafting-graph.ts`). A stage's trade
  search can therefore be generated from the graph without new authoring.
- `buildCraftingTradeSearch` (`app/lib/crafting-trade.ts`) turns an item query into an official
  trade payload and URL for both games, with fidelity warnings. The graph UI (worker), HTTP operation
  and MCP tool share it. See [crafting trade searches](../apps/poe.boats/docs/crafting-trade.md).
- Acquire nodes hold `purchase` and `production` alternatives. `compareAcquisition` picks the lowest
  known expected cost unless the user pins a choice.
- The graph simulation estimates `expectedCost` and `expectedActions` per returned item for each node
  (`app/lib/crafting-graph-simulation.ts`).
- Purchase prices use `craftingPriceSchema` with `source: "manual" | "market"`. PoE 2 equipment
  prices are manual by design: the user opens the generated search and types a price
  ([design](crafting-project-design.md), "Economy and historical prices").
- Crafting bundles sync to the signed-in account with revision checks (`app/operations/crafting-cloud.ts`).
- Both games' trade metadata (`app/data/crafting-trade-poe{1,2}.json`) has the filters this design
  uses: `status` (including `securable`, instant buyout), `indexed` (listing age, from `1hour` to
  `2months`) and `collapse` (one listing per seller account).

The missing pieces are: running each stage's search and collecting its prices, turning a stage into
a buy-or-craft comparison, and a view that shows the comparison across all stages.

## GGG policy constraints

From [the developer docs](https://www.pathofexile.com/developer/docs), read 27 October 2026:

- The trade site's endpoints are not documented, and no OAuth scope covers trade search. The docs
  state that reverse-engineering endpoints outside the documentation is against Terms of Use
  section 7i, and that requests for access to other internal website APIs are denied.
- New OAuth application registrations are currently closed.
- Rate limits are reported in `X-Rate-Limit-Policy`, `X-Rate-Limit-Rules`, `X-Rate-Limit-{rule}`
  and `X-Rate-Limit-{rule}-State`, with `Retry-After` on 429. Repeated 4xx responses (including
  401, 403, 429) count toward a separate invalid-request restriction.
- Public tools must show the non-affiliation statement.

Community trade tools call these endpoints with the user's session, and GGG has tolerated that,
but it is not sanctioned. The first version runs searches automatically (decided 27 October), which
accepts that risk for the user's account and for poe.boats as a Quick Systems product. The limits in
"Running a pricing run" keep the request volume close to what a person clicking through the same
searches would send.

## Proposed design

### Session handling

Requests are made by a script the extension injects into the main world of a
`www.pathofexile.com/trade` or `/trade2` page. They are same-origin requests from GGG's own page, so
the browser attaches the user's cookie and they look the same as the page's own requests. Running in
the main world also avoids the difference between Chrome and Firefox content-script `fetch`
(Firefox content scripts need `content.fetch` to make page-origin requests). The extension does not
request the `cookies` or `webRequest` permissions and never reads the session value.

Before anything leaves the trade tab, the extension removes seller account names, character names
and whisper text. What is sent to poe.boats: price amount and currency, listing indexed time, sale
status (instant buyout or in person), and the item JSON needed to rebuild a representative item.

### Running a pricing run

The user starts a run from the craft page ("Price stages"). There are no scheduled, background or
repeated runs.

1. The craft page builds every stage's search with `buildCraftingTradeSearch` and sends the list to
   the extension. Stages whose saved price is fresh (see staleness) are skipped unless the user
   chooses "Refresh all".
2. The extension uses an open trade tab for the right game, or opens one in the background.
3. Stages run one at a time. By default each stage uses one search and one or two fetches of 10
   listings, as described in the price rule.
4. Before every request the extension reads the last `X-Rate-Limit-*-State` headers and waits until
   the next request fits inside every window. It honours `Retry-After`.
5. Any 4xx response stops the whole run. A 401 or 403 tells the user to sign in on the trade site;
   a 429 shows when the run can be resumed. Completed stages keep their prices.
6. The craft page shows progress per stage and a cancel button.

A craft with eight stages costs between 16 and 24 requests by default, and up to 40 with in-person
listings enabled. The exact search limits are not
published and change, so the run is paced from the headers rather than from fixed numbers.

### Extension as a bridge

The extension does not sign in to poe.boats (decided 27 October). The poe.boats craft page stays the
owner of the graph and saves through the existing cloud sync when the user has chosen cloud storage.

1. The craft page posts the run to a content script on poe.boats (`window.postMessage`,
   origin-checked, Zod-validated).
2. The background worker drives the trade tab and records which craft page started the run.
3. The trade tab's script returns scrubbed listings per stage as each stage finishes.
4. The background worker delivers them to the craft page. If that page has closed, it keeps them in
   `storage.local` until a poe.boats craft page for the same graph connects, then deletes them once
   delivered.

### Price rule

The question each stage price answers is "what would I pay to buy one item at this stage now?". By
default only instant-buyout listings are used (decided 28 October). An instant-buyout listing can be
bought without the seller replying or being online, so its price is what the buyer pays. That
removes the need for the bait filter and the listing-age filter that in-person listings require.

**Default search.** One search per stage adds two filters to the stage's query:

| Filter | Value | Reason |
| --- | --- | --- |
| `status` | `securable` (Instant Buyout) | The listed price can be paid immediately. |
| `collapse` | `true` | One listing per seller, so the depth count below reflects separate sellers. |

There is no `indexed` (listing age) filter: an old instant-buyout listing is still buyable at its
price, so excluding it would only hide real prices on thin stages.

**Listings.** Fetch the first 10 results. Re-check each against the stage's item query locally with
`@poe-tools/item-query` and the graph's catalog, because trade queries are approximate (hybrid stats,
omitted upper bounds, unproven tiers). If none of the 10 match, fetch the next 10. Convert matching
prices to the graph's currency with poe.boats exchange rates. Listings priced in a currency without
a rate are excluded and counted.

**Statistic.** The stage price is the cheapest matching instant-buyout listing.

The stage also stores the number of matching listings, the number within 20% of the stage price (how
many could be bought at about that price, which matters when a craft needs several copies), and the
number dropped by the local re-check.

**Confidence.**

- Any price from an instant-buyout listing is high confidence, whatever the number of listings.
- No matching listings: the price stays unknown and the stage shows "no instant-buyout listings". It
  never becomes zero, matching the design rule that unknown prices are visible rather than free.

**Including in-person listings (opt-in).** A craft setting, off by default, adds in-person listings
for stages that have no instant-buyout match. Those prices are less reliable: the seller may not
reply, and low prices are often bait. For that path only:

1. A second search uses `status: online` (in person, seller online), `indexed: 1week` and one
   listing per seller. If fewer than 5 of the first 10 listings match, the next 10 are fetched.
2. Take the 5 cheapest matching listings and their median *m*; drop listings under half of *m*; the
   price is the cheapest remaining listing. Example: 2, 9, 10, 11 and 14 chaos gives *m* = 10, the
   2 chaos listing is dropped, and the price is 9 chaos.
3. Confidence is medium with 3 or more matching listings and low with 1 or 2. The stage is labelled
   "in person".

The price is saved in the graph's `buyIn.stages` record with its counts, sale type, confidence and
observation time (see [Implementation notes](#implementation-notes)).

The cheapest remaining listing's item becomes the purchase alternative's `item`, so the downstream
simulation starts from a real item (its open affixes and other modifiers), as the design already
requires for acquisition binding.

`buildCraftingTradeSearch` hard-codes `status: "available"` and has no `indexed` or `collapse`
filters. It needs options for all three; the schema in `app/schemas/crafting-trade.ts` also fixes
`status` to `available` and must widen. The generated "Open search" link should use the same
default (`securable`) so the user sees the listings the price came from.

### Staleness

**Listing age** only applies to the opt-in in-person path, through the `indexed` filter. Instant-buyout
listings are used at any age.

**Saved price age** is the time since the stage was priced. Listings sell and prices move, so a saved
price ages even though the listing it came from was real:

| Age | Treatment |
| --- | --- |
| Under 6 hours | Fresh. A run skips the stage unless the user chooses "Refresh all". |
| 6 to 24 hours | Used normally, with its age shown. |
| Over 24 hours | Stale. Still used, so the comparison stays complete, but flagged, and the buy-in recommendation says it rests on stale prices. The next run refreshes it. |

Prices are also cleared when the stage's query, the league or the game changes, as generated trade
links already are today.

### Buy-in comparison

A stage is a craft node on the active path, identified by its output query. For each stage *s*:

- **Craft to here:** the simulation's `expectedCost` for *s*.
- **Buy here:** the stage price for *s*.
- **Total if bought here:** the buy price plus the expected cost from *s* to the final outcome.

The cost from *s* to the end cannot be found by subtracting one stage's cost from another, because
recovery loops, recombination and branch routing share inputs. Instead, for each stage with a
price, run the existing simulation with *s* replaced by an acquire node pinned to the purchase. The
graph worker already runs the simulation off the UI thread; graphs are capped at 100 nodes, so this
is at most one run per priced stage. The recommended buy-in point is the stage with the lowest
total, or "craft from scratch" if none is lower.

The view is a table in the graph editor: stage, craft-to-here cost, stage price (listing count,
count within 20%, confidence, age, dropped listings, fidelity warnings, "in person" label), total if bought here, expected
actions, and an "Open search" link. A chart of total cost by stage can follow.

### Surfaces

- The comparison takes a graph plus per-stage prices and returns the table. It is a pure operation:
  register it in the operation catalog with a UI location, HTTP route and MCP tool
  (`compare_crafting_buy_in`), and add it to `docs/surfaces.md`.
- The listing-to-price rule is also a pure function and can be exposed the same way, taking listings
  as input, so it can be tested and called without the extension.
- Running searches is browser-only and is not offered over HTTP or MCP: those callers have no trade
  session and the server must not make trade requests. HTTP and MCP callers can still supply stage
  prices themselves. Record this exception in `docs/surfaces.md`.

### Extension package

- WXT, Manifest V3, Chrome first, then Firefox. Firefox does not support `externally_connectable`
  for web pages, which is another reason to use a content-script bridge rather than direct page
  messaging. Main-world content scripts need Firefox 128 or later. Check WXT's current documentation
  before starting.
- New workspace app `apps/poe.boats-extension`. It stays thin: poe.boats builds the searches and does
  the matching and pricing; the extension paces requests, runs them, scrubs results and relays them.
  Message schemas live in a shared package so both sides validate the same shapes.
- Both games from the first release: PoE 1 searches go to `/api/trade/…`, PoE 2 to `/api/trade2/…`.
  Rate-limit state is tracked per game.
- Permissions: `storage`, host access to `www.pathofexile.com/trade*` and the poe.boats origins.
- Store listings need a privacy policy page on poe.boats stating what is collected and that the
  session cookie is never read, plus the GGG non-affiliation statement.

## Phases

1. **Core in poe.boats, no extension.** Trade search options (status, indexed, collapse), the `trade`
   price source, the listing-to-price rule, the buy-in comparison operation across UI/HTTP/MCP, and
   the table, driven by manually entered or fixture prices. Verify with unit tests on fixture
   listings for both games and an example graph such as the energy shield armour preset.
2. **Extension with automatic runs and the bridge, Chrome, both games.** Verify pacing and stop rules
   against a fixture server that returns rate-limit headers and 4xx responses (no live GGG requests in
   CI), then by hand on the live trade site for both games.
3. **Firefox build, store listings, privacy page.**

All three phases are implemented. Not yet done: a manual run against the live trade site in both
games and both browsers, and submitting the store listings.

## Risks

- Terms of Use 7i, now with automatic searches. Mitigated by user-started runs only, header-driven
  pacing, stopping on any 4xx and skipping fresh stages.
- Trade site changes can break the request or response format. The extension validates responses
  and reports "could not read results" rather than sending partial data.
- Approximate trade queries. Mitigated by local re-matching and showing dropped counts and warnings.
- Price fixing and stale listings. Mitigated by using instant-buyout listings only by default, and
  by the bait and listing-age filters on the opt-in in-person path, plus the saved-price age.
- Thin instant-buyout supply. Stages with no instant-buyout listing show no price; the user can
  enable in-person listings for the craft. How often this happens in each game is not yet measured.

## Decisions

Taken 27 October 2026:

1. The first version runs searches automatically.
2. The extension relays results to the poe.boats craft page and has no poe.boats sign-in.
3. Observed prices stay private to the user's craft and do not feed poe.boats' shared market data
   for now.
4. The first extension release covers both games.

Taken 28 October 2026:

5. Stage prices use instant-buyout listings only by default, and any instant-buyout price is high
   confidence. In-person listings are an opt-in craft setting.

Still open: confirm the 6 and 24 hour saved-price ages and the in-person path's numbers (5 listings,
half-median bait cut, online within one week).

## Implementation notes

Differences from the proposal above, found while building it:

- **Storage.** Prices are not a new `craftingPriceSchema` source. Retained engine revisions bundle
  their own strict graph schema, so a new price source or graph field would make old revisions
  refuse saved projects. Stage prices live in an optional graph field, `buyIn`, which
  `runtimeGraph` removes in `loadCraftingRevision` before any retained engine sees the graph. It
  still syncs with the project.
- **In-person search.** One search (`online`, listed within a week) instead of widening from 3 days
  to 2 weeks, which would have cost a third search per stage.
- **Run protocol.** The page decides after every fetch whether to fetch 10 more, search in person or
  move on, because only the page can check listings against the stage. Batches stay in extension
  storage until decided or acknowledged, for at most 7 days. Each batch carries the stage's query
  fingerprint, so listings delivered after the page reopens are applied only if the query has not
  changed.
- **Where requests run.** The background worker paces the run and keeps itself alive with an
  extension API call every 20 seconds. Each request is made by a main-world script on a
  pathofexile.com trade tab, opened in the background if none is open.
- **Stalls.** The page ends a run it has not heard from for two minutes past any announced
  rate-limit wait.
- **Minimum gap.** Requests of one kind are at least 1.5 seconds apart, and one request of margin is
  kept below every rate-limit window.
- **Firefox.** Manifest V3 with `strict_min_version` 140, so the built-in data-consent prompt covers
  the required `websiteContent` disclosure. The sources zip rebuilds byte-identically.
- **Privacy page.** `https://poe.boats/extension` describes the extension and is the privacy policy
  URL for both stores; listing text is in `apps/poe.boats-extension/store-listing.md`.
