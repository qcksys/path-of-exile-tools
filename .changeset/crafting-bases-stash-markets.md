---
"poe-boats": minor
"@poe-tools/market": minor
"@poe-tools/stash-ingest": minor
---

Crafting bases are now ordinary stash markets, with likely sales, price history and item pages like any other. The worker captures clean equipment of the listed bases under a `base` signature, and each listing belongs to one market by item level, links and quality band. The list keeps the two newest armour bases per defence type and implicit, and for weapons also every stat winner. `get_season_market_base` and the `bases` field of `get_season_market` are gone; base rows arrive in `rows`, and old `/1/market/bases/:base` pages redirect. Crafting cohorts are unchanged and still price crafting. Base history restarts when the worker is deployed.
