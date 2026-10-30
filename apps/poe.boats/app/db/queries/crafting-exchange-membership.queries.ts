import { marketObservationRange } from "@poe-tools/market";
import { and, eq, lte } from "drizzle-orm";
import type { TDatabase } from "~/db/client";
import { tStashPoe1CurrencyMarket as currencyMarket } from "~/db/schema/stash.currency-market";

export async function loadCraftingExchangeMembership(db: TDatabase, league: string, at?: number) {
    const { latestHour } = marketObservationRange(at);
    // Each market keeps its earliest stored hour, so this reads no hourly rows.
    const rows = await db
        .select({ marketId: currencyMarket.marketId, firstHour: currencyMarket.firstHour })
        .from(currencyMarket)
        .where(
            and(
                eq(currencyMarket.realm, "pc"),
                eq(currencyMarket.league, league),
                lte(currencyMarket.firstHour, latestHour),
            ),
        )
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
