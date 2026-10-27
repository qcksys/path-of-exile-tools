---
"poe-boats": patch
---

Fix signing in and signed-in pages. Better Auth 1.7 checks its Drizzle schema before every auth request, and the two-factor plugin had no table, so each request failed with a schema mismatch. The new `auth_two_factor` table needs its migration applied before deploying.
