---
"poe-boats": minor
"@poe-tools/stash-ingest": minor
---

Stash market item pages chart the likely sale price in its own colour, apart from the lowest ask, with its interquartile band as a legend entry that can be toggled, and show each hour's total listings, new listings and likely sales as a panel under the prices. A slider under the chart (or scrolling and dragging on it) narrows both panels to a date range. Likely sales have their own axis so a few sales stay visible beside many listings. The ingest workers now count new listings (first seen in the hour) as `newCount`, stored in `stash_<game>_market_hour` and returned with market hours over HTTP and MCP; hours ingested before this have no count and the chart leaves them out.
