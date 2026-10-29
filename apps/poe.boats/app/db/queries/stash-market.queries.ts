import { createHash } from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import type { TDatabase } from "~/db/client.ts";
import type { StashGame } from "~/db/helpers/stash-game";
import {
    STASH_MARKET_IDENTITY,
    type TStashUniqueHourlyI,
    tStashMarket,
    tStashMarketHour,
} from "~/db/schema/stash.unique-hourly";

/** A stash market hour with every identity axis set. */
function withMarketDefaults(row: TStashUniqueHourlyI) {
    return {
        ...row,
        corrupted: row.corrupted ?? false,
        foilVariation: row.foilVariation ?? -1,
        links: row.links ?? 0,
        tab: row.tab ?? "",
        signatureKind: row.signatureKind ?? "",
        signatureValue: row.signatureValue ?? "",
        iconAsset: row.iconAsset ?? null,
        name: row.name ?? null,
        signatureData: row.signatureData ?? null,
    };
}
type StashMarketRow = ReturnType<typeof withMarketDefaults>;

export function stashMarketIdentityHash(row: StashMarketRow) {
    const identity = STASH_MARKET_IDENTITY.map((column) => {
        const value = row[column];
        return typeof value === "boolean" ? Number(value) : value;
    });
    return createHash("md5").update(JSON.stringify(identity)).digest("hex");
}

/** JSON with object keys sorted, since MySQL reorders the keys of the JSON it stores. */
function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (value && typeof value === "object")
        return `{${Object.keys(value)
            .sort()
            .map(
                (key) =>
                    `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
            )
            .join(",")}}`;
    return JSON.stringify(value ?? null);
}

/**
 * Stores each row's market, adding new markets and refreshing a market's description only when it
 * changed, then returns each market's ID by identity hash. Writing only those rows keeps
 * hour-by-hour deliveries from rewriting, and spending auto-increment IDs on, existing markets.
 */
async function storeStashMarkets(db: TDatabase, game: StashGame, rows: StashMarketRow[]) {
    const table = tStashMarket[game];
    const byHash = new Map(rows.map((row) => [stashMarketIdentityHash(row), row]));
    const read = () =>
        db
            .select({
                id: table.id,
                identityHash: table.identityHash,
                iconAsset: table.iconAsset,
                name: table.name,
                baseType: table.baseType,
                frameType: table.frameType,
                signatureData: table.signatureData,
            })
            .from(table)
            .where(inArray(table.identityHash, [...byHash.keys()]));
    const stored = new Map((await read()).map((market) => [market.identityHash, market]));
    const writes = [...byHash].filter(([hash, row]) => {
        const market = stored.get(hash);
        return (
            !market ||
            market.iconAsset !== row.iconAsset ||
            market.name !== row.name ||
            market.baseType !== row.baseType ||
            market.frameType !== row.frameType ||
            canonicalJson(market.signatureData) !== canonicalJson(row.signatureData)
        );
    });
    if (writes.length) {
        await db
            .insert(table)
            .values(
                writes.map(([identityHash, row]) => ({
                    identityHash,
                    realm: row.realm,
                    league: row.league,
                    itemKey: row.itemKey,
                    identified: row.identified,
                    corrupted: row.corrupted,
                    foilVariation: row.foilVariation,
                    links: row.links,
                    tab: row.tab,
                    signatureKind: row.signatureKind,
                    signatureValue: row.signatureValue,
                    iconAsset: row.iconAsset,
                    name: row.name,
                    baseType: row.baseType,
                    frameType: row.frameType,
                    signatureData: row.signatureData,
                })),
            )
            .onDuplicateKeyUpdate({
                set: {
                    iconAsset: sql`values(${table.iconAsset})`,
                    name: sql`values(${table.name})`,
                    baseType: sql`values(${table.baseType})`,
                    frameType: sql`values(${table.frameType})`,
                    signatureData: sql`values(${table.signatureData})`,
                },
            });
        if (writes.some(([hash]) => !stored.has(hash)))
            for (const market of await read()) stored.set(market.identityHash, market);
    }
    return new Map([...stored].map(([hash, market]) => [hash, market.id]));
}

/** Stores market hours of one game, without refreshing the rollups that read them. */
export async function writeStashUniqueHourly(
    db: TDatabase,
    game: StashGame,
    rows: TStashUniqueHourlyI[],
) {
    if (!rows.length) return;
    const normalized = rows.map(withMarketDefaults);
    const ids = await storeStashMarkets(db, game, normalized);
    const table = tStashMarketHour[game];
    await db
        .insert(table)
        .values(
            normalized.map((row) => ({
                hour: row.hour,
                marketId: ids.get(stashMarketIdentityHash(row))!,
                listingCount: row.listingCount,
                uniqueSellers: row.uniqueSellers,
                removedCount: row.removedCount,
                likelySales: row.likelySales,
                relistedCount: row.relistedCount,
                pendingCount: row.pendingCount,
                salesPrices: row.salesPrices,
                prices: row.prices,
                firstSeenAt: row.firstSeenAt,
                lastSeenAt: row.lastSeenAt,
            })),
        )
        .onDuplicateKeyUpdate({
            set: {
                listingCount: sql`values(${table.listingCount})`,
                uniqueSellers: sql`values(${table.uniqueSellers})`,
                removedCount: sql`values(${table.removedCount})`,
                likelySales: sql`values(${table.likelySales})`,
                relistedCount: sql`values(${table.relistedCount})`,
                pendingCount: sql`values(${table.pendingCount})`,
                salesPrices: sql`values(${table.salesPrices})`,
                prices: sql`values(${table.prices})`,
                firstSeenAt: sql`values(${table.firstSeenAt})`,
                lastSeenAt: sql`values(${table.lastSeenAt})`,
            },
        });
}
