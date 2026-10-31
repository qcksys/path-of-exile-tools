---
"poe-boats": minor
"@poe-tools/stash-ingest": minor
---

Stash markets now track merchant tabs only. The worker still captures and archives every public tab but delivers only merchant listings, and the market list, item pages, HTTP API and MCP tools no longer offer a `tab` choice. A `tab` parameter on an older link is ignored, and rows stored earlier for other tabs stay in the database unread.
