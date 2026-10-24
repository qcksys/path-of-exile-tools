@AGENTS.md

## React Router routing

Use nested framework routes in `app/routes.ts` for pages with shared layouts.
The parent renders shared navigation and an `<Outlet />`; index and detail route
modules own their loaders and page content. Put resource identity in path parameters
and search, order, filters, and pagination in search parameters. Preserve these
parameters when linking between list and detail pages. Redirect existing URLs when
changing a route so bookmarks retain their item identity and variant filters.
