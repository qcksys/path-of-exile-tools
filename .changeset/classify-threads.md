---
"@poe-tools/stash-ingest": patch
---

Classify equipment on other threads while a page's listings and sales are written. With `PS_CLASSIFY_THREADS` set, a process worker reading a capture process's archive sends each page to that many threads, which classify its merchant-tab equipment with the bundled cohort catalog; the main thread finds their results in its classification cache and classifies only what they missed. Classification was the largest piece of work left on the main thread, which waited for it while DuckDB idled. The deployed PC worker runs three threads and gets eight cores.
