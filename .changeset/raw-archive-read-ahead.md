---
"@poe-tools/stash-ingest": patch
---

Read sealed raw hours one line at a time. `readline` read up to 1,024 pages ahead of the worker. With league-start pages of several megabytes, that went past Node's default heap, so a `PS_SEPARATE_CAPTURE` worker reading a sealed hour ran out of memory and restarted before processing a page. Spool hours and capture's seal check now use the same line reader.
