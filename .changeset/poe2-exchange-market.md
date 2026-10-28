---
"poe-boats": minor
---

Add a Path of Exile 2 market at `/2/market` that lists the currency exchange by the trade site's PoE 2 categories (currency, fragments, essences, runes, abyssal bones, Vaal, Verisium, uncut and lineage gems, Ritual, Delirium, Breach and Expedition), valued in exalted orbs with a choice of adaptive, exalted or divine values. Each item links to its hourly price and pair history at `/2/market/exchange/…`. Exchange seasons list public leagues only. The list is also available as the `get_poe2_season_exchange` HTTP and MCP operation, and `get_season_exchange_item` reads PoE 2 items with realm `poe2`. Exchange rows rename `chaos` to `price` and history `chaos` to `prices`, and responses add the currency as `unit` (`exchangeUnit` on `get_season_market`). `/1/market` links with realm `poe2` now redirect to the PoE 2 market.
