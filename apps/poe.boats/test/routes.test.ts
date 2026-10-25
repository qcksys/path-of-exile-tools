import type { RouteConfigEntry } from "@react-router/dev/routes";
import { matchRoutes } from "react-router";
import { describe, expect, it } from "vite-plus/test";
import { buildShareUrl } from "~/lib/share";
import routeConfig from "~/routes";
import { action, loader } from "~/routes/legacy-idol-planner";

function routeObjects(entries: RouteConfigEntry[]): import("react-router").RouteObject[] {
    return entries.map(({ file, path, index, children }) =>
        index
            ? { id: file, path, index: true }
            : { id: file, path, children: children ? routeObjects(children) : undefined },
    );
}
const routes = routeObjects(routeConfig);

describe("game routes", () => {
    it.each([
        ["/", "routes/home.tsx"],
        ["/1/", "routes/poe1-home.tsx"],
        ["/2/", "routes/poe2-home.tsx"],
        ["/1/arbitrage", "routes/arbitrage/poe1.tsx"],
        ["/1/market", "routes/market/index.tsx"],
        ["/1/market/items/Abberath's%20Hooves", "routes/market/item.tsx"],
        ["/2/arbitrage", "routes/arbitrage/poe2.tsx"],
        ["/3/arbitrage", "routes/404.tsx"],
        ["/1/idol-planner", "routes/idol-planner/home.tsx"],
        ["/1/recombinator", "routes/recombinator.tsx"],
        ["/2/recombinator", "routes/404.tsx"],
        ["/1/idol-planner/share/example", "routes/idol-planner/share.$id.tsx"],
        ["/1/idol-planner/api/share", "routes/idol-planner/api.share.ts"],
        ["/1/idol-planner/api/share/example", "routes/idol-planner/api.share.$id.ts"],
        ["/1/idol-planner/api/prices/scarabs", "routes/idol-planner/api.prices.scarabs.ts"],
        ["/1/idol-planner/api/sets", "routes/idol-planner/api.sets.ts"],
        ["/1/idol-planner/api/sets/example", "routes/idol-planner/api.sets.$id.ts"],
        ["/1/idol-planner/api/sets/example/idols", "routes/idol-planner/api.sets.$id.idols.ts"],
        [
            "/1/idol-planner/api/sets/example/placements",
            "routes/idol-planner/api.sets.$id.placements.ts",
        ],
        ["/idol-planner", "routes/legacy-idol-planner.ts"],
        ["/idol-planner/share/example", "routes/legacy-idol-planner.ts"],
        ["/idol-planner/api/share", "routes/legacy-idol-planner.ts"],
        ["/2/idol-planner", "routes/404.tsx"],
        ["/2/idol-planner/api/share", "routes/404.tsx"],
        ["/3/", "routes/404.tsx"],
        ["/1/crafting", "routes/crafting/poe1.tsx"],
        ["/1/crafting/simulate", "routes/crafting/poe1.tsx"],
        ["/2/crafting/projects", "routes/crafting/poe2.tsx"],
        ["/crafting/share/example", "routes/crafting/share.tsx"],
    ])("routes %s to %s", (path, id) => {
        expect(matchRoutes(routes, path)?.at(-1)?.route.id).toBe(id);
    });
});

describe("site layout", () => {
    it.each([
        ["/", true],
        ["/changelog", true],
        ["/integrations", true],
        ["/server-status", true],
        ["/crafting/share/example", true],
        ["/1/", true],
        ["/1/arbitrage", true],
        ["/1/recombinator", true],
        ["/1/market/items/example", true],
        ["/2/", true],
        ["/2/arbitrage", true],
        ["/1/crafting", false],
        ["/2/crafting", false],
        ["/1/idol-planner", false],
        ["/1/idol-planner/share/example", false],
        ["/1/idol-planner/api/sets", false],
        ["/login", false],
        ["/account", false],
        ["/api/stash-ingest", false],
        ["/3/", false],
    ])("%s renders inside the site layout: %s", (path, inside) => {
        const ids = matchRoutes(routes, path)?.map((match) => match.route.id);
        expect(ids?.includes("routes/layouts/site.tsx")).toBe(inside);
    });
});

describe("legacy planner redirects", () => {
    it.each([
        "/idol-planner",
        "/idol-planner/",
        "/idol-planner/share/example?lang=de",
        "/idol-planner/api/prices/scarabs?league=Legacy%20of%20Phrecia",
    ])("permanently redirects %s while preserving its path and query", (path) => {
        const response = loader({ request: new Request(`https://poe.boats${path}`) });

        expect(response.status).toBe(308);
        expect(response.headers.get("Location")).toBe(`/1${path}`);
    });

    it.each([
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
    ])("uses a method-preserving redirect for %s requests", (method) => {
        const response = action({
            request: new Request("https://poe.boats/idol-planner/api/sets/example", { method }),
        });

        expect(response.status).toBe(308);
        expect(response.headers.get("Location")).toBe("/1/idol-planner/api/sets/example");
    });
});

it("generates share links under the PoE 1 base path", () => {
    expect(buildShareUrl("https://poe.boats", "example")).toBe(
        "https://poe.boats/1/idol-planner/share/example",
    );
});
