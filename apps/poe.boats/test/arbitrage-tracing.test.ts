import { drizzle } from "drizzle-orm/mysql-proxy";
import { expect, it, vi } from "vite-plus/test";
import type { TDatabase } from "~/db/client";
import { createTraceRecorder } from "./trace-recorder";

it("attributes concurrent arbitrage reads to the vendor and Cluster Jewel branches", async () => {
    const { tracing, spans } = createTraceRecorder();
    vi.doMock("cloudflare:workers", () => ({ env: { LOG_LEVEL: "silent" }, tracing }));
    const { loadArbitrageMarket } = await import("~/services/arbitrage.server");
    const { loadClusterRecipeMarket } = await import("~/services/cluster-recipe.server");
    const hour = Date.UTC(2026, 10, 25) / 1000;
    const db = drizzle(async (sql) => {
        if (sql.includes("hour_coverage")) return { rows: [["Standard", hour, hour]] };
        if (sql.includes("unique_hourly")) {
            return {
                rows: ["8 passives", "12 passives"].map((passives) => [
                    "Large Cluster Jewel",
                    "base",
                    `Minions deal 10% increased Damage · ${passives} · ilvl 84+`,
                    hour,
                    1,
                    { divine: { median: 2 } },
                ]),
            };
        }
        return { rows: [] };
    }) as unknown as TDatabase;

    await Promise.all([loadArbitrageMarket(db, "1", null), loadClusterRecipeMarket(db, null, 84)]);

    expect(spans).toContainEqual(
        expect.objectContaining({
            name: "arbitrage.vendor_recipes",
            attributes: { "arbitrage.game": "1" },
        }),
    );
    expect(spans).toContainEqual(
        expect.objectContaining({
            name: "market.exchange_prices",
            parent: "arbitrage.vendor_recipes",
        }),
    );
    expect(spans).toContainEqual(
        expect.objectContaining({
            name: "crafting.recipe_hourly_listings",
            parent: "arbitrage.cluster_recipes",
            attributes: { "db.rows": 2, "recipe.markets": expect.any(Number) },
        }),
    );
    expect(spans.filter(({ name }) => name === "crafting.recipe_exchange_rates")).toEqual([
        expect.objectContaining({ parent: "crafting.recipe_select_quotes" }),
    ]);
    expect(spans).toContainEqual(
        expect.objectContaining({
            name: "crafting.recipe_select_quotes",
            parent: "arbitrage.cluster_recipes",
            attributes: { "recipe.quotes": 0, "recipe.rate_hours": 1 },
        }),
    );
});
