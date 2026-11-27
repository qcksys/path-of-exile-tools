---
"@poe-tools/stash-ingest": patch
---

Keep asking for the capture lease while importing the fallback's segments. An import can wait minutes for sealing, and home sent no lease request until it finished, so the lease Worker took home for gone and started another fallback. Home now checks in at each renewal interval during an import, reporting what it has imported so far; if the Worker gives it the lease, it stops importing and holds at once.
