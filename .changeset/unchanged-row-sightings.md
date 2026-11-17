---
"@poe-tools/stash-ingest": patch
---

Record only the sighting of a re-sent listing or equipment item whose content is unchanged. Each re-sent stash used to rewrite every column of every listing in it, item JSON included, although almost all of them were unchanged; that UPDATE was the costliest statement of each page. Listings and equipment listings now store a digest of the item (without its position, inventory and note fields) and of every column derived from it. A re-sent item with the same digest only has its last sighting updated. Rows written before this change have no digest and are written in full once.
