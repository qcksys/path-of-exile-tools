---
"@poe-tools/stash-ingest": minor
"poe-boats": minor
---

Split stash markets by the kind of public stash tab: Faustus's merchant tabs (stash type `TradeStash`) and every other tab. Ingest records each listing's tab, sales compare a removal only with listings in the same kind of tab, and a migration adds `tab` to the primary keys of `stash_*_unique_hourly` and `stash_*_market_daily`; earlier rows keep an empty tab. The market list, item pages, history and stash commodity prices in crafting show merchant tabs by default; the new "Stash tabs" filter (`tab`: `merchant`, `other` or `all`, also on the HTTP and MCP market operation) picks other tabs or merges every kind, and only `all` includes the earlier rows. Crafting base cohorts now count merchant tabs only.
