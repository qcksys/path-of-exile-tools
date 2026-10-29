---
"@poe-tools/stash-ingest": minor
"poe-boats": minor
---

Price scarabs, vendor-recipe arbitrage and Bestiary/temple crafting inputs from poe.boats's own market data instead of poe.ninja. Scarab prices (`get_scarab_prices`) and the PoE 1 and PoE 2 arbitrage pages (`get_arbitrage_market`) read the league's PC currency exchange on each request, priced as the season exchange list prices items: the latest completed hour's trades, or else the newest of the last seven days that traded. The arbitrage league list now comes from the exchange's own seasons. The 15-minute scarab job and its cache table are gone; a migration drops `idol_planner_price_cache`.

The stash ingester now captures beasts (rare beasts by species under a `beast` signature that drops their random name) and gives each Chronicle of Atzoatl a `temple` signature naming its open tier 3 Locus of Corruption and Doryani's Institute rooms. Crafting beast recipes and the Locus of Corruption are priced from these captured merchant-tab asks (`stash-recipe` source), converted from chaos, divine or exalted at the hour's exchange rate when needed. They now also work at historical cutoffs. A refresh rebinds prices saved from poe.ninja to the captured asks. Captured beasts are listed under the market's Beasts category. Beast and temple prices appear once the updated ingester has delivered hours that include them.
