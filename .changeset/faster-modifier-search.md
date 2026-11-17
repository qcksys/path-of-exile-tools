---
"@poe-tools/item-query": patch
---

Resolve modifiers from displayed text in about half the time, with the same results. The search that explains an item's stat lines tracked its chosen modifier IDs and groups in string sets, which took most of its time; it now numbers them once when the model is compiled and marks them in flag arrays. Candidate stat dimensions are looked up by line instead of through a JSON key per value, and candidates are ranked once before sorting instead of on every comparison. Equipment classification in the stash ingest worker spends most of its time here.
