import { exchangeCurrencyId } from "@poe-tools/market";
import { drizzle } from "drizzle-orm/mysql-proxy";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import type { TDatabase } from "~/db/client";
import { marketFiltersSchema, poe2MarketFiltersSchema } from "~/schemas/market";
import { createTraceRecorder } from "./trace-recorder";

const { tracing, spans } = createTraceRecorder();
vi.doMock("cloudflare:workers", () => ({ env: { LOG_LEVEL: "silent" }, tracing }));
const { getMarketData, getPoe2MarketExchange } = await import("~/db/queries/market.queries");

const hour = 1_792_836_000;
const db = drizzle(async (query) => {
    if (query.includes("hour_coverage")) return { rows: [["Current", hour, hour]] };
    if (query.includes("currency_market")) {
        const market = [exchangeCurrencyId("chaos"), exchangeCurrencyId("divine")].join("|");
        return { rows: [[market, hour]] };
    }
    if (query.includes("variant_period"))
        return { rows: [["Ring", "Ring", 1, 0, "", "", 0, null, 1, hour, null, 1]] };
    if (query.includes("endedAt")) return { rows: [["Previous"]] };
    return { rows: [] };
}) as unknown as TDatabase;

beforeEach(() => {
    spans.length = 0;
});

it("traces item history and variant merging, rate conversion and response preparation", async () => {
    const filters = marketFiltersSchema.parse({ league: "Current", item: "Ring" });
    const result = await getMarketData(db, filters, "history");

    expect(result.variants).toMatchObject([{ itemKey: "Ring" }]);
    const children = spans.filter((span) => span.parent === "market.data");
    expect(children).toContainEqual({
        name: "market.ended_leagues",
        parent: "market.data",
        attributes: { "db.rows": 1 },
    });
    const names = children.map((span) => span.name);
    expect(names).toEqual(
        expect.arrayContaining([
            "market.merge_history",
            "market.merge_variants",
            "market.calculate_rates",
            "market.prepare_response",
        ]),
    );
    expect(names).not.toContain("market.aggregate_exchange_list");
});

it.each(["poe1", "poe2"])("traces exchange aggregation for %s market categories", async (game) => {
    const filters = { league: "Current", category: "currency" };
    if (game === "poe1") await getMarketData(db, marketFiltersSchema.parse(filters), "list");
    else await getPoe2MarketExchange(db, poe2MarketFiltersSchema.parse(filters));

    const parent = game === "poe1" ? "market.data" : "market.poe2_exchange";
    const children = spans.filter((span) => span.parent === parent).map((span) => span.name);
    expect(children).toContain("market.ended_leagues");
    expect(children).toContain("market.aggregate_exchange_list");
    expect(children).not.toContain("market.merge_history");
});
