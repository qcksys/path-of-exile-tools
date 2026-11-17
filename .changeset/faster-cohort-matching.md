---
"@poe-tools/item-query": patch
"@poe-tools/market": patch
---

Classify equipment against market cohorts faster, with the same results. A query now stops at its first filter or group that rules the item out, instead of evaluating every filter of every cohort of the item's base. Cohort queries are split from their source preparation once when the catalog is compiled, not for every item. The modifier search steps only through the candidates of a side that still has room.
