import type { DuckDBConnection } from "@duckdb/node-api";
import type { PoeApiClient, PublicStashChange } from "@poe-tools/api-client";
import { REALM } from "#src/shared/auth.ts";
import { learnBasemap } from "#src/shared/basemap.ts";
import { shouldCapture } from "#src/shared/capture.ts";
import { getCursor, setCursor } from "#src/shared/cursor.ts";
import { withTransaction } from "#src/shared/db.ts";
import { decodeIconAsset } from "#src/shared/icon.ts";
import { itemKey } from "#src/shared/item-key.ts";
import { extractModSignature } from "#src/shared/mod-extractors/index.ts";
import { extractListingPrice } from "#src/shared/price.ts";

const STREAM = "psapi";
const PAGE_DELAY_MS = 1200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface PsIngestResult {
    pages: number;
    stashes: number;
    publicStashes: number;
    inserted: number;
    updated: number;
    removed: number;
    leagues: Map<string, { stashes: number; items: number }>;
    finalCursor: string;
}

interface ListingRow {
    accountName: string;
    stashId: string;
    itemId: string;
    league: string;
    itemKey: string;
    iconAsset: string | null;
    identified: boolean;
    frameType: number;
    typeLine: string;
    baseType: string;
    name: string | null;
    rarity: string | null;
    corrupted: boolean;
    foilVariation: number | null;
    priceAmount: number | null;
    priceCurrency: string | null;
    stackSize: number | null;
    modSignature: string | null;
    rawItem: string;
}

async function applyStashChange(
    conn: DuckDBConnection,
    change: PublicStashChange,
): Promise<{ inserted: number; updated: number; removed: number }> {
    if (!change.public) {
        const removed = await conn.runAndReadAll(
            `UPDATE ps_listing SET removed_at = current_timestamp
             WHERE stash_id = $1 AND removed_at IS NULL RETURNING item_id`,
            [change.id],
        );
        return { inserted: 0, updated: 0, removed: removed.getRowObjects().length };
    }
    if (!change.accountName || !change.league) {
        return { inserted: 0, updated: 0, removed: 0 };
    }
    const accountName = change.accountName;
    const stashId = change.id;
    const league = change.league;

    const existing = await conn
        .runAndReadAll(
            `SELECT item_id AS "itemId" FROM ps_listing
             WHERE account_name = $1 AND stash_id = $2 AND removed_at IS NULL`,
            [accountName, stashId],
        )
        .then((r) => r.getRowObjects() as Array<{ itemId: string }>);
    const existingIds = new Set(existing.map((r) => r.itemId));

    const rows: ListingRow[] = [];
    const currentIds = new Set<string>();

    for (const item of change.items) {
        if (!item.id) continue;
        if (!shouldCapture(item)) continue;

        currentIds.add(item.id);
        const iconAsset = decodeIconAsset(item.icon);
        const price = extractListingPrice(item, change.stash);
        const signature = extractModSignature(item);

        rows.push({
            accountName,
            stashId,
            itemId: item.id,
            league,
            itemKey: itemKey(item, iconAsset),
            iconAsset,
            identified: item.identified,
            frameType: item.frameType,
            typeLine: item.typeLine,
            baseType: item.baseType,
            name: item.identified ? item.name : null,
            rarity: item.rarity ?? null,
            corrupted: item.corrupted ?? false,
            foilVariation: item.foilVariation ?? null,
            priceAmount: price?.amount ?? null,
            priceCurrency: price?.currency ?? null,
            stackSize: item.stackSize ?? null,
            modSignature: signature ? JSON.stringify(signature) : null,
            rawItem: JSON.stringify(item),
        });

        await learnBasemap(conn, item, iconAsset);
    }

    let inserted = 0;
    let updated = 0;

    for (const row of rows) {
        if (existingIds.has(row.itemId)) updated++;
        else inserted++;

        await conn.run(
            `INSERT INTO ps_listing (
                account_name, stash_id, item_id, league, item_key, icon_asset,
                identified, frame_type, type_line, base_type, name, rarity,
                corrupted, foil_variation, price_amount, price_currency, stack_size,
                mod_signature, raw_item, first_seen_at, last_seen_at, removed_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                $13, $14, $15, $16, $17, $18, $19, current_timestamp, current_timestamp, NULL
            )
            ON CONFLICT (account_name, stash_id, item_id) DO UPDATE SET
                league = excluded.league,
                item_key = excluded.item_key,
                icon_asset = excluded.icon_asset,
                identified = excluded.identified,
                frame_type = excluded.frame_type,
                type_line = excluded.type_line,
                base_type = excluded.base_type,
                name = excluded.name,
                rarity = excluded.rarity,
                corrupted = excluded.corrupted,
                foil_variation = excluded.foil_variation,
                price_amount = excluded.price_amount,
                price_currency = excluded.price_currency,
                stack_size = excluded.stack_size,
                mod_signature = excluded.mod_signature,
                raw_item = excluded.raw_item,
                last_seen_at = now(),
                removed_at = NULL`,
            [
                row.accountName,
                row.stashId,
                row.itemId,
                row.league,
                row.itemKey,
                row.iconAsset,
                row.identified,
                row.frameType,
                row.typeLine,
                row.baseType,
                row.name,
                row.rarity,
                row.corrupted,
                row.foilVariation,
                row.priceAmount,
                row.priceCurrency,
                row.stackSize,
                row.modSignature,
                row.rawItem,
            ],
        );
    }

    const goneIds = [...existingIds].filter((id) => !currentIds.has(id));
    if (goneIds.length > 0) {
        // DuckDB's parameter binder doesn't accept arrays for IN; build a literal list.
        const placeholders = goneIds.map((_, i) => `$${i + 3}`).join(",");
        await conn.run(
            `UPDATE ps_listing SET removed_at = current_timestamp
             WHERE account_name = $1 AND stash_id = $2 AND item_id IN (${placeholders})`,
            [accountName, stashId, ...goneIds],
        );
    }

    await conn.run(
        `INSERT OR REPLACE INTO ps_listing_hour
         SELECT * EXCLUDE (removed_at, raw_item),
                epoch(date_trunc('hour', last_seen_at))::BIGINT AS observed_hour
         FROM ps_listing
         WHERE account_name = $1 AND stash_id = $2 AND removed_at IS NULL`,
        [accountName, stashId],
    );

    return { inserted, updated, removed: goneIds.length };
}

export async function ingestPs(
    conn: DuckDBConnection,
    client: PoeApiClient,
    opts: { pages: number; cursor?: string },
): Promise<PsIngestResult> {
    const result: PsIngestResult = {
        pages: 0,
        stashes: 0,
        publicStashes: 0,
        inserted: 0,
        updated: 0,
        removed: 0,
        leagues: new Map(),
        finalCursor: opts.cursor ?? "",
    };

    let cursor: string | undefined = opts.cursor ?? (await getCursor(conn, STREAM));

    for (let i = 0; i < opts.pages; i++) {
        if (i > 0) await sleep(PAGE_DELAY_MS);
        const requestCursor = cursor;
        const page = await client.public.stashTabs(
            requestCursor ? { realm: REALM, id: requestCursor } : { realm: REALM },
        );

        await withTransaction(conn, async () => {
            for (const change of page.stashes) {
                result.stashes++;
                if (change.public) {
                    result.publicStashes++;
                    const lg = change.league ?? "<missing>";
                    const acc = result.leagues.get(lg) ?? { stashes: 0, items: 0 };
                    acc.stashes++;
                    acc.items += change.items.length;
                    result.leagues.set(lg, acc);
                }
                const r = await applyStashChange(conn, change);
                result.inserted += r.inserted;
                result.updated += r.updated;
                result.removed += r.removed;
            }
            await setCursor(conn, STREAM, page.next_change_id);
        });

        cursor = page.next_change_id;
        result.pages++;
        result.finalCursor = cursor;

        console.log(
            `page ${i + 1}/${opts.pages}: stashes=${page.stashes.length} ` +
                `ins=${result.inserted} upd=${result.updated} rem=${result.removed} ` +
                `next=${cursor.slice(0, 12)}…`,
        );

        // Caught up: API echoed the cursor we sent. No new pages exist;
        // refetching would burn rate-limit budget for identical content.
        if (requestCursor !== undefined && page.next_change_id === requestCursor) {
            console.log("psapi: caught up; stopping early");
            break;
        }
    }

    return result;
}
