---
"@poe-tools/stash-ingest": patch
---

Apply public stash pages in batches. With `PS_BATCH_PAGES` above 1, the process worker applies that many pages in one transaction (a batch also ends at each capture hour): it keeps every `ps_listing` row's key, content digest and market in memory, finds each page's listing changes and prices its sales there, and writes the batch's listings, hour rows, sales and basemap in a few statements, instead of about twenty statements a page against tables of millions of rows. The tables are the same as applying page by page, which a differential test checks over generated page sequences; a failed batch rolls back, its pages are read again, and the memory is rebuilt from the database. Listings gain a `listing_id`, the worker's own row identity. Mod pool sales whose best mods tie on price now take the one with most sellers, so their market no longer depends on aggregation order. The deployed PC worker applies 200 pages per transaction.
