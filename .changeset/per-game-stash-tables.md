---
"poe-boats": minor
"@poe-tools/market": minor
---

Store stash data in separate PoE 1 and PoE 2 tables (`stash_poe1_*`, `stash_poe2_*`) and shrink equipment cohort storage. A cohort definition is stored once per cohort ID instead of once per catalog revision, and each cohort hour keeps only the newest revision's classification (a 4-byte revision number replaces the 64-character revision in the key). The key leads with the hour, so each delivered hour appends rather than updating pages across the table. The 6/24-hour price windows move to a table that keeps 48 hours. Saved crafting prices no longer store a catalog revision; older references still decode. Migrations restart from a single initial migration, and the unused `stash_unique_daily`, `stash_currency_latest` and `stash_cohort_revision_hour` tables are gone.
