import type { DuckDBConnection } from "@duckdb/node-api";
import type { PoeApiClient, PublicStashChange } from "@poe-tools/api-client";
import { archivePage, recordRawPage } from "#src/ps/capture-archive.ts";
import { recordCheckpoint } from "#src/ps/checkpoints.ts";
import { sharedClassifyPool } from "#src/ps/classify-pool.ts";
import { defaultCraftingCapture } from "#src/ps/crafting-capture.ts";
import {
    captureEquipmentPage,
    defaultEquipmentClassifier,
    type EquipmentClassifier,
    primeClassifications,
} from "#src/ps/equipment.ts";
import type {
    EquipmentDiagnosticFixture,
    EquipmentDiagnostics,
} from "#src/ps/equipment-diagnostics.ts";
import { ListingBatch } from "#src/ps/listing-batch.ts";
import {
    INDEXED_COLUMNS,
    LISTING_VALUES,
    type ListingRow,
    listingRows,
    UPDATED_COLUMNS,
} from "#src/ps/listing-rows.ts";
import { invalidateListingState, listingState } from "#src/ps/listing-state-cache.ts";
import {
    appendRawPage,
    RAW_POSITION_STREAM,
    type RawPageReader,
    rawPageLocator,
} from "#src/ps/raw-archive.ts";
import { params, stashRounds } from "#src/ps/rounds.ts";
import { evaluateSales, recordRemovals } from "#src/ps/sales.ts";
import { REALM } from "#src/shared/auth.ts";
import { learnBasemap } from "#src/shared/basemap.ts";
import { getCursor, setCursor } from "#src/shared/cursor.ts";
import { queryAll, sqlTimestamp, TransactionRollbackError } from "#src/shared/db.ts";
import { configureSource } from "#src/shared/source.ts";
import { listingTab } from "#src/shared/stash-tab.ts";

const STREAM = "psapi";
const PAGE_DELAY_MS = 1200;
/**
 * The API ends a page once it holds about 5 MB of JSON (as of 3.30), so a smaller page holds every
 * change published by the time it was requested: the stream's head. In a busy stream this is the
 * only sign of the head, because each request finds new changes and the cursor is never echoed.
 */
export const HEAD_PAGE_BYTES = 3_000_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A batch's item JSON held in memory before it is written; see `ListingBatch.bytes`. */
const BATCH_BYTES = 256_000_000;
const HOUR_US = 3_600_000_000;
const hourStart = (micros: number) => Math.floor(micros / HOUR_US) * HOUR_US;

/**
 * Pages applied in one transaction (`PS_BATCH_PAGES`, default 1). A batch also ends at each hour of
 * capture time. A failure rolls back, and replays, the whole batch.
 */
export function ingestBatchPages(env = process.env) {
    const pages = env.PS_BATCH_PAGES ? Number(env.PS_BATCH_PAGES) : 1;
    if (!Number.isSafeInteger(pages) || pages < 1)
        throw new Error("PS_BATCH_PAGES must be a positive whole number.");
    return pages;
}

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
    /** Reading a capture process's archive: whether every archived page has been read. */
    drained?: boolean;
}

async function updateListings(
    conn: DuckDBConnection,
    rows: readonly (ListingRow & { rowId: string })[],
    seenAt: string,
    keysChanged: boolean,
) {
    const columns = UPDATED_COLUMNS.filter((column) => keysChanged || !INDEXED_COLUMNS.has(column));
    await conn.run(
        `UPDATE ps_listing SET
            ${columns.map((column) => `${column} = v.${column}`).join(", ")},
            last_seen_at = ${seenAt},
            removed_at = NULL
        FROM (
            SELECT (value->>'rowId')::BIGINT AS row_id, ${LISTING_VALUES} FROM json_each($1::JSON)
        ) v
        WHERE ps_listing.rowid = v.row_id`,
        [JSON.stringify(rows)],
    );
}

/**
 * Applies a page's stash changes with a fixed number of set-based statements. DuckDB pays a few
 * milliseconds per statement, and `ON CONFLICT`/`INSERT OR REPLACE` scan the whole table, so rows
 * are looked up once through the stash index, then updated by row ID or plainly inserted.
 *
 * `ingestPs` applies pages with a `ListingBatch` instead, which must write what this writes; this
 * stays as the reference its tests compare with.
 */
export async function applyStashChanges(
    conn: DuckDBConnection,
    changes: readonly PublicStashChange[],
    /** When the page was captured; by default, now. */
    observedAt?: Date,
): Promise<{ inserted: number; updated: number; removed: number }> {
    invalidateListingState(conn);
    const totals = { inserted: 0, updated: 0, removed: 0 };
    for (const round of stashRounds(changes)) {
        const result = await applyRound(conn, round, observedAt);
        totals.inserted += result.inserted;
        totals.updated += result.updated;
        totals.removed += result.removed;
    }
    return totals;
}

async function applyRound(
    conn: DuckDBConnection,
    changes: readonly PublicStashChange[],
    observedAt?: Date,
) {
    const seenAt = sqlTimestamp(observedAt);
    const stashIds = changes.map((change) => change.id);
    const known = await queryAll<{
        rowId: string;
        accountName: string;
        stashId: string;
        itemId: string;
        league: string;
        itemKey: string;
        iconAsset: string | null;
        contentDigest: string | null;
        active: boolean;
    }>(
        conn,
        `SELECT rowid::VARCHAR AS "rowId", account_name AS "accountName", stash_id AS "stashId",
            item_id AS "itemId", league, item_key AS "itemKey", icon_asset AS "iconAsset",
            content_digest AS "contentDigest", removed_at IS NULL AS active
        FROM ps_listing WHERE stash_id IN (${params(stashIds)})`,
        stashIds,
    );
    const byStash = Map.groupBy(known, (row) => row.stashId);
    const result = { inserted: 0, updated: 0, removed: 0 };
    const removedRows: string[] = [];
    const removals: Parameters<typeof recordRemovals>[1][number][] = [];
    const seen: (ListingRow & { rowId: string })[] = [];
    const updates: (ListingRow & { rowId: string })[] = [];
    const rekeyed: (ListingRow & { rowId: string })[] = [];
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
            if (!existing) inserts.push(row);
            else if (existing.contentDigest === row.contentDigest)
                seen.push({ ...row, rowId: existing.rowId });
            else if (existing.itemKey === row.itemKey && existing.iconAsset === row.iconAsset)
                updates.push({ ...row, rowId: existing.rowId });
            else rekeyed.push({ ...row, rowId: existing.rowId });
        }
        const gone = [...owned.values()].filter((row) => row.active && !current.has(row.itemId));
        if (gone.length) {
            removedRows.push(...gone.map((row) => row.rowId));
            removals.push({ stashId: change.id, withdrawn: false, tab: listingTab(change) });
            result.removed += gone.length;
        }
        listed.push({ stashId: change.id, accountName });
    }

    await learnBasemap(conn, [...seen, ...updates, ...rekeyed, ...inserts]);
    // Removals first: rekeyed updates rewrite their rows under new row IDs.
    if (removedRows.length) {
        await conn.run(
            `UPDATE ps_listing SET removed_at = ${seenAt}
            WHERE rowid IN (SELECT value::BIGINT FROM json_each($1::JSON))`,
            [JSON.stringify(removedRows)],
        );
    }
    if (removals.length) await recordRemovals(conn, removals, observedAt);
    if (seen.length) {
        // Rewriting every column, item JSON included, of an unchanged listing costs far more.
        await conn.run(
            `UPDATE ps_listing SET last_seen_at = ${seenAt}, removed_at = NULL
            WHERE rowid IN (SELECT value::BIGINT FROM json_each($1::JSON))`,
            [JSON.stringify(seen.map((row) => row.rowId))],
        );
    }
    if (updates.length) await updateListings(conn, updates, seenAt, false);
    if (rekeyed.length) await updateListings(conn, rekeyed, seenAt, true);
    if (inserts.length) {
        await conn.run(
            `INSERT INTO ps_listing BY NAME
            SELECT ${LISTING_VALUES}, ${seenAt} AS first_seen_at,
                ${seenAt} AS last_seen_at
            FROM json_each($1::JSON)`,
            [JSON.stringify(inserts)],
        );
    }
    if (!listed.length) return result;

    // Active listings were all seen now, so refresh their observations within the current hour
    // instead of merging: zonemaps confine the hour to the newest row groups. Earlier observations
    // of items removed during this hour stay. Existing rows are updated in place.
    const listedIds = listed.map((stash) => stash.stashId);
    await conn.run(
        `CREATE OR REPLACE TEMP TABLE page_listing AS
        WITH stash AS MATERIALIZED (
            -- The hour rows keep no item JSON or digest, so neither is copied here.
            SELECT * EXCLUDE (raw_item, content_digest, listing_id) FROM ps_listing WHERE stash_id IN (${params(listedIds, 2)})
        )
        SELECT stash.* EXCLUDE (removed_at) FROM stash
        JOIN json_each($1::JSON) j ON stash.stash_id = (j.value->>'stashId')
            AND stash.account_name = (j.value->>'accountName')
        -- An item still listed but no longer captured stays active with its old last_seen_at;
        -- it was not observed now, so its earlier hour stays as it was.
        WHERE stash.removed_at IS NULL AND stash.last_seen_at = ${seenAt}`,
        [JSON.stringify(listed), ...listedIds],
    );
    const sameRow = `h.observed_hour = epoch(date_trunc('hour', ${seenAt}))::BIGINT
        AND h.stash_id = l.stash_id AND h.account_name = l.account_name AND h.item_id = l.item_id`;
    await conn.run(
        `UPDATE ps_listing_hour h SET league = l.league,
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
            tab = l.tab,
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
        /** When the page's listings were seen; by default, its capture time or now. */
        listingsObservedAt?: Date;
        /** Directory that keeps every fetched page unfiltered; see `raw-archive.ts`. */
        rawArchiveDir?: string;
        /** Reads pages a capture process archived, at their capture times, instead of fetching. */
        spool?: RawPageReader;
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
    // Threads compile the bundled catalog, so they serve only the default classifier, and need
    // the archived page's JSON.
    const pool =
        !opts.equipment && opts.spool
            ? await sharedClassifyPool(equipment.manifest.revision)
            : undefined;
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
        ...(opts.spool ? { drained: false } : {}),
    };

    let cursor: string | undefined = opts.spool
        ? undefined
        : (opts.cursor ?? (await getCursor(conn, STREAM)));
    let lastCapturedAt: number | undefined;
    let streamHeadAt: number | undefined;

    // Pages are applied in batches, each in one transaction: listings in memory, then written
    // together (see `ListingBatch`); everything else page by page inside the transaction.
    const batchPages = ingestBatchPages();
    const state = await listingState(conn);
    let batch: ListingBatch | undefined;
    let batchStart: RawPageReader["position"] | undefined;
    let fixtures: EquipmentDiagnosticFixture[] = [];
    const commit = async () => {
        if (!batch) return;
        await batch.flush(conn);
        await conn.run("COMMIT");
        batch = undefined;
        if (fixtures.length) await opts.equipmentDiagnostics?.flush(fixtures);
        fixtures = [];
    };

    try {
        for (let i = 0; i < opts.pages; i++) {
            if (i > 0 && !opts.spool) await sleep(PAGE_DELAY_MS);
            const captured = await opts.spool?.peek();
            if (opts.spool && !captured) {
                result.drained = true;
                break;
            }
            const pageTime = captured ? new Date(captured.capturedAt) : undefined;
            const listingsAt = opts.listingsObservedAt ?? pageTime;
            const at = listingsAt && listingsAt.getTime() * 1000;
            if (
                batch &&
                (batch.pages >= batchPages ||
                    batch.bytes >= BATCH_BYTES ||
                    (at !== undefined && hourStart(at) !== batch.hour))
            )
                await commit();
            if (!batch && i > 0 && !process.env.PS_CHECKPOINT_THRESHOLD) {
                // Release the committed batch's indexes before loading another. On a large
                // database each checkpoint rewrites gigabytes of index, so with memory to spare
                // PS_CHECKPOINT_THRESHOLD leaves checkpoints to DuckDB once the WAL reaches it.
                await conn.run("CHECKPOINT");
            }
            const requestCursor = captured ? (captured.cursor ?? undefined) : cursor;
            const page =
                captured?.page ??
                (await client.public.stashTabs(
                    requestCursor ? { realm: REALM, id: requestCursor } : { realm: REALM },
                ));
            const capturedAt = captured?.capturedAt ?? Date.now();
            // Classified on other threads while this page's listings and sales are written.
            const classified =
                pool && captured
                    ? pool
                          .classify(captured.pageJson, opts.league ?? null)
                          .catch((error: unknown) => {
                              console.error(
                                  "Page classification threads failed; classifying here.",
                                  error,
                              );
                              return undefined;
                          })
                    : undefined;
            // Written before processing, so a failure refetches the page; replays may see it twice.
            if (opts.rawArchiveDir)
                await appendRawPage(opts.rawArchiveDir, {
                    capturedAt,
                    cursor: requestCursor,
                    page,
                });
            // A page read from the raw archive already has its copy there; see `recordRawPage`.
            const rawLocator = opts.spool && rawPageLocator(opts.spool.position);
            const captureId = rawLocator
                ? null
                : await archivePage(
                      conn,
                      page,
                      {
                          realm,
                          league: opts.league ?? "all",
                          cursor: requestCursor,
                          capturedAt,
                      },
                      accepts,
                  );

            if (!batch) {
                batchStart = opts.spool?.position;
                await conn.run("BEGIN TRANSACTION");
            }
            const [clock] = await queryAll<{ millis: number; micros: number }>(
                conn,
                "SELECT epoch_ms(current_timestamp) AS millis, epoch_us(current_timestamp)::DOUBLE AS micros",
            );
            // Without a capture time, listings are seen at the transaction's start, as SQL's
            // `current_timestamp` would have them.
            const listingsUs = at ?? Number(clock!.micros);
            batch ??= await ListingBatch.open(conn, state, hourStart(listingsUs));
            const observedAt = opts.observedAt ?? pageTime ?? new Date(Number(clock!.millis));
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
            const r = batch.applyPage(changes, listingsUs);
            const prepared = await classified;
            if (prepared) primeClassifications(equipment, prepared);
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
            if (captured) await setCursor(conn, RAW_POSITION_STREAM, JSON.stringify(captured.end));
            if (captureId)
                await conn.run(
                    "UPDATE ps_capture_page SET processed_at = current_timestamp, equipment_revision = $2 WHERE id = $1",
                    [captureId, equipment.manifest.revision],
                );
            // Reclassification skips private stashes, so a page of only those has nothing to replay.
            if (rawLocator && changes.some((change) => change.public))
                await recordRawPage(conn, page, {
                    realm,
                    league: opts.league ?? "all",
                    cursor: requestCursor,
                    capturedAt,
                    locator: rawLocator,
                    revision: equipment.manifest.revision,
                });
            opts.spool?.advance();
            lastCapturedAt = capturedAt;

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

            if (requestCursor !== undefined) {
                const bytes = captured?.bytes ?? Buffer.byteLength(JSON.stringify(page));
                if (bytes < HEAD_PAGE_BYTES) streamHeadAt = capturedAt;
            }

            // Caught up: API echoed the cursor we sent. No new pages exist;
            // refetching would burn rate-limit budget for identical content.
            if (requestCursor !== undefined && page.next_change_id === requestCursor) {
                result.caughtUp = true;
                // More archived pages may follow; capture has already waited before fetching them.
                if (opts.spool) continue;
                console.log("psapi: caught up; stopping early");
                break;
            }
        }
        await commit();
    } catch (error) {
        if (batch) {
            // The state already holds the batch's changes, and the reader is past its pages.
            invalidateListingState(conn);
            if (opts.spool && batchStart) await opts.spool.rewind(batchStart);
            try {
                await conn.run("ROLLBACK");
            } catch (rollbackError) {
                throw new TransactionRollbackError(error, rollbackError);
            }
        }
        throw error;
    }

    // Sales follow the capture clock, so a database that fell behind judges them as if it had not.
    const reachedHead = streamHeadAt !== undefined;
    if (!opts.spool) await evaluateSales(conn, reachedHead);
    else if (lastCapturedAt !== undefined)
        await evaluateSales(conn, reachedHead, new Date(streamHeadAt ?? lastCapturedAt));

    return result;
}
