import { index, layout, prefix, type RouteConfig, route } from "@react-router/dev/routes";

export default [
    layout("routes/layouts/site.tsx", [
        index("routes/home.tsx"),
        route("changelog", "routes/changelog.tsx"),
        route("extension", "routes/extension.tsx"),
        route("integrations", "routes/integrations.tsx"),
        route("server-status", "routes/server-status.tsx"),
        route("crafting/share/:id", "routes/crafting/share.tsx"),
        ...prefix("1", [
            index("routes/poe1-home.tsx"),
            route("arbitrage", "routes/arbitrage/poe1.tsx"),
            route("recombinator", "routes/recombinator.tsx"),
            route("market", "routes/market.tsx", [
                route(":category?", "routes/market/index.tsx"),
                route("items/:item", "routes/market/item.tsx"),
                route("exchange/*", "routes/market/exchange.tsx"),
                route("bases/:base", "routes/market/base.tsx"),
            ]),
        ]),
        ...prefix("2", [
            index("routes/poe2-home.tsx"),
            route("arbitrage", "routes/arbitrage/poe2.tsx"),
        ]),
    ]),
    route("login", "routes/login.tsx"),
    route("account", "routes/account.tsx"),
    route("action/set-theme", "routes/action.set-theme.ts"),
    route("api/*", "routes/api.ts"),
    route("mcp", "routes/mcp.ts"),
    ...prefix("api", [
        route("auth/*", "routes/api.auth.$.ts"),
        route("stash-ingest", "routes/api.stash-ingest.ts"),
    ]),
    ...prefix("1", [
        route("crafting/:mode?", "routes/crafting/poe1.tsx"),
        ...prefix("idol-planner", [
            index("routes/idol-planner/home.tsx"),
            route("share/:id", "routes/idol-planner/share.$id.tsx"),
            route("api/share", "routes/idol-planner/api.share.ts"),
            route("api/share/:id", "routes/idol-planner/api.share.$id.ts"),
            route("api/prices/scarabs", "routes/idol-planner/api.prices.scarabs.ts"),
            route("api/sets", "routes/idol-planner/api.sets.ts"),
            route("api/sets/:id", "routes/idol-planner/api.sets.$id.ts"),
            route("api/sets/:id/idols", "routes/idol-planner/api.sets.$id.idols.ts"),
            route("api/sets/:id/placements", "routes/idol-planner/api.sets.$id.placements.ts"),
        ]),
    ]),
    ...prefix("2", [route("crafting/:mode?", "routes/crafting/poe2.tsx")]),
    route("idol-planner/*", "routes/legacy-idol-planner.ts"),
    route("*", "routes/404.tsx"),
] satisfies RouteConfig;
