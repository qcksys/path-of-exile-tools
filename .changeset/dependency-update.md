---
"poe-boats": patch
"@poe-tools/stash-ingest": patch
---

Update dependencies to their latest versions, including React Router 8, TypeScript 7, Vite+ 1.8, i18next 27 and React Flow 13, and move the Node runtime, the ingest image included, to Node 26 LTS. The legacy idol planner redirect and share links now use the loader's cleaned URL, so client navigations no longer carry `.data` or router parameters into them. MCP tools keep object schemas at the root, which Zod 4.6 had turned into `$ref`s, and the crafting canvases stay light as before. `@planetscale/database` stays on 1.x until drizzle-orm supports 2.0.
