import type { DuckDBConnection } from "@duckdb/node-api";
import type { PublicStashChange } from "@poe-tools/api-client";
import type { Classification, EquipmentClassifier } from "#src/ps/default-classifier.ts";
import { classifyItem, type EquipmentRow, equipmentRow } from "#src/ps/equipment.ts";
import { EquipmentState } from "#src/ps/equipment-state.ts";
import { NONE } from "#src/ps/listing-state.ts";
import { stashRounds } from "#src/ps/rounds.ts";
import { extractListingPrice } from "#src/shared/price.ts";
import { listingTab } from "#src/shared/stash-tab.ts";

type Item = PublicStashChange["items"][number];
type OnClassified = (item: Item, classification: Classification) => void;

/** Rows per statement: rows carry their item JSON, and a statement's JSON is one string. */
const CHUNK = 5_000;
const NARROW_CHUNK = 200_000;
const timestamp = (column: string) =>
    `CASE WHEN ${column} IS NULL THEN NULL ELSE make_timestamp((${column})::BIGINT) END`;

interface Touch {
    inDb: boolean;
    /** The row's values, when the batch wrote them. */
    row?: EquipmentRow;
    /** Its stash in `ps_equipment_listing`, to tell whether an update sets the indexed column. */
    dbStash?: string;
    lastSeen: number;
    /** Microseconds; NaN while active. */
    removedAt: number;
}

/**
 * A run of pages' equipment applied in memory to an `EquipmentState`, then written by `flush`,
 * with the same result as `captureEquipmentPage` on each page. Like `ListingBatch`, a batch never
 * spans two hours, so an item's hour row is its last values.
 */
export class EquipmentBatch {
    readonly state: EquipmentState;
    /** The hour, in seconds since the epoch, of every page in the batch. */
    readonly hour: number;
    private touches = new Map<number, Touch>();
    /** Items whose earlier hour rows' cohorts must be marked changed (account, item). */
    private changedItems = new Map<string, { account: string; id: string }>();
    /** Cohorts the batch's rows joined: (league, cohort). */
    private cohorts = new Map<string, { league: string; id: string }>();
    private leagues = new Set<string>();
    private observed = new Set<number>();
    private revision = "";
    private definitions = new Map<string, unknown>();
    bytes = 0;

    constructor(state: EquipmentState, hour: number) {
        this.state = state;
        this.hour = hour;
    }

    private touch(slot: number) {
        let touch = this.touches.get(slot);
        if (!touch) {
            touch = {
                inDb: true,
                dbStash: this.state.stashId(slot),
                lastSeen: Number.NaN,
                removedAt: Number.NaN,
            };
            this.touches.set(slot, touch);
        }
        return touch;
    }

    /** Applies a page's equipment seen at `observedAt`, as `captureEquipmentPage` would. */
    applyPage(
        changes: readonly PublicStashChange[],
        classifier: EquipmentClassifier,
        observedAt: Date,
        onClassified?: OnClassified,
    ) {
        let captured = 0;
        for (const round of stashRounds(changes))
            captured += this.applyRound(round, classifier, observedAt, onClassified);
        return captured;
    }

    private applyRound(
        changes: readonly PublicStashChange[],
        classifier: EquipmentClassifier,
        observedAt: Date,
        onClassified?: OnClassified,
    ) {
        const state = this.state;
        const at = observedAt.getTime() * 1000;
        const revision = classifier.manifest.revision;
        this.revision = revision;
        const removed: number[] = [];
        // Keyed by account and item, so an item moved within the page keeps its last stash.
        const rows = new Map<string, EquipmentRow>();
        const touched: { stashId: string; account: string; league: string }[] = [];
        let captured = 0;
        for (const change of changes) {
            const active = state.stashSlots(change.id).filter((slot) => state.active[slot]);
            if (!change.public) {
                removed.push(...active);
                continue;
            }
            if (!change.accountName || !change.league) continue;
            const account = change.accountName.toLowerCase();
            const league = change.league;
            // Crafting base markets count merchant tabs only, so an other tab's equipment leaves them.
            const items = listingTab(change) === "merchant" ? change.items : [];
            const stashRows: EquipmentRow[] = [];
            for (const item of items) {
                if (!item.id || !classifier.acceptsBase(item.baseType)) continue;
                const { matches, unknown } = classifyItem(classifier, item);
                if (unknown.length) onClassified?.(item, { matches, unknown });
                if (!matches.length && !unknown.length) continue;
                const price = extractListingPrice(item, change.stash);
                stashRows.push(
                    equipmentRow(
                        {
                            account,
                            stashId: change.id,
                            league,
                            id: item.id,
                            matches,
                            unknown,
                            amount: price?.amount ?? null,
                            currency: price?.currency ?? null,
                            item,
                        },
                        revision,
                    ),
                );
            }
            captured += stashRows.length;
            const ids = new Map(
                items.flatMap((item) =>
                    item.id ? [[EquipmentState.idKeyOf(item.id), item] as const] : [],
                ),
            );
            const capturedIds = new Set(stashRows.map((row) => EquipmentState.idKeyOf(row.id)));
            for (const slot of active) {
                if (state.account(slot) !== account) continue;
                const key = state.idKey(slot);
                const item = ids.get(key);
                if (!item) removed.push(slot);
                else if (!capturedIds.has(key))
                    // A changed item which no longer belongs to a captured base must also leave its
                    // old cohorts.
                    stashRows.push(
                        equipmentRow(
                            {
                                account,
                                stashId: change.id,
                                league,
                                id: item.id!,
                                matches: [],
                                unknown: [],
                                amount: null,
                                currency: null,
                                item,
                            },
                            revision,
                        ),
                    );
            }
            if (!stashRows.length) continue;
            for (const row of stashRows) {
                const key = `${account}\n${row.id}`;
                rows.delete(key);
                rows.set(key, row);
            }
            touched.push({ stashId: change.id, account, league });
        }

        for (const slot of removed) {
            const touch = this.touch(slot);
            state.active[slot] = 0;
            touch.removedAt = at;
        }
        if (!rows.size) return captured;
        const all = [...rows.values()];
        for (const row of all) {
            this.changedItems.set(`${row.account}\n${row.id}`, {
                account: row.account,
                id: row.id,
            });
            for (const id of [...row.matches, ...row.unknown]) {
                this.cohorts.set(`${row.league}\n${id}`, { league: row.league, id });
                if (!this.definitions.has(id)) this.definitions.set(id, classifier.definition(id));
            }
        }
        const empty = new Set<number>();
        for (const row of all) {
            let slot = state.find(row.account, row.id);
            let touch: Touch;
            if (slot === NONE) {
                slot = state.add(
                    row.account,
                    row.id,
                    row.stashId,
                    state.nextEquipmentId,
                    row.digest,
                );
                touch = { inDb: false, lastSeen: at, removedAt: Number.NaN };
                this.touches.set(slot, touch);
                touch.row = row;
                this.bytes += JSON.stringify(row.item).length;
            } else {
                touch = this.touch(slot);
                if (state.stashId(slot) !== row.stashId || !state.digestEquals(slot, row.digest)) {
                    state.move(slot, row.stashId);
                    state.setDigest(slot, row.digest);
                    touch.row = row;
                    this.bytes += JSON.stringify(row.item).length;
                }
            }
            state.active[slot] = 1;
            touch.lastSeen = at;
            touch.removedAt = Number.NaN;
            if (!row.matches.length && !row.unknown.length) empty.add(slot);
        }
        // Each touched stash's active rows were all seen now: their hour rows take these values.
        for (const { stashId, account, league } of touched) {
            this.leagues.add(league);
            for (const slot of state.stashSlots(stashId))
                if (state.active[slot] && state.account(slot) === account) this.observed.add(slot);
        }
        // A row that left every cohort keeps its hour row and is removed.
        for (const slot of empty) {
            if (!state.active[slot]) continue;
            state.active[slot] = 0;
            this.touches.get(slot)!.removedAt = at;
        }
        return captured;
    }

    /** Writes the batch inside the caller's transaction. */
    async flush(conn: DuckDBConnection) {
        const state = this.state;
        const hour = this.hour;
        if (this.changedItems.size || this.cohorts.size) {
            // The cohorts these items left this hour, and the ones they joined. The hour rows are
            // read before this batch writes them.
            await conn.run(
                `CREATE OR REPLACE TEMP TABLE batch_cohort_hour AS
                WITH changed AS MATERIALIZED (
                    SELECT h.revision, h.league, h.observed_hour, h.matches, h.unknown_matches
                    FROM ps_equipment_hour h
                    JOIN json_each($1::JSON) j ON h.account_name = (j.value->>'account')
                        AND h.item_id = (j.value->>'id')
                    WHERE h.observed_hour = $2::BIGINT
                )
                SELECT revision, league, observed_hour AS hour, json_extract_string(c.value, '$') AS cohort_id
                FROM changed h, json_each(h.matches) c
                UNION SELECT revision, league, observed_hour, json_extract_string(c.value, '$')
                FROM changed h, json_each(h.unknown_matches) c
                UNION SELECT $3, value->>'league', $2::BIGINT, value->>'id' FROM json_each($4::JSON)`,
                [
                    JSON.stringify([...this.changedItems.values()]),
                    hour,
                    this.revision,
                    JSON.stringify([...this.cohorts.values()]),
                ],
            );
            const sameKey = `t.hour = ${hour} AND t.revision = c.revision AND t.league = c.league
                AND t.hour = c.hour AND t.cohort_id = c.cohort_id`;
            await conn.run(
                `UPDATE ps_equipment_cohort_hour t SET changed_at = current_timestamp
                FROM batch_cohort_hour c WHERE ${sameKey}`,
            );
            await conn.run(
                `INSERT INTO ps_equipment_cohort_hour
                SELECT revision, league, hour, cohort_id, current_timestamp FROM batch_cohort_hour c
                WHERE NOT EXISTS (SELECT 1 FROM ps_equipment_cohort_hour t WHERE ${sameKey})`,
            );
        }

        const states: unknown[] = [];
        const stayed: unknown[] = [];
        const moved: unknown[] = [];
        const inserts: unknown[] = [];
        for (const [slot, touch] of this.touches) {
            const equipmentId = state.equipmentId[slot]!;
            const lastSeen = Number.isNaN(touch.lastSeen) ? null : touch.lastSeen;
            const removedAt = state.active[slot] ? null : touch.removedAt;
            const values = touch.row && {
                equipmentId,
                account: touch.row.account,
                id: touch.row.id,
                stashId: touch.row.stashId,
                league: touch.row.league,
                matches: touch.row.matches,
                unknown: touch.row.unknown,
                amount: touch.row.amount,
                currency: touch.row.currency,
                item: touch.row.item,
                digest: touch.row.digest,
                lastSeen,
                removedAt,
            };
            if (!touch.inDb) inserts.push(values);
            else if (!values) states.push({ equipmentId, lastSeen, removedAt });
            else (touch.row!.stashId === touch.dbStash ? stayed : moved).push(values);
        }
        const byId = `(value->>'equipmentId')::BIGINT AS equipment_id,
            (value->>'lastSeen')::BIGINT AS last_seen, (value->>'removedAt')::BIGINT AS removed`;
        const times = `last_seen_at = coalesce(make_timestamp(v.last_seen), ps_equipment_listing.last_seen_at),
            removed_at = ${timestamp("v.removed")}`;
        for (let i = 0; i < states.length; i += NARROW_CHUNK)
            await conn.run(
                `UPDATE ps_equipment_listing SET ${times}
                FROM (SELECT ${byId} FROM json_each($1::JSON)) v
                WHERE ps_equipment_listing.equipment_id = v.equipment_id`,
                [JSON.stringify(states.slice(i, i + NARROW_CHUNK))],
            );
        // `stash_id` is indexed (ps_equipment_stash), and setting an indexed column rewrites the
        // row even when its value is unchanged, so only items that moved set it.
        for (const [rows, stashColumn] of [
            [stayed, ""],
            [moved, "stash_id = v.value->>'stashId',"],
        ] as const)
            for (let i = 0; i < rows.length; i += CHUNK)
                await conn.run(
                    `UPDATE ps_equipment_listing SET
                        ${stashColumn} league = v.value->>'league', revision = $1,
                        matches = v.value->'matches', unknown_matches = v.value->'unknown',
                        price_amount = (v.value->>'amount')::DOUBLE, price_currency = v.value->>'currency',
                        raw_item = v.value->'item', content_digest = v.value->>'digest', ${times}
                    FROM (SELECT ${byId}, value FROM json_each($2::JSON)) v
                    WHERE ps_equipment_listing.equipment_id = v.equipment_id`,
                    [this.revision, JSON.stringify(rows.slice(i, i + CHUNK))],
                );
        for (let i = 0; i < inserts.length; i += CHUNK)
            await conn.run(
                `INSERT INTO ps_equipment_listing BY NAME
                SELECT value->>'account' AS account_name, value->>'id' AS item_id,
                    value->>'stashId' AS stash_id, value->>'league' AS league, $1 AS revision,
                    value->'matches' AS matches, value->'unknown' AS unknown_matches,
                    (value->>'amount')::DOUBLE AS price_amount, value->>'currency' AS price_currency,
                    value->'item' AS raw_item,
                    make_timestamp((value->>'lastSeen')::BIGINT) AS last_seen_at,
                    ${timestamp("value->>'removedAt'")} AS removed_at,
                    value->>'digest' AS content_digest,
                    (value->>'equipmentId')::BIGINT AS equipment_id
                FROM json_each($2::JSON)`,
                [this.revision, JSON.stringify(inserts.slice(i, i + CHUNK))],
            );

        if (this.observed.size) {
            await conn.run(
                `CREATE OR REPLACE TEMP TABLE batch_equipment AS
                SELECT * EXCLUDE (raw_item, removed_at, content_digest, equipment_id)
                FROM ps_equipment_listing
                WHERE equipment_id IN (SELECT value::BIGINT FROM json_each($1::JSON))`,
                [JSON.stringify([...this.observed].map((slot) => state.equipmentId[slot]))],
            );
            const sameRow = `h.observed_hour = ${hour} AND h.account_name = e.account_name
                AND h.item_id = e.item_id AND h.revision = e.revision`;
            await conn.run(
                `UPDATE ps_equipment_hour h SET league = e.league, stash_id = e.stash_id,
                    matches = e.matches, unknown_matches = e.unknown_matches,
                    price_amount = e.price_amount, price_currency = e.price_currency,
                    last_seen_at = e.last_seen_at
                FROM batch_equipment e WHERE ${sameRow}`,
            );
            await conn.run(
                `INSERT INTO ps_equipment_hour BY NAME
                SELECT *, ${hour}::BIGINT AS observed_hour FROM batch_equipment e
                WHERE NOT EXISTS (SELECT 1 FROM ps_equipment_hour h WHERE ${sameRow})`,
            );
        }
        if (this.definitions.size)
            await conn.run(
                `INSERT INTO ps_equipment_cohort
                SELECT value->>'revision', value->>'id', value FROM json_each($1::JSON)
                WHERE NOT EXISTS (SELECT 1 FROM ps_equipment_cohort c
                    WHERE c.revision = (value->>'revision') AND c.cohort_id = (value->>'id'))`,
                [JSON.stringify([...this.definitions.values()])],
            );
        // Replaying a corrected hour also changes later windows which included it.
        if (this.leagues.size)
            await conn.run(
                `UPDATE ps_equipment_cohort_hour SET changed_at = current_timestamp
                WHERE league IN (SELECT json_extract_string(value, '$') FROM json_each($2::JSON))
                    AND hour > $1 AND hour <= $1 + 23 * 3600`,
                [hour, JSON.stringify([...this.leagues])],
            );
    }
}
