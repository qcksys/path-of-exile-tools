---
"@poe-tools/stash-ingest": minor
"poe-boats": minor
---

Sort and filter the market list by the price each row shows, locked in chaos and divine at the exchange rate of the hour its stash rows are written. It sorted by a row's listings in the selected currency alone, so an item shown at 32 chaos could outrank one at 20 divine. Workers now deliver an hour's exchange first and hold its stash rows until that exchange is captured. Crafting bases also sort by the price they show.

Apply the `market_price` migration before deploying the receiver, then run `vp run db:backfill-market-prices <league>`.
