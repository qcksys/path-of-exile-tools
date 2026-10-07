import type { DuckDBConnection } from "@duckdb/node-api";
import {
    askingPriceConfidence,
    type CohortHourly,
    cohortHourlySchema,
    marketCohortDefinitionSchema,
} from "@poe-tools/market";
import { REALM } from "#src/shared/auth.ts";
import { queryAll } from "#src/shared/db.ts";
import { push } from "#src/shared/remote/push.ts";
import { assertSourceRealm } from "#src/shared/source.ts";

export async function equipmentHourly(
    conn: DuckDBConnection,
    hour: number,
    league: string | null,
    realm = "pc",
): Promise<CohortHourly[]> {
    const rows = await equipmentRange(conn, hour, league, realm, 1);
    for (const hours of [6, 24] as const) {
        const wider = await equipmentRange(conn, hour, league, realm, hours);
        const byCohort = new Map(
            wider.map((row) => [JSON.stringify([row.revision, row.league, row.cohortId]), row]),
        );
        for (const row of rows) {
            const range = byCohort.get(JSON.stringify([row.revision, row.league, row.cohortId]));
            for (const [currency, price] of Object.entries(row.prices)) {
                const summary = range?.prices[currency]?.windows?.[hours];
                if (summary) {
                    price.windows ??= {};
                    price.windows[hours] = summary;
                }
            }
        }
    }
    return rows.map((row) => cohortHourlySchema.parse(row));
}

async function equipmentRange(
    conn: DuckDBConnection,
    hour: number,
    league: string | null,
    realm: string,
    hours: 1 | 6 | 24,
): Promise<CohortHourly[]> {
    const aggregates = await queryAll<{
        revision: string;
        league: string;
        cohortId: string;
        listingCount: number;
        uniqueSellers: number;
        unknownCount: number;
        currency: string | null;
        count: number | null;
        sellers: number | null;
        min: number | null;
        median: number | null;
        max: number | null;
        hourlyMedianMin: number | null;
        hourlyMedianMax: number | null;
        firstSeenAt: string | null;
        lastSeenAt: string | null;
    }>(
        conn,
        `WITH source AS (
        SELECT * FROM ps_equipment_hour
        WHERE observed_hour BETWEEN $1 - ($3 - 1) * 3600 AND $1 AND ($2 IS NULL OR league = $2)
    ), coverage AS (
        SELECT revision, league FROM source GROUP BY revision, league
        HAVING count(DISTINCT observed_hour) = $3
    ), recent AS (
        SELECT * FROM source
        QUALIFY row_number() OVER (
            PARTITION BY revision, league, account_name, item_id ORDER BY observed_hour DESC
        ) = 1
    ), hourly_prices AS (
        SELECT revision, league, json_extract_string(c.value, '$') AS cohort_id,
            price_currency, observed_hour, median(price_amount) AS median
        FROM source h, json_each(h.matches) c
        WHERE price_amount > 0 AND price_currency IS NOT NULL
        GROUP BY revision, league, cohort_id, price_currency, observed_hour
    ), movement AS (
        SELECT revision, league, cohort_id, price_currency,
            min(median) AS hourly_min, max(median) AS hourly_max
        FROM hourly_prices GROUP BY revision, league, cohort_id, price_currency
    ), observations AS (
        SELECT revision, league, account_name, price_amount, price_currency, last_seen_at,
            json_extract_string(c.value, '$') AS cohort_id, TRUE AS matched
        FROM recent h, json_each(h.matches) c
        UNION ALL
        SELECT revision, league, account_name, price_amount, price_currency, last_seen_at,
            json_extract_string(c.value, '$'), FALSE
        FROM recent h, json_each(h.unknown_matches) c
    ), counts AS (
        SELECT revision, league, cohort_id,
            count(*) FILTER (WHERE matched) AS listing_count,
            count(DISTINCT account_name) FILTER (WHERE matched) AS unique_sellers,
            count(*) FILTER (WHERE NOT matched) AS unknown_count,
            min(last_seen_at)::VARCHAR AS first_seen_at, max(last_seen_at)::VARCHAR AS last_seen_at
        FROM observations GROUP BY revision, league, cohort_id
    ), prices AS (
        SELECT revision, league, cohort_id, price_currency, count(*) AS count,
            count(DISTINCT account_name) AS sellers, min(price_amount) AS min,
            median(price_amount) AS median, max(price_amount) AS max
        FROM observations WHERE matched AND price_amount > 0 AND price_currency IS NOT NULL
        GROUP BY revision, league, cohort_id, price_currency
    ) SELECT c.revision, c.league, c.cohort_id AS "cohortId",
        coalesce(n.listing_count, 0) AS "listingCount", coalesce(n.unique_sellers, 0) AS "uniqueSellers",
        coalesce(n.unknown_count, 0) AS "unknownCount", p.price_currency AS currency,
        p.count, p.sellers, p.min, p.median, p.max,
        m.hourly_min AS "hourlyMedianMin", m.hourly_max AS "hourlyMedianMax",
        n.first_seen_at AS "firstSeenAt", n.last_seen_at AS "lastSeenAt"
    FROM ps_equipment_cohort_hour c LEFT JOIN counts n USING (revision, league, cohort_id)
    LEFT JOIN prices p USING (revision, league, cohort_id)
    LEFT JOIN movement m USING (revision, league, cohort_id, price_currency)
    WHERE c.hour = $1 AND ($2 IS NULL OR c.league = $2)
        AND ($3 = 1 OR EXISTS (SELECT 1 FROM coverage v WHERE v.revision = c.revision AND v.league = c.league))
    ORDER BY c.revision, c.league, c.cohort_id, p.price_currency`,
        [hour, league, hours],
    );
    const rows = new Map<string, CohortHourly>();
    for (const aggregate of aggregates) {
        const key = JSON.stringify([aggregate.revision, aggregate.league, aggregate.cohortId]);
        const row =
            rows.get(key) ??
            cohortHourlySchema.parse({
                realm,
                league: aggregate.league,
                hour,
                revision: aggregate.revision,
                cohortId: aggregate.cohortId,
                listingCount: Number(aggregate.listingCount),
                uniqueSellers: Number(aggregate.uniqueSellers),
                unknownCount: Number(aggregate.unknownCount),
                prices: {},
                confidenceMethod: "asking-sellers-coverage-v1",
                firstSeenAt: aggregate.firstSeenAt,
                lastSeenAt: aggregate.lastSeenAt,
            });
        if (aggregate.currency) {
            const count = Number(aggregate.count);
            const sellers = Number(aggregate.sellers);
            row.prices[aggregate.currency] = {
                count,
                sellers,
                min: Number(aggregate.min),
                median: Number(aggregate.median),
                max: Number(aggregate.max),
                confidence: askingPriceConfidence(
                    sellers,
                    count,
                    row.listingCount,
                    row.unknownCount,
                ),
            };
            if (hours !== 1) {
                const price = row.prices[aggregate.currency]!;
                price.windows = {
                    [hours]: {
                        ...price,
                        listingCount: row.listingCount,
                        unknownCount: row.unknownCount,
                        hourlyMedianMin: Number(aggregate.hourlyMedianMin),
                        hourlyMedianMax: Number(aggregate.hourlyMedianMax),
                    },
                };
            }
        }
        rows.set(key, row);
    }
    return [...rows.values()].map((row) => cohortHourlySchema.parse(row));
}

export async function rollupEquipment(
    conn: DuckDBConnection,
    opts: { hour?: number; league?: string | null; dryRun?: boolean },
) {
    await assertSourceRealm(conn, REALM ?? "pc");
    const hour = opts.hour ?? Math.floor(Date.now() / 3_600_000) * 3600 - 3600;
    const rows = await equipmentHourly(conn, hour, opts.league ?? null, REALM ?? "pc");
    if (rows.length) {
        const definitions = await queryAll<{ definition: string }>(
            conn,
            `SELECT DISTINCT d.definition::VARCHAR AS definition
            FROM ps_equipment_cohort d JOIN ps_equipment_cohort_hour h USING (revision, cohort_id)
            WHERE h.hour = $1 AND ($2 IS NULL OR h.league = $2)`,
            [hour, opts.league ?? null],
        );
        await push(
            {
                stream: "equipment-definitions",
                rows: definitions.map(({ definition }) =>
                    marketCohortDefinitionSchema.parse(JSON.parse(definition)),
                ),
            },
            { dryRun: opts.dryRun },
        );
        await push({ stream: "equipment", rows }, { dryRun: opts.dryRun });
        if (!opts.dryRun)
            for (const league of new Set(rows.map((row) => row.league))) {
                await conn.run(
                    `INSERT INTO rollup_state VALUES ('equipment', $1, $2, current_timestamp, $3)
                ON CONFLICT (stream_name, league, hour) DO UPDATE SET pushed_at = excluded.pushed_at, row_count = excluded.row_count`,
                    [league, hour, rows.filter((row) => row.league === league).length],
                );
            }
    }
    return { hours: [hour], rows: rows.length };
}
