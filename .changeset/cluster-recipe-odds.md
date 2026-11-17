---
"poe-boats": minor
"@poe-tools/market": minor
---

The PoE 1 arbitrage page now estimates the 5-for-1 Cluster Jewel recipe. For each size it prices every rollable enchantment at every passive count from the Cluster Jewel base markets' latest merchant-tab asks in the chosen item level band (84+ by default). Every outcome is assumed equally likely, unpriced outcomes count as 0, and the five enchantments that no longer roll are excluded. Per size the page shows the expected value per craft, the value without the best outcome, the median outcome, the break-even input price, profit against five of the cheapest priced inputs, the chance an output beats that cost, and the break-even price when low outputs go back into the recipe. `get_cluster_recipe_market` and `calculate_cluster_recipe` expose the same prices and calculation over HTTP and MCP. `@poe-tools/market` exports `marketClusterBases`.
