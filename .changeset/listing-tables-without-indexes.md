---
"@poe-tools/stash-ingest": minor
---

Keep no indexes on the listing, sale and equipment tables. The worker finds their rows by its own `listing_id` and `equipment_id`, through joins no index serves, so the indexes only enforced keys the worker already keeps. DuckDB 2.0 counts index memory inside `PS_MEMORY_LIMIT`, where these held 4.0 of the worker's 7.4 GiB, and every cycle's capture ran out of memory. `ps_listing_stash`, `ps_sale_pk`, `ps_equipment_stash`, `ps_equipment_item` and `ps_capture_page_time` are dropped. DuckDB cannot drop a primary key, so the first start rebuilds `ps_listing` and `ps_equipment_listing` without theirs, keeping every row, default and NOT NULL. Without indexes, checkpoints also compact their partly deleted row groups in DuckDB 1.x's storage format.
