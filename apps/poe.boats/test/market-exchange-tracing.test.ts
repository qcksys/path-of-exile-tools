import { exchangeCurrencyId, marketObservationRange } from "@poe-tools/market";
import { drizzle } from "drizzle-orm/mysql-proxy";
import { expect, it, vi } from "vite-plus/test";
import type { TDatabase } from "~/db/client";
import { createTraceRecorder } from "./trace-recorder";

const recorder = createTraceRecorder();
vi.mock("cloudflare:workers", () => ({ env: { LOG_LEVEL: "silent" }, tracing: recorder.tracing }));

it.each(["pc", "poe2"] as const)(
    "traces exchange item reads and calculations for %s",
    async (realm) => {
        const { getMarketExchangeItem } = await import("~/db/queries/market.queries");
        const hour = marketObservationRange().latestHour;
        const itemId = exchangeCurrencyId("divine")!;
        const anchor = exchangeCurrencyId(realm === "poe2" ? "exalted" : "chaos")!;
        const marketId = [itemId, anchor].join("|");
        const league = "Current";
        const db = drizzle(async (query) => {
            if (query.includes("_currency_hour`"))
                return { rows: [[marketId, [[hour, 1, 12, null, null, null, null]]]] };
            if (query.includes("_currency_market`")) return { rows: [[marketId, hour]] };
            return { rows: [] };
        }) as unknown as TDatabase;

        recorder.spans.length = 0;
        const result = await getMarketExchangeItem(db, { realm, league, itemId, days: "7" });

        expect(result.history.prices).toMatchObject([{ hour, price: 12 }]);
        expect(
            recorder.spans.find((span) => span.name === "market.exchange_item")?.attributes,
        ).toEqual({
            "market.realm": realm,
            "market.days": "7",
            "market.listed_markets": 1,
            "market.price_markets": 1,
            "market.history_markets": 1,
            "market.history_cache": "bypass",
            "market.recent_snapshots": 1,
            "market.daily_rows": 0,
            "market.anchor_cache": "bypass",
            "market.price_cache": "bypass",
            "market.price_input_cached_markets": 0,
            "market.price_input_read_markets": 1,
        });
        const phases = recorder.spans.filter((span) => span.parent === "market.exchange_item");
        expect(phases.map((span) => span.name)).toEqual(
            expect.arrayContaining([
                "market.exchange_recent",
                "market.exchange_daily",
                "market.exchange_price_rows",
                "market.exchange_select_history_pairs",
                "market.exchange_history",
                "market.exchange_build_history",
            ]),
        );
        expect(
            phases.find((span) => span.name === "market.exchange_build_history")?.attributes,
        ).toEqual({ "market.snapshots": 1, "market.price_points": 1, "market.pairs": 1 });
        expect(
            phases
                .filter((span) => span.name === "market.exchange_parse_snapshots")
                .map((span) => span.attributes),
        ).toEqual([{ "market.query": "market.exchange_history", "market.snapshots": 1 }]);
    },
);
