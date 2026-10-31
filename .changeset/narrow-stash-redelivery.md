---
"@poe-tools/stash-ingest": patch
"poe-boats": patch
---

Re-deliver only the items that changed in a stash hour already sent, instead of every market in it, and recount an hour's coverage once per request rather than once per 200 rows. A sale changing status re-sent about 12,000 rows, which kept the receiver's database saturated.
