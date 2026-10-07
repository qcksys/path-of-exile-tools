import { readFile } from "node:fs/promises";
import type { DuckDBConnection } from "@duckdb/node-api";
import type { PublicStashChange } from "@poe-tools/api-client";
import { normalizeApiItem } from "@poe-tools/item-query";
import { compileMarketCohorts, marketCohortManifestSchema } from "@poe-tools/market";
import { queryAll } from "#src/shared/db.ts";
import { extractListingPrice } from "#src/shared/price.ts";

export type EquipmentClassifier = ReturnType<typeof compileMarketCohorts>;
let defaults: Promise<EquipmentClassifier> | undefined;
export function defaultEquipmentClassifier() {
    defaults ??= readFile(
        new URL(import.meta.resolve("@poe-tools/market/cohorts-poe1.json")),
        "utf8",
    ).then((text) => compileMarketCohorts(marketCohortManifestSchema.parse(JSON.parse(text))));
    return defaults;
}

export async function captureEquipment(
    conn: DuckDBConnection,
    change: PublicStashChange,
    classifier: EquipmentClassifier,
    observedAt: Date,
) {
    const time = observedAt.toISOString();
    if (!change.public) {
        await conn.run(
            "UPDATE ps_equipment_listing SET removed_at = $2::TIMESTAMP WHERE stash_id = $1 AND removed_at IS NULL",
            [change.id, time],
        );
        return 0;
    }
    if (!change.accountName || !change.league) return 0;
    const account = change.accountName.toLowerCase();
    const rows = [];
    for (const item of change.items) {
        if (!item.id || !classifier.acceptsBase(item.baseType)) continue;
        const { matches, unknown } = classifier.classify(normalizeApiItem("poe1", "stash", item));
        if (!matches.length && !unknown.length) continue;
        const price = extractListingPrice(item, change.stash);
        rows.push({
            id: item.id,
            matches,
            unknown,
            amount: price?.amount ?? null,
            currency: price?.currency ?? null,
            item,
        });
    }
    const captured = rows.length;
    const ids = change.items.flatMap((item) => (item.id ? [item.id] : []));
    await conn.run(
        `UPDATE ps_equipment_listing SET removed_at = $3::TIMESTAMP
        WHERE account_name = $1 AND stash_id = $2 AND removed_at IS NULL
        AND item_id NOT IN (SELECT json_extract_string(value, '$') FROM json_each($4::JSON))`,
        [account, change.id, time, JSON.stringify(ids)],
    );
    // A changed item which no longer belongs to a captured base must also leave its old cohorts.
    const capturedIds = rows.map((row) => row.id);
    const obsolete = await queryAll<{ itemId: string }>(
        conn,
        `SELECT item_id AS "itemId" FROM ps_equipment_listing
        WHERE account_name = $1 AND stash_id = $2 AND removed_at IS NULL
        AND item_id NOT IN (SELECT json_extract_string(value, '$') FROM json_each($3::JSON))`,
        [account, change.id, JSON.stringify(capturedIds)],
    );
    for (const { itemId } of obsolete) {
        const item = change.items.find((candidate) => candidate.id === itemId);
        if (item)
            rows.push({ id: itemId, matches: [], unknown: [], amount: null, currency: null, item });
    }
    if (!rows.length) return 0;
    const hour = Math.floor(observedAt.getTime() / 3_600_000) * 3600;
    await conn.run(
        `INSERT OR REPLACE INTO ps_equipment_cohort_hour
        SELECT DISTINCT revision, league, observed_hour, json_extract_string(c.value, '$'), current_timestamp
        FROM ps_equipment_hour h, json_each(h.matches) c
        WHERE account_name = $1 AND observed_hour = $2
        AND item_id IN (SELECT value->>'id' FROM json_each($3::JSON))`,
        [account, hour, JSON.stringify(rows)],
    );
    await conn.run(
        `INSERT OR REPLACE INTO ps_equipment_cohort_hour
        SELECT DISTINCT revision, league, observed_hour, json_extract_string(c.value, '$'), current_timestamp
        FROM ps_equipment_hour h, json_each(h.unknown_matches) c
        WHERE account_name = $1 AND observed_hour = $2
        AND item_id IN (SELECT value->>'id' FROM json_each($3::JSON))`,
        [account, hour, JSON.stringify(rows)],
    );
    await conn.run(
        `INSERT INTO ps_equipment_listing
        SELECT $1, value->>'id', $2, $3, $4, value->'matches', value->'unknown',
            (value->>'amount')::DOUBLE, value->>'currency', value->'item', $5::TIMESTAMP, NULL
        FROM json_each($6::JSON)
        ON CONFLICT (account_name, item_id) DO UPDATE SET
            stash_id = excluded.stash_id, league = excluded.league, revision = excluded.revision,
            matches = excluded.matches, unknown_matches = excluded.unknown_matches,
            price_amount = excluded.price_amount, price_currency = excluded.price_currency,
            raw_item = excluded.raw_item, last_seen_at = excluded.last_seen_at, removed_at = NULL`,
        [
            account,
            change.id,
            change.league,
            classifier.manifest.revision,
            time,
            JSON.stringify(rows),
        ],
    );
    await conn.run(
        `INSERT OR REPLACE INTO ps_equipment_hour BY NAME
        SELECT * EXCLUDE (raw_item, removed_at), epoch(date_trunc('hour', last_seen_at))::BIGINT AS observed_hour
        FROM ps_equipment_listing WHERE account_name = $1 AND stash_id = $2 AND removed_at IS NULL`,
        [account, change.id],
    );
    const cohorts = [...new Set(rows.flatMap((row) => [...row.matches, ...row.unknown]))];
    if (cohorts.length) {
        await conn.run(
            `INSERT INTO ps_equipment_cohort
            SELECT value->>'revision', value->>'id', value FROM json_each($1::JSON)
            ON CONFLICT DO NOTHING`,
            [JSON.stringify(cohorts.map((id) => classifier.definition(id)))],
        );
        await conn.run(
            `INSERT OR REPLACE INTO ps_equipment_cohort_hour
        SELECT $1, $2, $3, json_extract_string(value, '$'), current_timestamp FROM json_each($4::JSON)`,
            [classifier.manifest.revision, change.league, hour, JSON.stringify(cohorts)],
        );
    }
    await conn.run(
        `UPDATE ps_equipment_listing SET removed_at = $3::TIMESTAMP
        WHERE account_name = $1 AND stash_id = $2 AND removed_at IS NULL
        AND json_array_length(matches) = 0 AND json_array_length(unknown_matches) = 0`,
        [account, change.id, time],
    );
    // Replaying a corrected hour also changes later windows which included it.
    await conn.run(
        `UPDATE ps_equipment_cohort_hour SET changed_at = current_timestamp
        WHERE league = $1 AND hour > $2 AND hour <= $2 + 23 * 3600`,
        [change.league, hour],
    );
    return captured;
}
