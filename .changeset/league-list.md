---
"poe-boats": minor
"@poe-tools/market": minor
"@poe-tools/stash-ingest": minor
---

Keep each realm's league list from GGG's league API. Ingest workers push the complete list at most hourly as a `leagues` stream, and poe.boats stores it in `stash_poe1_league` / `stash_poe2_league`, marking a league ended when it leaves the list or its end date passes. Market seasons now come from the hour coverage rollup instead of scanning the hourly tables, and the market, exchange, arbitrage and crafting base pages default to the newest league that is still listed.
