import { index, prefix, type RouteConfig, route } from "@react-router/dev/routes";

export default [
    index("routes/home.tsx"),
    route("login", "routes/login.tsx"),
    route("account", "routes/account.tsx"),
    route("action/set-theme", "routes/action.set-theme.ts"),
    route("changelog", "routes/changelog.tsx"),
    ...prefix("api", [
        route("auth/*", "routes/api.auth.$.ts"),
        route("stash-ingest", "routes/api.stash-ingest.ts"),
    ]),
    ...prefix("1", [
        index("routes/poe1-home.tsx"),
        route("arbitrage", "routes/arbitrage/poe1.tsx"),
        route("recombinator", "routes/recombinator.tsx"),
        route("crafting/:mode?", "routes/crafting/poe1.tsx"),
        route("market", "routes/market.tsx"),
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
    ...prefix("2", [
        index("routes/poe2-home.tsx"),
        route("crafting/:mode?", "routes/crafting/poe2.tsx"),
        route("arbitrage", "routes/arbitrage/poe2.tsx"),
    ]),
    route("idol-planner/*", "routes/legacy-idol-planner.ts"),
    route("*", "routes/404.tsx"),
] satisfies RouteConfig;
