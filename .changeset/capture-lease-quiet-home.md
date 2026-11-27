---
"@poe-tools/market": patch
"@poe-tools/capture-lease": patch
---

Keep the stash stream captured while home takes the lease back. The lease now records when home last asked for it, and home counts as waiting only while it keeps asking. A fallback that stops renewing or exits is restarted from its last uploaded cursor unless home is still asking and has already imported every segment, in which case home takes the lease at its next request; before, any waiting home stopped the restart, so the stream went uncaptured until home finished importing, or indefinitely if home went quiet. A fallback is no longer told to release to a home that has gone quiet, and a released fallback whose home goes quiet is replaced.
