# UI, API, and MCP parity

Before changing a feature, read [docs/surfaces.md](docs/surfaces.md). A feature is complete when its UI, HTTP operation, and MCP tool call the same core function, use the same domain schemas, and enforce the same ownership and validation rules.

- Put browser-safe calculations and state changes in `app/operations/` or the existing `app/lib/` domain module. Put database operations in `*.server.ts`; they take an authenticated caller, never a caller ID supplied in a request body.
- Register each capability in `app/operations/registry.server.ts` or one of its feature catalogs. Each registration requires input/output Zod object schemas, a description, access policy, UI location, and read-only annotation. The Hono subrouters, OpenAPI document, MCP tools, and browser reference derive from this catalog.
- Derive request schemas from existing domain schemas with `pick`, `partial`, and `extend`. Parse results at the common operation boundary. Keep HTTP requests, cookies, and JSON-RPC out of domain operations.
- Preserve browser-local drafts. Stateless operations accept and return their state; saved-set operations act on the signed-in account. Programmatic access does not silently synchronize a browser's local storage.
- Check ownership of the set and membership of every child ID before writes. Run saved-set edits in a transaction, locking the owned parent before reading its children. Keep duplicate/import ID remapping in the shared planner operation.
- Add behavioral tests for new operations and update the coverage inventory in `docs/surfaces.md`. The parity suite checks every catalog entry against HTTP/OpenAPI and MCP discovery; also test successful calls and refusals through both transports.
- Validate with the repository's Biome, build, types, and tests via Vite+ (`vp`). `APP_ENV=test` selects inert build/test credentials. `VARLOCK_TELEMETRY_DISABLED=1` avoids reading per-user telemetry configuration; `WRANGLER_LOG_PATH=./.wrangler/logs` keeps logs local.

# React Router routing

`app/routes.ts` is the route tree. Shared UI lives in a parent route that renders an `<Outlet />`; each child route module owns its loader, `meta`, and page content.

- **Site layout.** Pages with the standard header and footer sit inside `layout("routes/layouts/site.tsx", [...])`. A page there renders only its `<main>` (with `flex-1` so the footer stays at the bottom) and names its header section with `export const handle = { section, sectionBadge } satisfies SiteHandle`; the deepest matching `handle` wins.
- **Own chrome.** Routes whose header or footer depends on page state render `AppHeader`/`AppFooter` themselves and sit outside the site layout: the crafting workbench (fullscreen hides both; the footer shows the catalog build), the idol planner (viewport-height layout and a pre-hydration screen), and login/account. Resource routes (no default export) also sit outside.
- **Choosing the helper.** `layout()` for shared UI with no URL segment; `route(path, file, [children])` plus `<Outlet />` when the parent owns both a URL segment and UI (`/1/market`); `prefix()` to group URLs with no shared UI.
- **URLs.** Put resource identity in path parameters and search, order, filters, and pagination in search parameters, and carry those parameters across list and detail links. When a route's URL changes, redirect the old one (as `routes/legacy-idol-planner.ts` does) so bookmarks keep their item identity and variant filters.
- Add each new path to `test/routes.test.ts`, including whether it renders inside the site layout.
