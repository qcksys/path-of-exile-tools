import { readFile } from "node:fs/promises";
import type { DuckDBConnection } from "@duckdb/node-api";
import type { PublicStashChange } from "@poe-tools/api-client";
import { normalizeApiItem } from "@poe-tools/item-query";
import { compileMarketCohorts, marketCohortManifestSchema } from "@poe-tools/market";
import { params, stashRounds } from "#src/ps/rounds.ts";
import { queryAll } from "#src/shared/db.ts";
import { extractListingPrice } from "#src/shared/price.ts";

export type EquipmentClassifier = ReturnType<typeof compileMarketCohorts>;
type Item = PublicStashChange["items"][number];
type OnClassified = (
    item: Item,
    classification: ReturnType<EquipmentClassifier["classify"]>,
) => void;

interface EquipmentRow {
    account: string;
    stashId: string;
    league: string;
    id: string;
    matches: string[];
    unknown: string[];
    amount: number | null;
    currency: string | null;
    item: Item;
}

let defaults: Promise<EquipmentClassifier> | undefined;
export function defaultEquipmentClassifier() {
    defaults ??= readFile(
        new URL(import.meta.resolve("@poe-tools/market/cohorts-poe1.json")),
        "utf8",
    ).then((text) => compileMarketCohorts(marketCohortManifestSchema.parse(JSON.parse(text))));
    return defaults;
}

export function captureEquipment(
    conn: DuckDBConnection,
    change: PublicStashChange,
    classifier: EquipmentClassifier,
    observedAt: Date,
    onClassified?: OnClassified,
) {
    return captureEquipmentPage(conn, [change], classifier, observedAt, onClassified);
}

/** Captures a page's equipment with a fixed number of statements; see `applyStashChanges`. */
export async function captureEquipmentPage(
    conn: DuckDBConnection,
    changes: readonly PublicStashChange[],
    classifier: EquipmentClassifier,
    observedAt: Date,
    onClassified?: OnClassified,
) {
    let captured = 0;
    for (const round of stashRounds(changes))
        captured += await captureRound(conn, round, classifier, observedAt, onClassified);
    return captured;
}

async function captureRound(
    conn: DuckDBConnection,
    changes: readonly PublicStashChange[],
    classifier: EquipmentClassifier,
    observedAt: Date,
    onClassified?: OnClassified,
) {
    const time = observedAt.toISOString();
    const hour = Math.floor(observedAt.getTime() / 3_600_000) * 3600;
    const revision = classifier.manifest.revision;
    const stashIds = changes.map((change) => change.id);
    const known = await queryAll<{
        rowId: string;
        account: string;
        stashId: string;
        itemId: string;
    }>(
        conn,
        // DuckDB index-scans only while the stash is the scan's sole filter.
        `WITH stash AS MATERIALIZED (
            SELECT rowid AS row_id, account_name, stash_id, item_id, removed_at
            FROM ps_equipment_listing WHERE stash_id IN (${params(stashIds)})
        )
        SELECT row_id::VARCHAR AS "rowId", account_name AS account, stash_id AS "stashId",
            item_id AS "itemId"
        FROM stash WHERE removed_at IS NULL`,
        stashIds,
    );
    const activeByStash = Map.groupBy(known, (row) => row.stashId);
    const removed: string[] = [];
    // Keyed by account and item, so an item moved within the page keeps its last stash.
    const rows = new Map<string, EquipmentRow>();
    const touched: { stashId: string; account: string; league: string }[] = [];
    let captured = 0;
    for (const change of changes) {
        const active = activeByStash.get(change.id) ?? [];
        if (!change.public) {
            removed.push(...active.map((row) => row.rowId));
            continue;
        }
        if (!change.accountName || !change.league) continue;
        const account = change.accountName.toLowerCase();
        const league = change.league;
        const stashRows: EquipmentRow[] = [];
        for (const item of change.items) {
            if (!item.id || !classifier.acceptsBase(item.baseType)) continue;
            const { matches, unknown } = classifier.classify(
                normalizeApiItem("poe1", "stash", item),
            );
            if (unknown.length) onClassified?.(item, { matches, unknown });
            if (!matches.length && !unknown.length) continue;
            const price = extractListingPrice(item, change.stash);
            stashRows.push({
                account,
                stashId: change.id,
                league,
                id: item.id,
                matches,
                unknown,
                amount: price?.amount ?? null,
                currency: price?.currency ?? null,
                item,
            });
        }
        captured += stashRows.length;
        const ids = new Set(change.items.flatMap((item) => (item.id ? [item.id] : [])));
        const capturedIds = new Set(stashRows.map((row) => row.id));
        for (const row of active) {
            if (row.account !== account) continue;
            if (!ids.has(row.itemId)) removed.push(row.rowId);
            else if (!capturedIds.has(row.itemId)) {
                // A changed item which no longer belongs to a captured base must also leave its
                // old cohorts.
                const item = change.items.find((candidate) => candidate.id === row.itemId)!;
                stashRows.push({
                    account,
                    stashId: change.id,
                    league,
                    id: row.itemId,
                    matches: [],
                    unknown: [],
                    amount: null,
                    currency: null,
                    item,
                });
            }
        }
        if (!stashRows.length) continue;
        for (const row of stashRows) {
            const key = `${account}\n${row.id}`;
            rows.delete(key);
            rows.set(key, row);
        }
        touched.push({ stashId: change.id, account, league });
    }

    if (removed.length) {
        await conn.run(
            `UPDATE ps_equipment_listing SET removed_at = $1::TIMESTAMP
            WHERE rowid IN (SELECT value::BIGINT FROM json_each($2::JSON))`,
            [time, JSON.stringify(removed)],
        );
    }
    if (!rows.size) return captured;
    const all = [...rows.values()];
    const cohorts = [
        ...new Map(
            all.flatMap((row) =>
                [...row.matches, ...row.unknown].map((id) => [
                    `${row.league}\n${id}`,
                    { league: row.league, id },
                ]),
            ),
        ).values(),
    ];

    // The cohorts these items left this hour, and the ones they now join. Existing hours are
    // touched in place: replacing their keys would churn the index.
    const cohortHours = `WITH changed AS MATERIALIZED (
            SELECT h.revision, h.league, h.observed_hour, h.matches, h.unknown_matches
            FROM ps_equipment_hour h
            JOIN json_each($1::JSON) j ON h.account_name = (j.value->>'account')
                AND h.item_id = (j.value->>'id')
            WHERE h.observed_hour = $2::BIGINT
        ), cohorts AS (
            SELECT revision, league, observed_hour AS hour, json_extract_string(c.value, '$') AS cohort_id
            FROM changed h, json_each(h.matches) c
            UNION SELECT revision, league, observed_hour, json_extract_string(c.value, '$')
            FROM changed h, json_each(h.unknown_matches) c
            UNION SELECT $3, value->>'league', $2::BIGINT, value->>'id' FROM json_each($4::JSON)
        )`;
    const cohortParams = [
        JSON.stringify(all.map((row) => ({ account: row.account, id: row.id }))),
        hour,
        revision,
        JSON.stringify(cohorts),
    ];
    const sameKey = `t.hour = $2::BIGINT AND t.revision = c.revision AND t.league = c.league
        AND t.hour = c.hour AND t.cohort_id = c.cohort_id`;
    await conn.run(
        `UPDATE ps_equipment_cohort_hour t SET changed_at = current_timestamp
        FROM (${cohortHours} SELECT * FROM cohorts) c WHERE ${sameKey}`,
        cohortParams,
    );
    await conn.run(
        `INSERT INTO ps_equipment_cohort_hour ${cohortHours}
        SELECT revision, league, hour, cohort_id, current_timestamp FROM cohorts c
        WHERE NOT EXISTS (SELECT 1 FROM ps_equipment_cohort_hour t WHERE ${sameKey})`,
        cohortParams,
    );

    // Items keep their row when they move between stashes, so look them up by ID.
    const itemIds = all.map((row) => row.id);
    const existing = new Map(
        (
            await queryAll<{ rowId: string; account: string; itemId: string }>(
                conn,
                `SELECT rowid::VARCHAR AS "rowId", account_name AS account, item_id AS "itemId"
                FROM ps_equipment_listing WHERE item_id IN (${params(itemIds)})`,
                itemIds,
            )
        ).map((row) => [`${row.account}\n${row.itemId}`, row.rowId]),
    );
    const updates = all.flatMap((row) => {
        const rowId = existing.get(`${row.account}\n${row.id}`);
        return rowId ? [{ ...row, rowId }] : [];
    });
    const inserts = all.filter((row) => !existing.has(`${row.account}\n${row.id}`));
    if (updates.length) {
        await conn.run(
            `UPDATE ps_equipment_listing SET
                stash_id = v.value->>'stashId', league = v.value->>'league', revision = $2,
                matches = v.value->'matches', unknown_matches = v.value->'unknown',
                price_amount = (v.value->>'amount')::DOUBLE, price_currency = v.value->>'currency',
                raw_item = v.value->'item', last_seen_at = $1::TIMESTAMP, removed_at = NULL
            FROM (SELECT (value->>'rowId')::BIGINT AS row_id, value FROM json_each($3::JSON)) v
            WHERE ps_equipment_listing.rowid = v.row_id`,
            [time, revision, JSON.stringify(updates)],
        );
    }
    if (inserts.length) {
        await conn.run(
            `INSERT INTO ps_equipment_listing
            SELECT value->>'account', value->>'id', value->>'stashId', value->>'league', $2,
                value->'matches', value->'unknown', (value->>'amount')::DOUBLE,
                value->>'currency', value->'item', $1::TIMESTAMP, NULL
            FROM json_each($3::JSON)`,
            [time, revision, JSON.stringify(inserts)],
        );
    }

    // Active rows were all seen now; replace their observations within this hour.
    const touchedIds = touched.map((stash) => stash.stashId);
    await conn.run(
        `CREATE OR REPLACE TEMP TABLE page_equipment AS
        WITH stash AS MATERIALIZED (
            SELECT rowid AS row_id, * FROM ps_equipment_listing
            WHERE stash_id IN (${params(touchedIds, 2)})
        )
        SELECT stash.* EXCLUDE (raw_item, removed_at) FROM stash
        JOIN json_each($1::JSON) j ON stash.stash_id = (j.value->>'stashId')
            AND stash.account_name = (j.value->>'account')
        WHERE stash.removed_at IS NULL`,
        [JSON.stringify(touched), ...touchedIds],
    );
    await conn.run(
        `DELETE FROM ps_equipment_hour h USING page_equipment e
        WHERE h.observed_hour = $1 AND h.account_name = e.account_name
            AND h.item_id = e.item_id AND h.revision = e.revision`,
        [hour],
    );
    await conn.run(
        `INSERT INTO ps_equipment_hour BY NAME
        SELECT * EXCLUDE (row_id), epoch(date_trunc('hour', last_seen_at))::BIGINT AS observed_hour
        FROM page_equipment`,
    );
    if (cohorts.length) {
        await conn.run(
            `INSERT INTO ps_equipment_cohort
            SELECT value->>'revision', value->>'id', value FROM json_each($1::JSON)
            WHERE NOT EXISTS (SELECT 1 FROM ps_equipment_cohort c
                WHERE c.revision = (value->>'revision') AND c.cohort_id = (value->>'id'))`,
            [
                JSON.stringify([
                    ...new Map(
                        cohorts.map(({ id }) => [id, classifier.definition(id)] as const),
                    ).values(),
                ]),
            ],
        );
    }
    await conn.run(
        `UPDATE ps_equipment_listing SET removed_at = $1::TIMESTAMP
        WHERE rowid IN (SELECT row_id FROM page_equipment
            WHERE json_array_length(matches) = 0 AND json_array_length(unknown_matches) = 0)`,
        [time],
    );
    // Replaying a corrected hour also changes later windows which included it.
    const leagues = [...new Set(touched.map((stash) => stash.league))];
    await conn.run(
        `UPDATE ps_equipment_cohort_hour SET changed_at = current_timestamp
        WHERE league IN (${params(leagues, 2)}) AND hour > $1 AND hour <= $1 + 23 * 3600`,
        [hour, ...leagues],
    );
    return captured;
}
