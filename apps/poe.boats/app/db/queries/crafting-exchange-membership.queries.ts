import { marketObservationRange } from "@poe-tools/market";
import { and, eq, sql } from "drizzle-orm";
import type { TDatabase } from "~/db/client";
import { tStashCurrencyHourly as currencyHourly } from "~/db/schema/stash.currency-hourly";

export async function loadCraftingExchangeMembership(db: TDatabase, league: string, at?: number) {
    const { latestHour } = marketObservationRange(at);
    const rows = await db
        .select({
            marketId: currencyHourly.marketId,
            firstHour: sql<number>`min(${currencyHourly.hour})`,
        })
        .from(currencyHourly, { forceIndex: "PRIMARY" })
        .where(and(eq(currencyHourly.realm, "pc"), eq(currencyHourly.league, league)))
        .groupBy(currencyHourly.realm, currencyHourly.league, currencyHourly.marketId)
        .having(sql`min(${currencyHourly.hour}) <= ${latestHour}`)
        .limit(5001);
    if (rows.length > 5000) return null;
    const ids = new Map<string, number>();
    for (const { marketId, firstHour } of rows) {
        const parts = marketId.split("|");
        if (parts.length === 2)
            for (const id of parts)
                ids.set(id, Math.min(ids.get(id) ?? Infinity, Number(firstHour)));
    }
    return ids;
}

export function exchangeMembershipAt(membership: Map<string, number> | null, at?: number) {
    if (!membership) return null;
    const { latestHour } = marketObservationRange(at);
    return new Set(
        [...membership].filter(([, firstHour]) => firstHour <= latestHour).map(([id]) => id),
    );
}

export async function knownCraftingExchangeItems(db: TDatabase, league: string, at?: number) {
    return exchangeMembershipAt(await loadCraftingExchangeMembership(db, league, at), at);
}
