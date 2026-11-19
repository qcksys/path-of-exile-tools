import type { DuckDBConnection } from "@duckdb/node-api";
import type { PublicStashChange } from "@poe-tools/api-client";
import {
    INDEXED_COLUMNS,
    type ListingRow,
    listingRows,
    listingValues,
    UPDATED_COLUMNS,
} from "#src/ps/listing-rows.ts";
import {
    ListingState,
    type MarketFields,
    NONE,
    type PoolSale,
    type TabCode,
    tabCode,
} from "#src/ps/listing-state.ts";
import { stashRounds } from "#src/ps/rounds.ts";
import { SALE_POLICY } from "#src/ps/sales.ts";
import { learnBasemap } from "#src/shared/basemap.ts";
import { isUniqueItem } from "#src/shared/capture.ts";
import { queryAll } from "#src/shared/db.ts";
import { listingTab } from "#src/shared/stash-tab.ts";

const GRACE_US = SALE_POLICY.graceSeconds * 1e6;
/** Rows per statement: rows carry their item JSON, and a statement's JSON is one string. */
const CHUNK = 5_000;
/** Rows per statement of rows without item JSON (sightings, sales from stored rows). */
const NARROW_CHUNK = 200_000;
const timestamp = (column: string) =>
    `CASE WHEN ${column} IS NULL THEN NULL ELSE make_timestamp((${column})::BIGINT) END`;

/** The values of a listing row that decide its markets, as `ps_listing` would return them. */
export function rowFields(row: ListingRow): MarketFields {
    const signature = row.modSignature
        ? (JSON.parse(row.modSignature) as { kind?: unknown; mods?: unknown })
        : null;
    return {
        accountName: row.accountName,
        league: row.league,
        itemKey: row.itemKey,
        identified: row.identified,
        corrupted: row.corrupted,
        foilVariation: row.foilVariation,
        links: row.links,
        tab: row.tab,
        signatureValue: row.signatureValue,
        kind: typeof signature?.kind === "string" ? signature.kind : null,
        mods: Array.isArray(signature?.mods)
            ? signature.mods.map((mod) => (typeof mod === "string" ? mod : JSON.stringify(mod)))
            : [],
        priceAmount: row.priceAmount,
        priceCurrency: row.priceCurrency,
    };
}

interface Touch {
    /** Whether `ps_listing` held the row when the batch began. */
    inDb: boolean;
    /** Its values, when the batch changed them. */
    row?: ListingRow;
    /** Its item key and icon in `ps_listing`, to tell whether an update sets indexed columns. */
    dbKeys?: readonly [number, number];
    /** When the batch first saw a row it inserted. */
    firstSeen: number;
}

interface SaleEvent {
    slot: number;
    listingId: number;
    stashId: string;
    /** The listing's values when removed, if the batch had changed them. */
    row?: ListingRow;
    inDb: boolean;
    firstSeen: number;
    lastSeen: number;
    removedAt: number;
    /** The removal's tab: listings recorded before tabs take it. */
    tab: string | null;
    effectiveTab: TabCode;
    status: "pending" | "unobserved" | "withdrawn";
    price: number | null;
    sellers: number;
    pool: PoolSale;
}

type BasemapEntry = Parameters<typeof learnBasemap>[1][number];

/**
 * A run of pages applied in memory to a `ListingState`, then written in one go by `flush`, with
 * the same result as `applyStashChanges` on each page: listings, their hour rows, sales and the
 * basemap. A batch never spans two hours, so a listing's hour row is its last values.
 */
export class ListingBatch {
    pages = 0;
    /** Item JSON held for writing, to bound a batch's memory. */
    bytes = 0;
    private touches = new Map<number, Touch>();
    private sales: SaleEvent[] = [];
    private saleKeys = new Set<string>();
    private withdrawnStashes = new Set<string>();
    private basemap: BasemapEntry[] = [];
    private sighted = new Set<number>();
    readonly state: ListingState;
    /** The hour, in microseconds since the epoch, of every page in the batch. */
    readonly hour: number;
    /** `pipeline_health.last_caught_up_at`, which only `evaluateSales` changes. */
    private readonly caughtUpAt: number | null;

    // No parameter properties: the worker runs this file with Node's type stripping.
    private constructor(state: ListingState, hour: number, caughtUpAt: number | null) {
        this.state = state;
        this.hour = hour;
        this.caughtUpAt = caughtUpAt;
    }

    /** Opens a batch inside the caller's transaction. */
    static async open(conn: DuckDBConnection, state: ListingState, hour: number) {
        const [health] = await queryAll<{ at: number | null }>(
            conn,
            "SELECT epoch_us(last_caught_up_at)::DOUBLE AS at FROM pipeline_health WHERE id = 1",
        );
        return new ListingBatch(state, hour, health?.at ?? null);
    }

    /** Applies a page's changes seen at `at` (microseconds), as `applyStashChanges` would. */
    applyPage(changes: readonly PublicStashChange[], at: number) {
        const totals = { inserted: 0, updated: 0, removed: 0 };
        for (const round of stashRounds(changes)) this.applyRound(round, at, totals);
        this.pages++;
        return totals;
    }

    private touch(slot: number) {
        let touch = this.touches.get(slot);
        if (!touch) {
            touch = { inDb: true, dbKeys: this.state.keys(slot), firstSeen: Number.NaN };
            this.touches.set(slot, touch);
        }
        return touch;
    }

    private applyRound(
        changes: readonly PublicStashChange[],
        at: number,
        totals: { inserted: number; updated: number; removed: number },
    ) {
        const state = this.state;
        const removed: number[] = [];
        const removals: { stashId: string; withdrawn: boolean; tab?: string }[] = [];
        const seen: [number, ListingRow][] = [];
        const updates: [number, ListingRow][] = [];
        const rekeyed: [number, ListingRow][] = [];
        const inserts: ListingRow[] = [];
        for (const change of changes) {
            const slots = state.stashSlots(change.id);
            if (!change.public) {
                const gone = slots.filter((slot) => state.active[slot]);
                removed.push(...gone);
                removals.push({ stashId: change.id, withdrawn: true });
                totals.removed += gone.length;
                continue;
            }
            if (!change.accountName || !change.league) continue;
            const account = change.accountName;
            const current = new Set(
                change.items.flatMap((item) => (item.id ? [ListingState.idKeyOf(item.id)] : [])),
            );
            for (const row of listingRows(change, account, change.league)) {
                const existing = state.find(change.id, account, row.itemId);
                if (existing !== NONE && state.active[existing]) totals.updated++;
                else totals.inserted++;
                if (existing === NONE) inserts.push(row);
                else if (state.digestEquals(existing, row.contentDigest))
                    seen.push([existing, row]);
                else if (state.keysEqual(existing, row.itemKey, row.iconAsset))
                    updates.push([existing, row]);
                else rekeyed.push([existing, row]);
            }
            const gone = slots.filter(
                (slot) =>
                    state.active[slot] &&
                    state.account(slot) === account &&
                    !current.has(state.idKey(slot)),
            );
            if (gone.length) {
                removed.push(...gone);
                removals.push({ stashId: change.id, withdrawn: false, tab: listingTab(change) });
                totals.removed += gone.length;
            }
        }

        // The order `applyRound` writes in: sales are priced after the removals and before this
        // round's sightings, updates and inserts.
        for (const row of [...seen, ...updates, ...rekeyed].map(([, row]) => row).concat(inserts))
            if (row.iconAsset && row.identified && isUniqueItem(row) && row.name)
                this.basemap.push({
                    iconAsset: row.iconAsset,
                    name: row.name,
                    baseType: row.baseType,
                    identified: row.identified,
                    frameType: row.frameType,
                    rarity: row.rarity,
                });
        for (const slot of removed) {
            this.touch(slot);
            state.remove(slot, at);
        }
        if (removals.length) this.recordRemovals(removals, at);
        for (const [slot] of seen) {
            this.touch(slot);
            state.sight(slot, at);
            this.sighted.add(slot);
        }
        for (const [slot, row] of [...updates, ...rekeyed]) {
            const touch = this.touch(slot);
            state.setValues(slot, rowFields(row), row.contentDigest, row.iconAsset);
            state.sight(slot, at);
            touch.row = row;
            this.bytes += row.rawItem.length;
            this.sighted.add(slot);
        }
        for (const row of inserts) {
            const slot = state.add(
                row.stashId,
                row.accountName,
                row.itemId,
                state.nextListingId,
                rowFields(row),
                row.contentDigest,
                row.iconAsset,
            );
            state.sight(slot, at);
            this.touches.set(slot, { inDb: false, row, firstSeen: at });
            this.bytes += row.rawItem.length;
            this.sighted.add(slot);
        }
    }

    private recordRemovals(
        removals: readonly { stashId: string; withdrawn: boolean; tab?: string }[],
        at: number,
    ) {
        const state = this.state;
        const withdrawn = new Set(removals.filter((r) => r.withdrawn).map((r) => r.stashId));
        if (withdrawn.size) {
            for (const sale of this.sales)
                if (sale.status === "pending" && withdrawn.has(sale.stashId))
                    sale.status = "withdrawn";
            for (const stashId of withdrawn) this.withdrawnStashes.add(stashId);
        }
        const observed = this.caughtUpAt !== null && this.caughtUpAt >= at - GRACE_US;
        // `recordRemovals` skips a removal whose stash, item and time an earlier call recorded,
        // whichever account it was listed under; within one call, every account's row counts.
        const recorded: string[] = [];
        for (const removal of removals) {
            for (const slot of state.stashSlots(removal.stashId)) {
                if (state.active[slot] || state.removedAt[slot] !== at) continue;
                const key = `${removal.stashId}\n${state.idKey(slot)}\n${at}`;
                if (this.saleKeys.has(key)) continue;
                recorded.push(key);
                const touch = this.touches.get(slot);
                const effectiveTab = (state.tab[slot] || tabCode(removal.tab)) as TabCode;
                const market = state.marketPrice(slot, effectiveTab, at);
                this.sales.push({
                    slot,
                    listingId: state.listingId[slot]!,
                    stashId: removal.stashId,
                    row: touch?.row,
                    inDb: touch ? touch.inDb : true,
                    firstSeen: touch?.firstSeen ?? Number.NaN,
                    lastSeen: state.lastSeen[slot]!,
                    removedAt: at,
                    tab: removal.tab ?? null,
                    effectiveTab,
                    status: removal.withdrawn ? "withdrawn" : observed ? "pending" : "unobserved",
                    price: market.price,
                    sellers: market.sellers,
                    pool: state.poolSale(slot),
                });
            }
        }
        for (const key of recorded) this.saleKeys.add(key);
        // `priceModPoolSales` reprices every mod pool sale of these stashes removed at this time.
        const stashes = new Set(removals.map((r) => r.stashId));
        for (const sale of this.sales) {
            if (sale.removedAt !== at || !stashes.has(sale.stashId) || !sale.pool.pool) continue;
            const market = state.poolMarketPrice(
                sale.pool,
                sale.effectiveTab,
                at,
                SALE_POLICY.minimumSellers,
            );
            sale.price = market.price;
            sale.sellers = market.sellers;
        }
    }

    /** Writes the batch inside the caller's transaction. */
    async flush(conn: DuckDBConnection) {
        const state = this.state;
        if (this.withdrawnStashes.size) {
            await conn.run(
                `UPDATE ps_sale SET status = 'withdrawn', updated_at = current_timestamp
                WHERE rowid IN (
                    WITH pending AS MATERIALIZED (
                        SELECT rowid AS row_id, stash_id FROM ps_sale WHERE status = 'pending'
                    ) SELECT row_id FROM pending WHERE stash_id IN (
                        SELECT json_extract_string(value, '$') FROM json_each($1::JSON))
                )`,
                [JSON.stringify([...this.withdrawnStashes])],
            );
        }

        // Sales first, while ps_listing still holds the rows they were removed from. A sale an
        // earlier batch recorded at the same time (pages captured in the same instant) blocks
        // one, as in `recordRemovals`; the batch's own sales were deduplicated in memory.
        if (this.sales.length)
            await conn.run(
                `CREATE OR REPLACE TEMP TABLE batch_prior_sale AS
                SELECT stash_id, item_id, removed_at FROM ps_sale WHERE removed_at IN (
                    SELECT make_timestamp(value::BIGINT) FROM json_each($1::JSON))`,
                [JSON.stringify([...new Set(this.sales.map((sale) => sale.removedAt))])],
            );
        const notSold = (stash: string, item: string) =>
            `NOT EXISTS (SELECT 1 FROM batch_prior_sale s WHERE s.removed_at = make_timestamp((e.value->>'removedAt')::BIGINT)
                AND s.stash_id = ${stash} AND s.item_id = ${item})`;
        const saleColumns = `e.value->>'status' AS status, NULL::TIMESTAMP AS eligible_since,
            (e.value->>'price')::DOUBLE AS market_price, (e.value->>'sellers')::BIGINT AS market_sellers,
            current_timestamp::TIMESTAMP AS updated_at,
            make_timestamp((e.value->>'lastSeen')::BIGINT) AS last_seen_at,
            make_timestamp((e.value->>'removedAt')::BIGINT) AS removed_at`;
        for (const chunk of chunks(
            this.sales.filter((sale) => !sale.row),
            NARROW_CHUNK,
        )) {
            await conn.run(
                `INSERT INTO ps_sale BY NAME
                SELECT l.* EXCLUDE (raw_item, content_digest, listing_id, last_seen_at, removed_at, tab),
                    coalesce(l.tab, e.value->>'tab') AS tab, ${saleColumns}
                FROM json_each($1::JSON) e
                JOIN ps_listing l ON l.listing_id = (e.value->>'listingId')::BIGINT
                WHERE ${notSold("l.stash_id", "l.item_id")}`,
                [JSON.stringify(chunk.map(saleJson))],
            );
        }
        const rowValues = listingValues(["raw_item", "content_digest", "tab"]).replaceAll(
            "value->",
            "e.value->",
        );
        for (const chunk of chunks(this.sales.filter((sale) => sale.row))) {
            await conn.run(
                `INSERT INTO ps_sale BY NAME
                SELECT ${rowValues},
                    coalesce(e.value->>'rowTab', e.value->>'tab') AS tab,
                    CASE WHEN (e.value->>'inDb')::BOOLEAN THEN l.first_seen_at
                        ELSE make_timestamp((e.value->>'firstSeen')::BIGINT) END AS first_seen_at,
                    ${saleColumns}
                FROM json_each($1::JSON) e
                LEFT JOIN ps_listing l ON l.listing_id = (e.value->>'listingId')::BIGINT
                WHERE ${notSold("(e.value->>'stashId')", "(e.value->>'itemId')")}`,
                [
                    JSON.stringify(
                        chunk.map((sale) => {
                            const { rawItem: _, contentDigest: __, tab, ...row } = sale.row!;
                            return { ...row, rowTab: tab, ...saleJson(sale) };
                        }),
                    ),
                ],
            );
        }

        const states: unknown[] = [];
        const kept: unknown[] = [];
        const rekeyed: unknown[] = [];
        const inserts: unknown[] = [];
        for (const [slot, touch] of this.touches) {
            const listingId = state.listingId[slot]!;
            const lastSeen = state.lastSeen[slot]!;
            const removedAt = state.active[slot] ? null : state.removedAt[slot]!;
            if (!touch.inDb) {
                inserts.push({
                    ...touch.row!,
                    listingId,
                    firstSeen: touch.firstSeen,
                    lastSeen,
                    removedAt,
                });
                continue;
            }
            if (!touch.row) {
                states.push({ listingId, lastSeen, removedAt });
                continue;
            }
            const [itemKey, icon] = state.keys(slot);
            const keysChanged = itemKey !== touch.dbKeys![0] || icon !== touch.dbKeys![1];
            (keysChanged ? rekeyed : kept).push({ ...touch.row, listingId, lastSeen, removedAt });
        }
        const listingTimes = `last_seen_at = make_timestamp(v.last_seen), removed_at = ${timestamp("v.removed")}`;
        const byId = `(value->>'listingId')::BIGINT AS listing_id, (value->>'lastSeen')::BIGINT AS last_seen,
            (value->>'removedAt')::BIGINT AS removed`;
        // These rows are short: one statement carries far more of them.
        for (const chunk of chunks(states, NARROW_CHUNK)) {
            await conn.run(
                `UPDATE ps_listing SET ${listingTimes}
                FROM (SELECT ${byId} FROM json_each($1::JSON)) v
                WHERE ps_listing.listing_id = v.listing_id`,
                [JSON.stringify(chunk)],
            );
        }
        for (const [rows, keysChanged] of [
            [kept, false],
            [rekeyed, true],
        ] as const) {
            const columns = UPDATED_COLUMNS.filter(
                (column) => keysChanged || !INDEXED_COLUMNS.has(column),
            );
            for (const chunk of chunks(rows)) {
                await conn.run(
                    `UPDATE ps_listing SET ${columns.map((c) => `${c} = v.${c}`).join(", ")}, ${listingTimes}
                    FROM (SELECT ${byId}, ${listingValues()} FROM json_each($1::JSON)) v
                    WHERE ps_listing.listing_id = v.listing_id`,
                    [JSON.stringify(chunk)],
                );
            }
        }
        for (const chunk of chunks(inserts)) {
            await conn.run(
                `INSERT INTO ps_listing BY NAME
                SELECT ${listingValues()}, (value->>'listingId')::BIGINT AS listing_id,
                    make_timestamp((value->>'firstSeen')::BIGINT) AS first_seen_at,
                    make_timestamp((value->>'lastSeen')::BIGINT) AS last_seen_at,
                    ${timestamp("value->>'removedAt'")} AS removed_at
                FROM json_each($1::JSON)`,
                [JSON.stringify(chunk)],
            );
        }

        // Every listing seen in the batch has one row for its hour, holding its last values.
        if (this.sighted.size) {
            await conn.run(
                `CREATE OR REPLACE TEMP TABLE batch_listing AS
                SELECT * EXCLUDE (raw_item, content_digest, listing_id, removed_at) FROM ps_listing
                WHERE listing_id IN (SELECT value::BIGINT FROM json_each($1::JSON))`,
                [JSON.stringify([...this.sighted].map((slot) => state.listingId[slot]))],
            );
            const sameRow = `h.observed_hour = epoch(date_trunc('hour', l.last_seen_at))::BIGINT
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
                FROM batch_listing l
                WHERE h.observed_hour = ${Math.floor(this.hour / 1e6)} AND ${sameRow}`,
            );
            await conn.run(
                `INSERT INTO ps_listing_hour BY NAME
                SELECT *, epoch(date_trunc('hour', last_seen_at))::BIGINT AS observed_hour
                FROM batch_listing l
                WHERE NOT EXISTS (SELECT 1 FROM ps_listing_hour h WHERE ${sameRow})`,
            );
        }
        for (const chunk of chunks(this.basemap, NARROW_CHUNK)) await learnBasemap(conn, chunk);
    }
}

function saleJson(sale: SaleEvent) {
    return {
        listingId: sale.listingId,
        inDb: sale.inDb,
        firstSeen: Number.isNaN(sale.firstSeen) ? null : sale.firstSeen,
        lastSeen: sale.lastSeen,
        removedAt: sale.removedAt,
        tab: sale.tab,
        status: sale.status,
        price: sale.price,
        sellers: sale.sellers,
    };
}

function chunks<T>(rows: T[], size = CHUNK) {
    const out: T[][] = [];
    for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
    return out;
}
