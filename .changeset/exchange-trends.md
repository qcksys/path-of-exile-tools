---
"poe-boats": minor
---

Show more about each season market exchange item. Each item's value comes from the latest hour's trades, or from the newest of the last 7 days it traded (shown with when), and the table adds a 7-day trend, the chaos value traded per hour, the most traded pair, the item each price converts through, and a choice of adaptive, chaos or divine values; it lists the dearest items first. Each item links to a new page with its hourly price and per-pair history over the selected period, with each hour's lowest to highest rate shaded, also available as the `get_season_exchange_item` HTTP and MCP operation. The `exchange` rows of `get_season_market` change shape: `volume` is now chaos per hour, and they add `via`, `current`, `history`, `change` and `pair`. Apply the `exchange_daily` migration before deploying.
