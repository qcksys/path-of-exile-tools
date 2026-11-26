import { type ExchangeSnapshot, exchangeSnapshotSchema } from "@poe-tools/market";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { TDatabase } from "~/db/client";
import { stashGame } from "~/db/helpers/stash-game";
import { tStashCurrencyHour } from "~/db/schema/stash.currency-hourly";
import { tStashCurrencyMarket } from "~/db/schema/stash.currency-market";
import { traceQuery, traceSpan } from "~/services/tracing.server";

type Side = number | null;
export type ExchangeHour = [number, Side, Side, Side, Side, Side, Side];
type Scope = { realm: string; league: string };
const snapshotIdentity = exchangeSnapshotSchema.pick({ realm: true, league: true, marketId: true });

export async function exchangeTradedUnits(
    db: TDatabase,
    scope: Scope,
    [fromHour, toHour]: [number, number],
    marketIds: string[],
) {
    const game = stashGame(scope.realm);
    const market = tStashCurrencyMarket[game];
    const hour = tStashCurrencyHour[game];
    const rows = await traceQuery(
        "market.exchange_traded_units",
        db
            .select({
                marketId: market.marketId,
                first: sql<number>`sum(${hour.volumeTradedFirst})`.mapWith(Number),
                second: sql<number>`sum(${hour.volumeTradedSecond})`.mapWith(Number),
            })
            .from(market)
            .innerJoin(hour, eq(hour.marketId, market.id))
            .where(
                and(
                    eq(market.realm, scope.realm),
                    eq(market.league, scope.league),
                    inArray(market.marketId, marketIds),
                    gte(hour.hour, fromHour),
                    lte(hour.hour, toHour),
                ),
            )
            .groupBy(market.marketId),
    );
    const units = new Map<string, number>();
    for (const row of rows) {
        const [first, second] = row.marketId.split("|");
        if (!first || !second) continue;
        units.set(first, (units.get(first) ?? 0) + row.first);
        units.set(second, (units.get(second) ?? 0) + row.second);
    }
    return units;
}

export function exchangeSnapshotGroups(
    db: TDatabase,
    scope: Scope,
    [fromHour, toHour]: [number, number],
    marketIds?: string[],
    label = fromHour === toHour ? "market.exchange" : "market.exchange_history",
) {
    const game = stashGame(scope.realm);
    const market = tStashCurrencyMarket[game];
    const hour = tStashCurrencyHour[game];
    return traceQuery(
        label,
        db
            .select({
                marketId: market.marketId,
                hours: sql`json_arrayagg(json_array(${hour.hour},
                    ${hour.volumeTradedFirst}, ${hour.volumeTradedSecond},
                    ${hour.lowestRatioFirst}, ${hour.lowestRatioSecond},
                    ${hour.highestRatioFirst}, ${hour.highestRatioSecond}))`.mapWith(
                    (value): ExchangeHour[] =>
                        typeof value === "string" ? JSON.parse(value) : (value as ExchangeHour[]),
                ),
            })
            .from(market)
            .innerJoin(hour, eq(hour.marketId, market.id))
            .where(
                and(
                    eq(market.realm, scope.realm),
                    eq(market.league, scope.league),
                    fromHour === toHour
                        ? eq(hour.hour, fromHour)
                        : and(gte(hour.hour, fromHour), lte(hour.hour, toHour)),
                    marketIds ? inArray(market.marketId, marketIds) : undefined,
                ),
            )
            .groupBy(market.marketId),
    );
}

export function expandExchangeHours(scope: Scope, marketId: string, hours: ExchangeHour[]) {
    const identity = snapshotIdentity.parse({ ...scope, marketId });
    const ids = marketId.split("|");
    const first = ids[0]!;
    const last = ids.at(-1)!;
    const sides = (a: Side, b: Side) => {
        if (a === null) return b === null ? null : { [last]: b };
        return b === null ? { [first]: a } : { [first]: a, [last]: b };
    };
    return hours.map((values): ExchangeSnapshot => {
        const [hour, va, vb, la, lb, ha, hb] = values;
        const snapshot = {
            ...identity,
            hour,
            volumeTraded: sides(va, vb),
            lowestRatio: sides(la, lb),
            highestRatio: sides(ha, hb),
        };
        if (
            values.length !== 7 ||
            !Number.isSafeInteger(hour) ||
            hour % 3600 !== 0 ||
            values.some((v) => v !== null && (!Number.isFinite(v) || v < 0))
        )
            return exchangeSnapshotSchema.parse(snapshot);
        return snapshot;
    });
}

export async function exchangeSnapshots(
    db: TDatabase,
    scope: Scope,
    window: [number, number],
    marketIds?: string[],
    label = window[0] === window[1] ? "market.exchange" : "market.exchange_history",
) {
    const groups = await exchangeSnapshotGroups(db, scope, window, marketIds, label);
    return traceSpan("market.exchange_parse_snapshots", (span) => {
        const snapshots = groups.flatMap(({ marketId, hours }) =>
            expandExchangeHours(scope, marketId, hours),
        );
        span.setAttributes({ "market.query": label, "market.snapshots": snapshots.length });
        return snapshots;
    });
}
