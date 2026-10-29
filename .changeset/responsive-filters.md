---
"poe-boats": patch
---

Keep market and arbitrage filters usable while a page loads. The market no longer blocks clicks while an earlier filter change loads, and only the results dim, so a further filter change (e.g. Influence: None right after 8 mods) replaces the pending load with both filters. The arbitrage page's Load prices button stays enabled while prices load.
