---
"poe-boats": minor
---

Store exchange market hours in `stash_<game>_currency_hour`, keyed by `(hour, marketId)` with the market's int `id` from `stash_<game>_currency_market`. Each cxapi digest map holds exactly the market's two items, so their values are now ten numeric columns and rows carry no item IDs. `stash_<game>_currency_hourly` becomes a view that rebuilds the maps, so readers are unchanged. The migration copies every stored hour into the new table before dropping the old one, and crafting's exchange membership now reads each market's first hour from `currency_market`.
