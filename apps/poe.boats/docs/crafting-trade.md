# Crafting trade searches

`buildCraftingTradeSearch` translates the shared item query using the selected crafting catalog
and committed official trade metadata. The graph's output-requirements panel runs the function in
`crafting-trade.worker.ts`; the HTTP `/api/v1/crafting/items/trade` operation and
`build_crafting_trade_search` MCP tool call the same function. Neither path fetches listings.
The graph stores the league and manual purchase prices. A requirement, catalog or league change
invalidates the previous link and terminates pending work.

Base names, single supported rarities, the normal/magic/rare union, item levels, flags, socket
counts and prefix/suffix counts translate to the official fields. The two games' field groups are
read from their own metadata: PoE 2 uses `type_filters.ilvl` and
`equipment_filters.total_augment_sockets`, whereas PoE 1 uses `misc_filters.ilvl` and
`socket_filters.sockets`/`links`. Single influences use official pseudo stats. Compatible repeated
ranges intersect; contradictory exact fields are refused.

Modifier IDs are resolved against the chosen catalog. A single required ID can translate to its
displayed stats when each line has an unambiguous official stat ID; local, fractured and crafted
variants are distinguished. Single-value positive ranges supply minimum displayed rolls. Upper
bounds are omitted because other affixes can contribute to the same displayed total. The result
is always marked approximate: this does not prove modifier identity, tier, affix side or negative
flags, and hybrid stats may come from multiple affixes. Tier-only queries, alternative modifier
IDs, unresolved text mappings and unsupported properties remain explicit omissions. Internal stat
IDs are not guessed to be official trade IDs.

OR, NOT and bounded-count groups translate only when every condition is one exact trade stat.
Otherwise the complete group is omitted with a warning, avoiding narrower or inverted searches
caused by translating only part of the group. Each warning identifies its original group and,
where applicable, condition. `fidelity: exact` describes the represented item conditions, not the
availability, price, saleability or freshness of results on the external site.

## Updating metadata

From `apps/poe.boats`, run:

```powershell
vp exec tsx scripts/fetch-crafting-trade-metadata.ts
```

The generator reads only public static metadata, validates response shapes, and writes the compact
`app/data/crafting-trade-poe1.json` and `crafting-trade-poe2.json` files. Each records its retrieval
date and source URLs. It retains numeric stat text/IDs and filter groups/options; option-valued
stats are excluded because the current query model cannot represent their selection semantics.
Review the generated diff and run `test/crafting-trade.test.ts`, transport parity and browser tests
after an update. Metadata describes the current trade website; historical crafting engine and
catalog artifacts remain immutable.

Official sources verified for this implementation:

- [PoE 1 filter definitions](https://www.pathofexile.com/api/trade/data/filters)
- [PoE 1 stat definitions](https://www.pathofexile.com/api/trade/data/stats)
- [PoE 2 filter definitions](https://www.pathofexile.com/api/trade2/data/filters)
- [PoE 2 stat definitions](https://www.pathofexile.com/api/trade2/data/stats)

Equipment prices in PoE 2 remain user-entered after the user inspects the generated trade search.
There is no automated equipment-listing ingestion, scraping or implied market valuation here.

## Queries from copied items

Every graph query editor can preview English game-copy or PoB item text. Parsing and retained
catalog validation run in `crafting-item-query-text.worker.ts`; the same `queriesFromItemText`
function backs `/api/v1/crafting/items/query-from-text` and `create_item_queries_from_text`.
It returns every supported interpretation, including hybrid-versus-separate affix ambiguity.
Multiple matches require an explicit choice before the current requirements can be replaced.
Errors and source edits invalidate the preview without changing the saved query.

`@poe-tools/item-query` supplies `queryFromItem`, also exposed as `/api/v1/crafting/items/query`
and `create_item_query`. The base is always included. Users choose minimum level, rarity, item
flags/influences, explicit or implicit modifiers, minimum empty affix slots, and sockets/links.
Only resolved identities are included; names and displayed rolls alone do not become guessed
canonical IDs. Unknown fields produce warnings. Query generation preserves known tiers and
fractured/crafted status, using the game's actual affix limits. Resulting conditions remain editable.

This creates item requirements; it does not record execution progress or replace a purchased
item's simulated state. Parsing uses the selected historical catalog and the current import parser;
published crafting probability engines and their historical data are not rewritten by this feature.
