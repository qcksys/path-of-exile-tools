# Maintaining feature parity

The app uses React Router framework routes (the Remix successor) on Cloudflare Workers. `/api/*` is a resource route that forwards the original Web Request to `OpenAPIHono`; `/mcp` uses the SDK's stateless Web Standard Streamable HTTP transport. The existing `/api/auth/*` and `/api/stash-ingest` routes remain more-specific resource routes.

`app/operations/registry.server.ts` assembles the feature operation catalogs. HTTP routes, OpenAPI, MCP tool registration, and `/integrations` all read that catalog. A registration points at the function the normal UI uses; it is not an alternative implementation. Pure calculations can run locally in the browser, including the recombinator's Web Worker, without an HTTP round trip.

## Coverage

| UI capability | HTTP family under `/api/v1` | MCP / shared implementation |
| --- | --- | --- |
| PoE 1 and PoE 2 arbitrage leagues, prices, recipes | `arbitrage/market` | `get_arbitrage_market`; `loadArbitrageMarket` |
| Arbitrage filters, ranking, buffer, profit/ROI | `arbitrage/calculate` | `calculate_arbitrage`; `findArbitrage` |
| Manual recipe reference, calculator and trade links | `arbitrage/recipes`, `arbitrage/scenario`, `arbitrage/trade` | `list_vendor_recipes`, `calculate_recipe_scenario`, `build_recipe_trade_url` |
| Season market search, seasons, paging, variants, history | `market` | `get_season_market`; `getMarketData` |
| Recombinator equipment, modifiers, preparation recipes | `recombinator/catalog`, `bases`, `mods`, `recipes`, `draft` | Catalog, base/mod/recipe filtering, and `parseRecombinatorDraft` |
| Recombination outcomes, preparation, target odds | `recombinator/calculate`, `target` | `calculateRecombinatorPlan`, `matchesTarget`, `summarizeCounts` |
| Local sets: create, select, rename, duplicate, delete, import | `idol-planner/edit`, `import` | `edit_idol_planner`, `import_idol_share`; shared immutable state operations |
| Inventory: add, edit, duplicate, delete, clear, search, paste parsing | `idol-planner/edit`, `inventory`, `parse` | Planner commands, localized inventory search, and parser |
| Grid placement, movement, removal, collision/unlock rules | `idol-planner/edit`, `can-place` | `editPlanner`, `canPlaceInSet`; also used by drag previews |
| Map-device scarabs, crafting options, unlocks | `idol-planner/edit`, `catalog` | Planner commands and shared reference data |
| Modifier catalog/search, unique idol picker, trade links, combined stats, scarab cost | `idol-planner/mods`, `mods/search`, `uniques`, `trade`, `stats` | Shared catalog, filters, trade builders, aggregation, and price calculation |
| League/realm, favorites, trade-weight preferences | `preferences/*` | Shared preference operations; caller stores returned state |
| Share creation, share loading, scarab prices | `idol-planner/share`, `prices` | Shared server operations; old planner URLs are compatibility adapters |
| Account profile | `account/me` | `get_account`; authenticated session identity |
| Saved sets and their inventory/placements | `sets/*` | Shared saved-planner operations, usable from `/integrations` |

Navigation, focus, dialogs, clipboard access, and drag gestures are browser presentation. A tool takes the pasted text or resulting command instead. Theme and locale cookie selection remain browser preferences; localized domain operations take an explicit locale. OAuth sign-in/out remain Better Auth protocol endpoints, not tools accepting passwords. Stash ingestion is a separate machine-to-machine pipeline with its own ingest credential; it is not an account operation and is never exposed through account tools.

## Adding a capability or Hono subrouter

1. Implement or extract a feature function. For data owned by an account, take `OperationContext` and check its caller before reading or writing. For a local draft, take explicit state and return new state without accessing browser storage.
2. Define input and result Zod schemas from the domain schemas. Use concrete result fields, including empty/error states. `defineOperation` checks the result at runtime; output-contract failures are internal errors, not client validation errors.
3. Add `defineOperation({ name, family, path, method, description, ui, access, readOnly, input, output, execute })` to a feature catalog and include it in the registry. GET operations use flat query fields; calculations and commands use JSON POST bodies. A new `family` creates an `OpenAPIHono` subrouter automatically and mounts it with `api.route('/v1/<family>', subrouter)` beneath `/api`.
4. Call the same function from the UI or its loader/action. Keep parsing requests and serializing transport errors in the adapters. Existing compatibility URLs must delegate to the shared operation rather than retaining old business logic.
5. Add tests proving UI/core, HTTP and MCP result parity, invalid-input handling, and ownership refusals. The catalog-wide test also checks operation discovery and the served OpenAPI request/result contracts. Add the UI capability to the table above.

The Hono adapter authenticates account routes in route middleware **before** the Zod validators. Its `defaultHook` produces structured validation errors. Each subrouter uses that same hook. The assembler registers method refusals and derives `Allow` from the catalog, so adding a path does not leave an undocumented manual 405 list.

## Authentication and transport

Public features do not require an account. Account operations accept the existing Better Auth session cookie or bearer session token; the bearer plugin is already configured in `auth.server.ts`. Every request resolves the session again, so session expiry/revocation applies equally to API and MCP. The caller cannot choose another user's ID. This is session-bearer authentication, not a new MCP OAuth authorization server; clients must support supplying the bearer header.

MCP exposes public tools to anonymous callers and adds account tools when authenticated. It creates a server/transport per request, uses JSON responses, and closes them after the request completes. GET/DELETE receive 405 because this endpoint has no persistent sessions or SSE subscriptions. Tools return both text and structured results validated by the same output schema as HTTP.

Both transports reject foreign Origin headers, cap operation bodies at 1 MiB, and return non-cacheable results. No request-specific identity lives in module globals. `ASSETS` reads the bundled recombinator catalog without a public self-fetch. No new database tables or migrations are needed.

The browser reference at `/integrations` lists every operation, its schemas, and an explicit Run button. Submitting a write there performs the operation under the signed-in account. `/api/openapi.json` is the machine-readable OpenAPI 3.1 contract; `/api/docs` redirects to the reference.

## References

- Rennix reference implementation: `apps/rennix-app/docs/agents/api.md`, `docs/agents/mcp.md`, `app/routes/api.ts`, and the parity section of its `AGENTS.md`.
- [Hono Zod OpenAPI](https://hono.dev/examples/zod-openapi), [Hono subrouters](https://hono.dev/docs/api/routing).
- [React Router resource routes](https://reactrouter.com/how-to/resource-routes).
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x).
- [Cloudflare asset bindings](https://developers.cloudflare.com/workers/static-assets/binding/).
