---
"@poe-tools/stash-ingest": patch
"@poe-tools/market": patch
"@poe-tools/capture-lease": patch
---

Keep capturing the public stash stream while the home ingestion host is down. With `CAPTURE_LEASE_URL`, `capture` fetches only while it holds a lease from the new `apps/capture-lease` Worker, which starts a Cloudflare Container to capture while home is silent. The Container uploads its pages in short segments; when home returns, it appends them to its raw archive in capture order and then continues from the Container's last cursor. Without the URL, capture runs as before.
