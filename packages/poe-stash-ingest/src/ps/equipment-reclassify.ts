import { gunzipSync } from "node:zlib";
import type { DuckDBConnection } from "@duckdb/node-api";
import type { PublicStashPage } from "@poe-tools/api-client";
import { normalizeApiItem } from "@poe-tools/item-query";
import { defaultEquipmentClassifier, type EquipmentClassifier } from "#src/ps/equipment.ts";
import { fingerprintHash } from "#src/ps/replay-fingerprint.ts";
import { queryAll, withTransaction } from "#src/shared/db.ts";
import { extractListingPrice } from "#src/shared/price.ts";
import { assertSourceRealm } from "#src/shared/source.ts";

export async function reclassifyArchivedEquipment(
    conn: DuckDBConnection,
    opts: {
        realm: string;
        league: string;
        classifier?: EquipmentClassifier;
        completedBefore?: number;
        limitPages?: number;
    },
) {
    const currentHour = Math.floor(Date.now() / 3_600_000) * 3600;
    const cutoff = opts.completedBefore ?? currentHour;
    const limit = opts.limitPages ?? 1;
    if (!Number.isSafeInteger(cutoff) || cutoff < 0 || cutoff % 3600 || cutoff > currentHour)
        throw new Error("The cutoff must be a completed UTC hour boundary.");
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10)
        throw new Error("limitPages must be an integer from 1 to 10.");
    if (!["pc", "xbox", "sony"].includes(opts.realm))
        throw new Error("This realm does not support archived equipment capture.");
    await assertSourceRealm(conn, opts.realm);
    const [source] = await queryAll<{ value: string }>(
        conn,
        "SELECT value FROM pipeline_config WHERE key = 'source'",
    );
    if (!source || (JSON.parse(source.value).league ?? "all") !== opts.league)
        throw new Error("The archive league scope must match this database's configured source.");
    const classifier = opts.classifier ?? (await defaultEquipmentClassifier());
    const revision = classifier.manifest.revision;
    const scope = [revision, opts.league];
    await withTransaction(conn, async () => {
        await conn.run(
            `DELETE FROM ps_equipment_reclassify_hour h
            WHERE ($2 = 'all' OR h.league = $2) AND EXISTS (
                SELECT 1 FROM ps_equipment_reclassify s
                WHERE s.revision = h.revision AND s.hour = h.observed_hour AND s.league = $2
                    AND NOT s.completed AND (s.revision <> $1 OR s.hour < $3)
            )`,
            [...scope, Math.max(0, cutoff - 24 * 3600)],
        );
        await conn.run(
            `DELETE FROM ps_equipment_reclassify WHERE league = $2
            AND NOT completed AND (revision <> $1 OR hour < $3)`,
            [...scope, Math.max(0, cutoff - 24 * 3600)],
        );
    });
    async function nextHour() {
        const [row] = await queryAll<{ hour: number }>(
            conn,
            `
            WITH hours AS (
                SELECT (floor(captured_at / 3600000) * 3600)::DOUBLE AS hour
                FROM ps_capture_page
                WHERE realm = $1 AND league = $2 AND processed_at IS NOT NULL
                    AND captured_at >= $3 AND captured_at < $4
                GROUP BY hour HAVING bool_or(equipment_revision IS DISTINCT FROM $5)
            ) SELECT h.hour FROM hours h LEFT JOIN ps_equipment_reclassify s
                ON s.revision = $5 AND s.league = $2 AND s.hour = h.hour
            WHERE NOT coalesce(s.completed, FALSE) ORDER BY h.hour DESC LIMIT 1`,
            [
                opts.realm,
                opts.league,
                Math.max(0, cutoff - 24 * 3600) * 1000,
                cutoff * 1000,
                revision,
            ],
        );
        return row?.hour;
    }
    let pages = 0;
    const completedHours: number[] = [];
    while (pages < limit) {
        const hour = await nextHour();
        if (hour === undefined) break;
        await withTransaction(conn, async () => {
            const [state] = await queryAll<{ afterTime: number; afterId: string }>(
                conn,
                `SELECT after_time::DOUBLE AS afterTime, after_id AS afterId
                FROM ps_equipment_reclassify WHERE revision = $1 AND league = $2 AND hour = $3`,
                [...scope, hour],
            );
            if (!state) {
                await conn.run(
                    "INSERT INTO ps_equipment_reclassify VALUES ($1, $2, $3, -1, '', FALSE)",
                    [...scope, hour],
                );
                await conn.run(
                    `INSERT INTO ps_equipment_reclassify_hour
                    SELECT * FROM ps_equipment_hour WHERE revision = $1 AND observed_hour = $3
                    AND ($2 = 'all' OR league = $2)`,
                    [...scope, hour],
                );
            }
            const [page] = await queryAll<{
                id: string;
                capturedAt: number;
                responseHash: string;
                remaining: number;
            }>(
                conn,
                `
                SELECT c.id, c.captured_at::DOUBLE AS capturedAt, c.response_hash AS responseHash,
                    count(*) OVER ()::DOUBLE AS remaining
                FROM ps_capture_page c
                WHERE c.realm = $1 AND c.league = $2 AND c.processed_at IS NOT NULL
                    AND c.captured_at >= $3 AND c.captured_at < $4
                    AND (c.captured_at > $5 OR (c.captured_at = $5 AND c.id > $6))
                ORDER BY c.captured_at, c.id LIMIT 1`,
                [
                    opts.realm,
                    opts.league,
                    hour * 1000,
                    (hour + 3600) * 1000,
                    state?.afterTime ?? -1,
                    state?.afterId ?? "",
                ],
            );
            if (!page) throw new Error("The archived hour changed during reclassification.");
            let [source] = await queryAll<{ body: string }>(
                conn,
                "SELECT to_base64(response_gzip) AS body FROM ps_capture_payload WHERE response_hash = $1",
                [page.responseHash],
            );
            if (!source) {
                // The expression bypasses an ART index that may omit an intact row.
                [source] = await queryAll<{ body: string }>(
                    conn,
                    "SELECT to_base64(response_gzip) AS body FROM ps_capture_payload WHERE (response_hash || '') = $1",
                    [page.responseHash],
                );
                if (source)
                    console.warn(
                        "Archived payload found by sequential fallback after an index miss.",
                    );
            }
            if (!source) throw new Error("The archived payload is missing.");
            const payload = JSON.parse(
                gunzipSync(Buffer.from(source.body, "base64"), {
                    maxOutputLength: 64 * 1024 * 1024,
                }).toString("utf8"),
            ) as PublicStashPage;
            if (fingerprintHash(payload) !== page.responseHash)
                throw new Error("The archived payload does not match its recorded hash.");
            const rows = [];
            for (const stash of payload.stashes) {
                // Withdrawals retain earlier asking observations, as live capture does.
                if (!stash.public || !stash.accountName || !stash.league) continue;
                if (opts.league !== "all" && stash.league !== opts.league) continue;
                for (const item of stash.items) {
                    if (!item.id) continue;
                    const result = classifier.acceptsBase(item.baseType)
                        ? classifier.classify(normalizeApiItem("poe1", "stash", item))
                        : { matches: [], unknown: [] };
                    const price =
                        result.matches.length || result.unknown.length
                            ? extractListingPrice(item, stash.stash)
                            : null;
                    rows.push({
                        account: stash.accountName.toLowerCase(),
                        id: item.id,
                        stash: stash.id,
                        league: stash.league,
                        ...result,
                        amount: price?.amount ?? null,
                        currency: price?.currency ?? null,
                    });
                }
            }
            await conn.run(
                `INSERT INTO ps_equipment_reclassify_hour
                SELECT value->>'account', value->>'id', value->>'stash', value->>'league', $1,
                    value->'matches', value->'unknown', (value->>'amount')::DOUBLE,
                    value->>'currency', $3::TIMESTAMP, $4
                FROM json_each($2::JSON)
                WHERE json_array_length(value->'matches') > 0 OR json_array_length(value->'unknown') > 0
                    OR EXISTS (SELECT 1 FROM ps_equipment_reclassify_hour h WHERE h.revision = $1
                        AND h.observed_hour = $4 AND h.account_name = (value->>'account') AND h.item_id = (value->>'id'))
                ON CONFLICT (account_name, item_id, revision, observed_hour) DO UPDATE SET
                    stash_id = excluded.stash_id, league = excluded.league, matches = excluded.matches,
                    unknown_matches = excluded.unknown_matches, price_amount = excluded.price_amount,
                    price_currency = excluded.price_currency, last_seen_at = excluded.last_seen_at
                WHERE excluded.last_seen_at >= ps_equipment_reclassify_hour.last_seen_at`,
                [revision, JSON.stringify(rows), new Date(page.capturedAt).toISOString(), hour],
            );
            await conn.run(
                `UPDATE ps_equipment_reclassify SET after_time = $4, after_id = $5
                WHERE revision = $1 AND league = $2 AND hour = $3`,
                [...scope, hour, page.capturedAt, page.id],
            );
            if (page.remaining === 1) {
                await publishHour(conn, classifier, opts.league, hour);
                completedHours.push(hour);
            }
            pages++;
        });
    }
    return {
        revision,
        pages,
        hours: completedHours.length,
        completedHours,
        pending: (await nextHour()) !== undefined,
    };
}

async function publishHour(
    conn: DuckDBConnection,
    classifier: EquipmentClassifier,
    league: string,
    hour: number,
) {
    const revision = classifier.manifest.revision;
    const scope = [revision, league, hour];
    const cohorts = await queryAll<{ league: string; id: string }>(
        conn,
        `
        SELECT league, cohort_id AS id FROM ps_equipment_cohort_hour
        WHERE revision = $1 AND ($2 = 'all' OR league = $2) AND hour = $3
        UNION
        SELECT h.league, json_extract_string(c.value, '$') AS id
        FROM ps_equipment_reclassify_hour h, json_each(h.unknown_matches) c
        WHERE h.revision = $1 AND ($2 = 'all' OR h.league = $2) AND h.observed_hour = $3
        UNION
        SELECT h.league, json_extract_string(c.value, '$') AS id
        FROM ps_equipment_reclassify_hour h, json_each(h.matches) c
        WHERE h.revision = $1 AND ($2 = 'all' OR h.league = $2) AND h.observed_hour = $3`,
        scope,
    );
    const definitions = [...new Set(cohorts.map((row) => row.id))].map((id) => {
        const definition = classifier.definition(id);
        if (!definition)
            throw new Error("The archived hour refers to a missing cohort definition.");
        return definition;
    });
    await conn.run(
        `INSERT INTO ps_equipment_cohort
        SELECT value->>'revision', value->>'id', value FROM json_each($1::JSON) ON CONFLICT DO NOTHING`,
        [JSON.stringify(definitions)],
    );
    await conn.run(
        `DELETE FROM ps_equipment_hour WHERE revision = $1
        AND ($2 = 'all' OR league = $2) AND observed_hour = $3`,
        scope,
    );
    await conn.run(
        `INSERT INTO ps_equipment_hour SELECT * FROM ps_equipment_reclassify_hour
        WHERE revision = $1 AND ($2 = 'all' OR league = $2) AND observed_hour = $3`,
        scope,
    );
    await conn.run(
        `INSERT OR REPLACE INTO ps_equipment_cohort_hour
        SELECT DISTINCT $1, value->>'league', $2, value->>'id', current_timestamp FROM json_each($3::JSON)`,
        [revision, hour, JSON.stringify(cohorts)],
    );
    await conn.run(
        `UPDATE ps_equipment_cohort_hour SET changed_at = current_timestamp
        WHERE revision = $3 AND hour > $1 AND hour <= $1 + 23 * 3600
            AND league IN (SELECT value->>'league' FROM json_each($2::JSON))`,
        [hour, JSON.stringify(cohorts), revision],
    );
    await conn.run(
        `UPDATE ps_equipment_reclassify SET completed = TRUE
        WHERE revision = $1 AND league = $2 AND hour = $3`,
        scope,
    );
    await conn.run(
        `DELETE FROM ps_equipment_reclassify_hour WHERE revision = $1
        AND ($2 = 'all' OR league = $2) AND observed_hour = $3`,
        scope,
    );
}
