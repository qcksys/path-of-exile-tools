---
"@poe-tools/stash-ingest": patch
---

Run `compact` without the worker's environment. Every `poe-stash-ps` command loaded and checked the worker's credentials and settings first, so the deploy README's `docker run <image> compact …` refused to start with `Configuration is currently invalid`. `compact` only copies a database and now skips that step.
