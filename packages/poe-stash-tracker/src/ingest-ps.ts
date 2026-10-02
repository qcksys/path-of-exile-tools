import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PublicStashChange } from "@poe-tools/api-client";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { createPoeClient, LEAGUE, REALM } from "#src/auth.ts";
import { type Db, openDb } from "#src/db.ts";
import { decodeIconAsset } from "#src/icon.ts";
import { itemKey } from "#src/item-key.ts";
import { extractListingPrice } from "#src/price.ts";
import { tIconBasemap, tListing, tStreamCursor } from "#src/schema.ts";
import { matches } from "#src/watchlist.ts";

const STREAM = "psapi";
const DEFAULT_PAGES = 3;
const PAGE_DELAY_MS = 0;

// When POE_INGEST_ALL=1, the watchlist is bypassed and every item in every
// matching-league stash is persisted. Useful for exploring raw stream data;
// do not mix with watchlist-filtered runs or the stash-diff pass will mark
// previously-tracked items as removed when they fall out of the filter.
const IGNORE_WATCHLIST = process.env.POE_INGEST_ALL === "1";

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

interface PageResult {
    nextCursor: string;
    stashCount: number;
    publicChanges: number;
    inserted: number;
    updated: number;
    removed: number;
    leagueCounts: Map<string, number>;
    leagueItemCounts: Map<string, number>;
}

async function applyStashChange(
    db: Db,
    change: PublicStashChange,
    now: Date,
): Promise<{ inserted: number; updated: number; removed: number }> {
    if (!change.public) {
        const removed = await db
            .update(tListing)
            .set({ removedAt: now })
            .where(and(eq(tListing.stashId, change.id), isNull(tListing.removedAt)))
            .returning({ itemId: tListing.itemId });
        return { inserted: 0, updated: 0, removed: removed.length };
    }
    if (!change.accountName) return { inserted: 0, updated: 0, removed: 0 };
    if (change.league && change.league !== LEAGUE) return { inserted: 0, updated: 0, removed: 0 };

    const accountName = change.accountName;
    const stashId = change.id;

    const existing = await db
        .select()
        .from(tListing)
        .where(
            and(
                eq(tListing.accountName, accountName),
                eq(tListing.stashId, stashId),
                isNull(tListing.removedAt),
            ),
        );
    const existingById = new Map(existing.map((e) => [e.itemId, e]));

    const currentIds = new Set<string>();
    let inserted = 0;
    let updated = 0;

    for (const item of change.items) {
        if (!item.id) continue;
        if (!IGNORE_WATCHLIST && !matches(item)) continue;

        currentIds.add(item.id);
        const price = extractListingPrice(item, change.stash);
        const iconAsset = decodeIconAsset(item.icon);
        const row = {
            accountName,
            stashId,
            itemId: item.id,
            league: change.league ?? LEAGUE,
            itemKey: itemKey(item, iconAsset),
            identified: item.identified,
            typeLine: item.typeLine,
            baseType: item.baseType,
            name: item.identified ? item.name : null,
            corrupted: item.corrupted ?? false,
            foilVariation: item.foilVariation ?? null,
            priceAmount: price?.amount ?? null,
            priceCurrency: price?.currency ?? null,
            iconAsset,
            rawItem: item,
            firstSeenAt: now,
            lastSeenAt: now,
            removedAt: null,
        };

        // Maintain icon-asset basemap from identified uniques. frameType=3 is
        // "unique"; item.name is the canonical market identity. Unique + icon
        // → name mapping lets us later label unidentified drops.
        if (item.identified && item.frameType === 3 && item.name && iconAsset) {
            await db
                .insert(tIconBasemap)
                .values({
                    iconAsset,
                    name: item.name,
                    baseType: item.baseType,
                    seenCount: 1,
                    firstSeenAt: now,
                    lastSeenAt: now,
                })
                .onConflictDoUpdate({
                    target: tIconBasemap.iconAsset,
                    set: {
                        seenCount: sql`${tIconBasemap.seenCount} + 1`,
                        lastSeenAt: now,
                    },
                });
        }

        const prior = existingById.get(item.id);
        if (prior) updated++;
        else inserted++;

        await db
            .insert(tListing)
            .values(row)
            .onConflictDoUpdate({
                target: [tListing.accountName, tListing.stashId, tListing.itemId],
                set: {
                    itemKey: row.itemKey,
                    typeLine: row.typeLine,
                    baseType: row.baseType,
                    name: row.name,
                    corrupted: row.corrupted,
                    foilVariation: row.foilVariation,
                    priceAmount: row.priceAmount,
                    priceCurrency: row.priceCurrency,
                    iconAsset: row.iconAsset,
                    rawItem: row.rawItem,
                    lastSeenAt: row.lastSeenAt,
                    removedAt: null,
                },
            });
    }

    const goneIds = existing.filter((e) => !currentIds.has(e.itemId)).map((e) => e.itemId);
    if (goneIds.length > 0) {
        await db
            .update(tListing)
            .set({ removedAt: now })
            .where(
                and(
                    eq(tListing.accountName, accountName),
                    eq(tListing.stashId, stashId),
                    inArray(tListing.itemId, goneIds),
                ),
            );
    }

    return { inserted, updated, removed: goneIds.length };
}

export async function ingestPage(
    db: Db,
    client: ReturnType<typeof createPoeClient>,
    cursor: string | undefined,
): Promise<PageResult> {
    const page = await client.public.stashTabs(
        cursor ? { realm: REALM, id: cursor } : { realm: REALM },
    );
    const now = new Date();

    let inserted = 0;
    let updated = 0;
    let removed = 0;
    let publicChanges = 0;
    const leagueCounts = new Map<string, number>();
    const leagueItemCounts = new Map<string, number>();

    for (const change of page.stashes) {
        if (change.public) {
            publicChanges++;
            const leagueName = change.league ?? "<missing>";
            leagueCounts.set(leagueName, (leagueCounts.get(leagueName) ?? 0) + 1);
            leagueItemCounts.set(
                leagueName,
                (leagueItemCounts.get(leagueName) ?? 0) + change.items.length,
            );
        }
        const res = await applyStashChange(db, change, now);
        inserted += res.inserted;
        updated += res.updated;
        removed += res.removed;
    }

    return {
        nextCursor: page.next_change_id,
        stashCount: page.stashes.length,
        publicChanges,
        inserted,
        updated,
        removed,
        leagueCounts,
        leagueItemCounts,
    };
}

async function main() {
    const pages = Math.max(1, Number(process.argv[2] ?? DEFAULT_PAGES));
    const cursorOverride = process.argv[3];
    const db = openDb();
    const client = createPoeClient();

    const [row] = await db
        .select()
        .from(tStreamCursor)
        .where(eq(tStreamCursor.streamName, STREAM))
        .limit(1);
    let cursor: string | undefined = cursorOverride ?? row?.cursor;

    const totalLeagueStashes = new Map<string, number>();
    const totalLeagueItems = new Map<string, number>();
    let totalChanges = 0;
    let totalPublic = 0;
    let totalStashes = 0;

    for (let i = 0; i < pages; i++) {
        if (i > 0) await sleep(PAGE_DELAY_MS);
        const res = await ingestPage(db, client, cursor);
        console.log(
            `page ${i + 1}/${pages}: stashes=${res.stashCount} (public=${res.publicChanges}) ins=${res.inserted} upd=${res.updated} rem=${res.removed} next=${res.nextCursor.slice(0, 12)}...`,
        );

        totalChanges += res.inserted + res.updated + res.removed;
        totalPublic += res.publicChanges;
        totalStashes += res.stashCount;
        for (const [lg, n] of res.leagueCounts) {
            totalLeagueStashes.set(lg, (totalLeagueStashes.get(lg) ?? 0) + n);
        }
        for (const [lg, n] of res.leagueItemCounts) {
            totalLeagueItems.set(lg, (totalLeagueItems.get(lg) ?? 0) + n);
        }

        const now = new Date();
        await db
            .insert(tStreamCursor)
            .values({ streamName: STREAM, cursor: res.nextCursor, updatedAt: now })
            .onConflictDoUpdate({
                target: tStreamCursor.streamName,
                set: { cursor: res.nextCursor, updatedAt: now },
            });
        cursor = res.nextCursor;
    }

    const tombstones = totalStashes - totalPublic;
    console.log(
        `summary: ${totalStashes} stashes (${totalPublic} public, ${tombstones} tombstones) across ${pages} page(s); ${totalChanges} listing changes${IGNORE_WATCHLIST ? " [watchlist bypassed]" : ""}`,
    );

    if (totalChanges === 0 && totalPublic > 0) {
        const targetStashes = totalLeagueStashes.get(LEAGUE) ?? 0;
        const targetItems = totalLeagueItems.get(LEAGUE) ?? 0;
        if (targetStashes === 0) {
            const top = [...totalLeagueStashes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
            console.warn(
                `no public stashes for POE_LEAGUE=${JSON.stringify(LEAGUE)} in this window. Top leagues seen:\n  ${top.map(([l, n]) => `${n.toString().padStart(5)}  ${l}`).join("\n  ")}`,
            );
        } else if (!IGNORE_WATCHLIST) {
            console.warn(
                `${targetStashes} ${LEAGUE} stashes (${targetItems} items) flowed through but none matched the watchlist. Either the items aren't active in this window, or the watchlist needs broader entries. Rerun with POE_INGEST_ALL=1 to persist everything.`,
            );
        }
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
