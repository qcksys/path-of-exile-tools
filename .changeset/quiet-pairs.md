---
"poe-boats": minor
---

Stop low volume exchange pairs from setting prices and hide them on item pages by default, with a button to show them. A pair is low volume for an item when it traded in under a tenth of the hours of that item's busiest pair, such as Chaos Orb for Mirror of Kalandra, whose 2 units at 65,000 chaos gave a false 512% rise. This applies to exchange values, trends and charts, and to the prices that arbitrage and scarab pricing read. `get_season_exchange_item` still returns every pair and marks these with `lowVolume`.
