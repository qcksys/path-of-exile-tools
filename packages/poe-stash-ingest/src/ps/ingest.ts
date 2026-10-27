import type { DuckDBConnection } from "@duckdb/node-api";
import type { PoeApiClient, PublicStashChange } from "@poe-tools/api-client";
import { archivePage } from "#src/ps/capture-archive.ts";
import { recordCheckpoint } from "#src/ps/checkpoints.ts";
import { defaultCraftingCapture } from "#src/ps/crafting-capture.ts";
import {
    captureEquipmentPage,
    defaultEquipmentClassifier,
    type EquipmentClassifier,
} from "#src/ps/equipment.ts";
import type {
    EquipmentDiagnosticFixture,
    EquipmentDiagnostics,
} from "#src/ps/equipment-diagnostics.ts";
import { params, stashRounds } from "#src/ps/rounds.ts";
import { evaluateSales, recordRemovals } from "#src/ps/sales.ts";
import { REALM } from "#src/shared/auth.ts";
import { learnBasemap } from "#src/shared/basemap.ts";
import { shouldCapture } from "#src/shared/capture.ts";
import { getCursor, setCursor } from "#src/shared/cursor.ts";
import { queryAll, withTransaction } from "#src/shared/db.ts";
import { decodeIconAsset } from "#src/shared/icon.ts";
import { itemKey, itemLinks } from "#src/shared/item-key.ts";
import { extractModSignature, signatureValue } from "#src/shared/mod-extractors/index.ts";
import { extractListingPrice } from "#src/shared/price.ts";
import { configureSource } from "#src/shared/source.ts";

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
    equipmentObserved: number;
    leagues: Map<string, { stashes: number; items: number }>;
    finalCursor: string;
    caughtUp: boolean;
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
    links: number;
    priceAmount: number | null;
    priceCurrency: string | null;
    stackSize: number | null;
    modSignature: string | null;
    signatureValue: string;
    rawItem: string;
}

/** `ListingRow` JSON from `json_each`, as `ps_listing` columns. */
const LISTING_VALUES = `
    value->>'accountName' AS account_name,
    value->>'stashId' AS stash_id,
    value->>'itemId' AS item_id,
    value->>'league' AS league,
    value->>'itemKey' AS item_key,
    value->>'iconAsset' AS icon_asset,
    (value->>'identified')::BOOLEAN AS identified,
    (value->>'frameType')::INTEGER AS frame_type,
    value->>'typeLine' AS type_line,
    value->>'baseType' AS base_type,
    value->>'name' AS name,
    value->>'rarity' AS rarity,
    (value->>'corrupted')::BOOLEAN AS corrupted,
    (value->>'foilVariation')::INTEGER AS foil_variation,
    (value->>'links')::INTEGER AS links,
    (value->>'priceAmount')::DOUBLE AS price_amount,
    value->>'priceCurrency' AS price_currency,
    (value->>'stackSize')::INTEGER AS stack_size,
    (value->>'modSignature')::JSON AS mod_signature,
    (value->>'rawItem')::JSON AS raw_item,
    value->>'signatureValue' AS signature_value`;

function listingRows(change: PublicStashChange, accountName: string, league: string) {
    const rows: ListingRow[] = [];
    for (const item of change.items) {
        if (!item.id || !shouldCapture(item)) continue;
        const iconAsset = decodeIconAsset(item.icon);
        const price = extractListingPrice(item, change.stash);
        const signature = extractModSignature(item);
        rows.push({
            accountName,
            stashId: change.id,
            itemId: item.id,
            league,
            itemKey: itemKey(item, iconAsset),
            iconAsset,
            identified: item.identified,
            // Unknown legacy frame; preserve the source frameTypeId in rawItem.
            frameType: item.frameType ?? -1,
            typeLine: item.typeLine,
            baseType: item.baseType,
            name: item.identified ? item.name : null,
            rarity: item.rarity ?? null,
            corrupted: item.corrupted ?? false,
            foilVariation: item.foilVariation ?? null,
            links: itemLinks(item),
            priceAmount: price?.amount ?? null,
            priceCurrency: price?.currency ?? null,
            stackSize: item.stackSize ?? null,
            modSignature: signature ? JSON.stringify(signature) : null,
            signatureValue: signatureValue(signature),
            rawItem: JSON.stringify(item),
        });
    }
    return rows;
}

/**
 * Applies a page's stash changes with a fixed number of set-based statements. DuckDB pays a few
 * milliseconds per statement, and `ON CONFLICT`/`INSERT OR REPLACE` scan the whole table, so rows
 * are looked up once through the stash index, then updated by row ID or plainly inserted.
 */
export async function applyStashChanges(
    conn: DuckDBConnection,
    changes: readonly PublicStashChange[],
): Promise<{ inserted: number; updated: number; removed: number }> {
    const totals = { inserted: 0, updated: 0, removed: 0 };
    for (const round of stashRounds(changes)) {
        const result = await applyRound(conn, round);
        totals.inserted += result.inserted;
        totals.updated += result.updated;
        totals.removed += result.removed;
    }
    return totals;
}

async function applyRound(conn: DuckDBConnection, changes: readonly PublicStashChange[]) {
    const stashIds = changes.map((change) => change.id);
    const known = await queryAll<{
        rowId: string;
        accountName: string;
        stashId: string;
        itemId: string;
        active: boolean;
    }>(
        conn,
        `SELECT rowid::VARCHAR AS "rowId", account_name AS "accountName", stash_id AS "stashId",
            item_id AS "itemId", removed_at IS NULL AS active
        FROM ps_listing WHERE stash_id IN (${params(stashIds)})`,
        stashIds,
    );
    const byStash = Map.groupBy(known, (row) => row.stashId);
    const result = { inserted: 0, updated: 0, removed: 0 };
    const removedRows: string[] = [];
    const removals: { stashId: string; withdrawn: boolean }[] = [];
    const updates: (ListingRow & { rowId: string })[] = [];
    const inserts: ListingRow[] = [];
    const listed: { stashId: string; accountName: string }[] = [];
    for (const change of changes) {
        const rows = byStash.get(change.id) ?? [];
        if (!change.public) {
            const gone = rows.filter((row) => row.active);
            removedRows.push(...gone.map((row) => row.rowId));
            removals.push({ stashId: change.id, withdrawn: true });
            result.removed += gone.length;
            continue;
        }
        if (!change.accountName || !change.league) continue;
        const accountName = change.accountName;
        const owned = new Map(
            rows.filter((row) => row.accountName === accountName).map((row) => [row.itemId, row]),
        );
        const current = new Set(change.items.flatMap((item) => (item.id ? [item.id] : [])));
        for (const row of listingRows(change, accountName, change.league)) {
            const existing = owned.get(row.itemId);
            if (existing?.active) result.updated++;
            else result.inserted++;
            if (existing) updates.push({ ...row, rowId: existing.rowId });
            else inserts.push(row);
        }
        const gone = [...owned.values()].filter((row) => row.active && !current.has(row.itemId));
        if (gone.length) {
            removedRows.push(...gone.map((row) => row.rowId));
            removals.push({ stashId: change.id, withdrawn: false });
            result.removed += gone.length;
        }
        listed.push({ stashId: change.id, accountName });
    }

    await learnBasemap(conn, [...updates, ...inserts]);
    // Removals first: updates may rewrite their rows under new row IDs.
    if (removedRows.length) {
        await conn.run(
            `UPDATE ps_listing SET removed_at = current_timestamp
            WHERE rowid IN (SELECT value::BIGINT FROM json_each($1::JSON))`,
            [JSON.stringify(removedRows)],
        );
    }
    if (removals.length) await recordRemovals(conn, removals);
    if (updates.length) {
        await conn.run(
            `UPDATE ps_listing SET
                league = v.league,
                item_key = v.item_key,
                icon_asset = v.icon_asset,
                identified = v.identified,
                frame_type = v.frame_type,
                type_line = v.type_line,
                base_type = v.base_type,
                name = v.name,
                rarity = v.rarity,
                corrupted = v.corrupted,
                foil_variation = v.foil_variation,
                links = v.links,
                price_amount = v.price_amount,
                price_currency = v.price_currency,
                stack_size = v.stack_size,
                mod_signature = v.mod_signature,
                signature_value = v.signature_value,
                raw_item = v.raw_item,
                last_seen_at = current_timestamp,
                removed_at = NULL
            FROM (
                SELECT (value->>'rowId')::BIGINT AS row_id, ${LISTING_VALUES} FROM json_each($1::JSON)
            ) v
            WHERE ps_listing.rowid = v.row_id`,
            [JSON.stringify(updates)],
        );
    }
    if (inserts.length) {
        await conn.run(
            `INSERT INTO ps_listing BY NAME
            SELECT ${LISTING_VALUES}, current_timestamp AS first_seen_at,
                current_timestamp AS last_seen_at
            FROM json_each($1::JSON)`,
            [JSON.stringify(inserts)],
        );
    }
    if (!listed.length) return result;

    // Active listings were all seen now, so refresh their observations within the current hour
    // instead of merging: zonemaps confine the hour to the newest row groups. Earlier observations
    // of items removed during this hour stay. Existing rows are updated in place, because DuckDB
    // rejects reinserting a deleted key whose index entry was loaded from disk.
    const listedIds = listed.map((stash) => stash.stashId);
    await conn.run(
        `CREATE OR REPLACE TEMP TABLE page_listing AS
        WITH stash AS MATERIALIZED (
            SELECT * FROM ps_listing WHERE stash_id IN (${params(listedIds, 2)})
        )
        SELECT stash.* EXCLUDE (raw_item, removed_at) FROM stash
        JOIN json_each($1::JSON) j ON stash.stash_id = (j.value->>'stashId')
            AND stash.account_name = (j.value->>'accountName')
        WHERE stash.removed_at IS NULL`,
        [JSON.stringify(listed), ...listedIds],
    );
    const sameRow = `h.observed_hour = epoch(date_trunc('hour', current_timestamp))::BIGINT
        AND h.stash_id = l.stash_id AND h.account_name = l.account_name AND h.item_id = l.item_id`;
    await conn.run(
        `UPDATE ps_listing_hour h SET
            league = l.league,
            item_key = l.item_key,
            icon_asset = l.icon_asset,
            identified = l.identified,
            frame_type = l.frame_type,
            type_line = l.type_line,
            base_type = l.base_type,
            name = l.name,
            rarity = l.rarity,
            corrupted = l.corrupted,
            foil_variation = l.foil_variation,
            links = l.links,
            price_amount = l.price_amount,
            price_currency = l.price_currency,
            stack_size = l.stack_size,
            mod_signature = l.mod_signature,
            signature_value = l.signature_value,
            first_seen_at = l.first_seen_at,
            last_seen_at = l.last_seen_at
        FROM page_listing l WHERE ${sameRow}`,
    );
    await conn.run(
        `INSERT INTO ps_listing_hour BY NAME
        SELECT *, epoch(date_trunc('hour', last_seen_at))::BIGINT AS observed_hour
        FROM page_listing l
        WHERE NOT EXISTS (SELECT 1 FROM ps_listing_hour h WHERE ${sameRow})`,
    );
    return result;
}

export async function ingestPs(
    conn: DuckDBConnection,
    client: PoeApiClient,
    opts: {
        onProgress?: (result: PsIngestResult) => Promise<void>;
        pages: number;
        cursor?: string;
        league?: string | null;
        equipment?: EquipmentClassifier;
        equipmentDiagnostics?: EquipmentDiagnostics;
        observedAt?: Date;
    },
): Promise<PsIngestResult> {
    if (!Number.isSafeInteger(opts.pages) || opts.pages < 1)
        throw new Error("pages must be a positive integer");
    if (REALM === "poe2")
        throw new Error("PoE 2 equipment uses manual prices; public-stash capture is unavailable.");
    const realm = REALM ?? "pc";
    await configureSource(conn, REALM ?? "pc", opts.league ?? null);
    const equipment = opts.equipment ?? (await defaultEquipmentClassifier());
    const accepts = await defaultCraftingCapture(equipment.manifest);
    const result: PsIngestResult = {
        pages: 0,
        stashes: 0,
        publicStashes: 0,
        inserted: 0,
        updated: 0,
        removed: 0,
        equipmentObserved: 0,
        leagues: new Map(),
        finalCursor: opts.cursor ?? "",
        caughtUp: false,
    };

    let cursor: string | undefined = opts.cursor ?? (await getCursor(conn, STREAM));

    for (let i = 0; i < opts.pages; i++) {
        if (i > 0) {
            // Release the committed page's indexes before loading another page. On a large
            // database each checkpoint rewrites gigabytes of index, so with memory to spare
            // PS_CHECKPOINT_THRESHOLD leaves checkpoints to DuckDB once the WAL reaches it.
            if (!process.env.PS_CHECKPOINT_THRESHOLD) await conn.run("CHECKPOINT");
            await sleep(PAGE_DELAY_MS);
        }
        const requestCursor = cursor;
        const page = await client.public.stashTabs(
            requestCursor ? { realm: REALM, id: requestCursor } : { realm: REALM },
        );
        const captureId = await archivePage(
            conn,
            page,
            {
                realm,
                league: opts.league ?? "all",
                cursor: requestCursor,
                capturedAt: Date.now(),
            },
            accepts,
        );

        const fixtures: EquipmentDiagnosticFixture[] = [];
        await withTransaction(conn, async () => {
            const [clock] = await queryAll<{ millis: number }>(
                conn,
                "SELECT epoch_ms(current_timestamp) AS millis",
            );
            const observedAt = opts.observedAt ?? new Date(Number(clock!.millis));
            const changes = page.stashes.filter(
                (change) => !change.public || !opts.league || change.league === opts.league,
            );
            for (const change of changes) {
                result.stashes++;
                if (change.public) {
                    result.publicStashes++;
                    const lg = change.league ?? "<missing>";
                    const acc = result.leagues.get(lg) ?? { stashes: 0, items: 0 };
                    acc.stashes++;
                    acc.items += change.items.length;
                    result.leagues.set(lg, acc);
                }
            }
            const r = await applyStashChanges(conn, changes);
            result.equipmentObserved += await captureEquipmentPage(
                conn,
                changes,
                equipment,
                observedAt,
                opts.equipmentDiagnostics
                    ? (item, classification) => {
                          const fixture = opts.equipmentDiagnostics!.collect(
                              item,
                              classification,
                              observedAt,
                          );
                          if (fixture) fixtures.push(fixture);
                      }
                    : undefined,
            );
            result.inserted += r.inserted;
            result.updated += r.updated;
            result.removed += r.removed;
            await recordCheckpoint(conn, page, {
                realm,
                league: opts.league ?? "all",
                cursor: requestCursor,
                capturedAt: observedAt.getTime(),
            });
            await setCursor(conn, STREAM, page.next_change_id);
            if (captureId)
                await conn.run(
                    "UPDATE ps_capture_page SET processed_at = current_timestamp, equipment_revision = $2 WHERE id = $1",
                    [captureId, equipment.manifest.revision],
                );
        });
        if (fixtures.length) await opts.equipmentDiagnostics?.flush(fixtures);

        cursor = page.next_change_id;
        result.pages++;
        result.finalCursor = cursor;
        await opts.onProgress?.(result);

        console.log(
            `page ${i + 1}/${opts.pages}: stashes=${page.stashes.length} ` +
                `ins=${result.inserted} upd=${result.updated} rem=${result.removed} ` +
                `equipment=${result.equipmentObserved} ` +
                `next=${cursor.slice(0, 12)}…`,
        );

        // Caught up: API echoed the cursor we sent. No new pages exist;
        // refetching would burn rate-limit budget for identical content.
        if (requestCursor !== undefined && page.next_change_id === requestCursor) {
            result.caughtUp = true;
            console.log("psapi: caught up; stopping early");
            break;
        }
    }

    await evaluateSales(conn, result.caughtUp);

    return result;
}
