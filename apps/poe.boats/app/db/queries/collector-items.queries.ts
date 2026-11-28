import { collectorMarketKey } from "@poe-tools/market/collector-items";
import { and, between, eq, inArray } from "drizzle-orm";
import type { TDatabase } from "~/db/client";
import { tStashPoe1UniqueHourly as market } from "~/db/schema/stash.unique-hourly";
import { traceQuery } from "~/services/tracing.server";

export function findCollectorHours(db: TDatabase, assets: string[], latestHour: number) {
    return traceQuery(
        "collectors.market_hours",
        db
            .select({
                asset: market.signatureValue,
                hour: market.hour,
                prices: market.prices,
                likelySales: market.likelySales,
            })
            .from(market)
            .where(
                and(
                    eq(market.realm, "pc"),
                    eq(market.league, "Standard"),
                    eq(market.tab, "merchant"),
                    eq(market.signatureKind, "collector-art"),
                    inArray(
                        market.itemKey,
                        assets.flatMap((asset) => [
                            collectorMarketKey(asset, true),
                            collectorMarketKey(asset, false),
                        ]),
                    ),
                    between(market.hour, latestHour - (30 * 24 - 1) * 3600, latestHour),
                ),
            ),
    );
}
