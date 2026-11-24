---
"@poe-tools/stash-ingest": patch
---

Refuse a batch that would store a key twice. Since #191 the listing, sale and equipment tables keep no keys, so before a batch commits it checks the keys it inserted: listings by account, stash and item; equipment by account and item; sales by the five columns `ps_sale_pk` held. A duplicate fails the batch with `<table> would hold a duplicate key (…)`, naming up to three keys; the batch rolls back and is retried, as a primary key's violation did. The listing check scans the table's key columns, about half a second over 10 million listings; its time shows as `keys` in each batch-write line.
