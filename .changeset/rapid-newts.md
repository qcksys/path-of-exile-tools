---
"@poe-tools/stash-ingest": patch
---

Judge sales while the stream is busy. Sales were judged only after a page that echoed its requested cursor. In a busy stream every request finds new changes, so no page echoed it and every removal was stored as `unobserved`. A page smaller than the API's page limit (about 5 MB) now also counts as the stream's head. Removals made while capture receives full pages, and so is behind the head, stay unobserved.
