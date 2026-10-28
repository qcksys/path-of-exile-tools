---
"poe-boats": patch
---

Load season market pages faster. The list of seasons with exchange data now comes from the hour coverage rollup instead of a scan of every stored exchange snapshot, which took 4.6–8 s on every PoE 1 list, PoE 2 list and base page on the dev database.
