import { and, eq, inArray, sql } from "drizzle-orm";
import type { TDatabase } from "~/db/client.ts";
import type { StashGame } from "~/db/helpers/stash-game";
import {
    STASH_CURRENCY_MAPS,
    type TStashCurrencyHourlyI,
    tStashCurrencyHour,
} from "~/db/schema/stash.currency-hourly";
import {
    type TStashCurrencyMarketI,
    tStashCurrencyMarket,
} from "~/db/schema/stash.currency-market";
import { upsertStashCurrencyMarkets } from "./stash-rollups.queries";

/** Each market's earliest hour in the rows. */
function earliestMarkets(rows: TStashCurrencyHourlyI[]) {
    const markets = new Map<string, TStashCurrencyMarketI>();
    for (const row of rows) {
        const key = JSON.stringify([row.realm, row.league, row.marketId]);
        const market = markets.get(key);
        if (!market || row.hour < market.firstHour)
            markets.set(key, {
                realm: row.realm,
                league: row.league,
                marketId: row.marketId,
                firstHour: row.hour,
            });
    }
    return markets;
}

/** Each map's value for the market ID's first and second item; a missing value stores 0. */
function sides(row: TStashCurrencyHourlyI) {
    const [first = "", second = ""] = row.marketId.split("|");
    return Object.fromEntries(
        STASH_CURRENCY_MAPS.flatMap((name) => [
            [`${name}First`, row[name]?.[first] ?? 0],
            [`${name}Second`, row[name]?.[second] ?? 0],
        ]),
    ) as Record<`${(typeof STASH_CURRENCY_MAPS)[number]}${"First" | "Second"}`, number>;
}

/**
 * Stores exchange market hours of one game: records each market (lowering its first hour when an
 * older hour arrives), then writes the hours under the markets' IDs. Rollups are not refreshed.
 * `run` wraps each statement, so a caller can retry just the statement that failed.
 */
export async function writeStashCurrencyHourly(
    db: TDatabase,
    game: StashGame,
    rows: TStashCurrencyHourlyI[],
    run: <T>(statement: () => PromiseLike<T>) => PromiseLike<T> = (statement) => statement(),
) {
    if (!rows.length) return;
    const markets = earliestMarkets(rows);
    await run(() => upsertStashCurrencyMarkets(db, game, [...markets.values()]));
    const market = tStashCurrencyMarket[game];
    const ids = new Map<string, number>();
    for (const group of Map.groupBy(markets.values(), ({ realm, league }) =>
        JSON.stringify([realm, league]),
    ).values()) {
        const { realm, league } = group[0]!;
        const stored = await run(() =>
            db
                .select({ id: market.id, marketId: market.marketId })
                .from(market)
                .where(
                    and(
                        eq(market.realm, realm),
                        eq(market.league, league),
                        inArray(
                            market.marketId,
                            group.map((entry) => entry.marketId),
                        ),
                    ),
                ),
        );
        for (const { id, marketId } of stored)
            ids.set(JSON.stringify([realm, league, marketId]), id);
    }
    const table = tStashCurrencyHour[game];
    const update = Object.fromEntries(
        STASH_CURRENCY_MAPS.flatMap((name) =>
            (["First", "Second"] as const).map((side) => {
                const column = table[`${name}${side}`];
                return [`${name}${side}`, sql`values(${column})`];
            }),
        ),
    );
    await run(() =>
        db
            .insert(table)
            .values(
                rows.map((row) => ({
                    hour: row.hour,
                    marketId: ids.get(JSON.stringify([row.realm, row.league, row.marketId]))!,
                    ...sides(row),
                })),
            )
            .onDuplicateKeyUpdate({ set: update }),
    );
}
