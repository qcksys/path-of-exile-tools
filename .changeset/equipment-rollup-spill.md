---
"@poe-tools/stash-ingest": patch
---

Roll up an equipment hour without writing a day of observations to temporary files. DuckDB materializes a CTE that a query reads twice, so the rollup wrote every observation of its 24-hour window, with their cohort arrays, to temporary files, and again for each listing's latest row and their cohort expansion. A completed hour on a busy league wrote tens of gigabytes, and on a nearly full disk the rollup failed until space was freed. Those CTEs are now read again instead of stored, and each listing's latest hour comes from its key rather than a window over every row. The rollup's results are unchanged.
