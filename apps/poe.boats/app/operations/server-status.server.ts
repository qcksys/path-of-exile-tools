import {
    type IngestStatus,
    ingestHealth,
    ingestHealthSchema,
    ingestStatusSchema,
} from "@poe-tools/market";
import { and, count, countDistinct, eq, max, min } from "drizzle-orm";
import { z } from "zod";
import type { TDatabase } from "~/db/client";
import { tIngestWorker } from "~/db/schema/ingest.worker";
import { tStashCohortHourly } from "~/db/schema/stash.cohort-hourly";
import { tStashCurrencyHourly } from "~/db/schema/stash.currency-hourly";
import { tStashUniqueHourly } from "~/db/schema/stash.unique-hourly";

export const serverStatusFilters = ingestStatusSchema
    .pick({ realm: true, league: true })
    .partial()
    .extend({
        view: z
            .enum(["full", "workers"])
            .optional()
            .describe(
                "Defaults to full. workers skips stored-history coverage queries; coverage is empty because it was omitted.",
            ),
    });
export const serverStatusResult = z.object({
    checkedAt: z.number(),
    coverageCheckedAt: z
        .number()
        .nullable()
        .describe(
            "Coverage snapshot time; reused for up to one minute. Null when coverage is omitted.",
        ),
    workers: z.array(
        ingestStatusSchema.extend({ receivedAt: z.number(), health: ingestHealthSchema }),
    ),
    coverage: z.array(
        z.object({
            stream: z.enum(["currency", "uniques", "equipment"]),
            realm: z.string(),
            league: z.string(),
            firstHour: z.number(),
            latestHour: z.number(),
            hours: z.number(),
            rows: z.number(),
        }),
    ),
});

type Coverage = z.infer<typeof serverStatusResult>["coverage"];
const coverageCache = new WeakMap<
    TDatabase,
    Map<
        string,
        {
            checkedAt: number;
            expiresAt: number;
            value: Promise<Coverage>;
        }
    >
>();

async function storedCoverage(db: TDatabase, filters: z.infer<typeof serverStatusFilters>) {
    let cache = coverageCache.get(db);
    if (!cache) {
        cache = new Map();
        coverageCache.set(db, cache);
    }
    const key = JSON.stringify([filters.realm ?? null, filters.league ?? null]);
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now())
        return { checkedAt: cached.checkedAt, rows: await cached.value };
    const checkedAt = Date.now();
    const entry = {
        checkedAt,
        expiresAt: checkedAt + 60_000,
        value: Promise.all(
            (
                [
                    ["currency", tStashCurrencyHourly, "stash_currency_coverage_idx"],
                    ["uniques", tStashUniqueHourly, "stash_unique_market_cover_idx"],
                    ["equipment", tStashCohortHourly, "stash_cohort_coverage_idx"],
                ] as const
            ).map(async ([stream, table, index]) => {
                const rows = await db
                    .select({
                        realm: table.realm,
                        league: table.league,
                        firstHour: min(table.hour),
                        latestHour: max(table.hour),
                        hours: countDistinct(table.hour),
                        rows: count(),
                    })
                    .from(table, { forceIndex: index })
                    .where(
                        and(
                            filters.realm ? eq(table.realm, filters.realm) : undefined,
                            filters.league ? eq(table.league, filters.league) : undefined,
                        ),
                    )
                    .groupBy(table.realm, table.league);
                return rows.map((row) => ({
                    ...row,
                    stream,
                    firstHour: Number(row.firstHour),
                    latestHour: Number(row.latestHour),
                }));
            }),
        ).then((rows) => rows.flat()),
    };
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(key, entry);
    try {
        const rows = await entry.value;
        return { checkedAt: entry.checkedAt, rows };
    } catch (error) {
        if (cache.get(key) === entry) cache.delete(key);
        throw error;
    }
}

export async function recordIngestStatus(db: TDatabase, report: IngestStatus) {
    const row = {
        workerId: report.workerId,
        realm: report.realm,
        league: report.league,
        receivedAt: Date.now(),
        report,
    };
    await db.insert(tIngestWorker).values(row).onDuplicateKeyUpdate({ set: row });
    return 1;
}

export async function getServerStatus(
    db: TDatabase,
    filters: z.infer<typeof serverStatusFilters> = {},
) {
    const checkedAt = Date.now();
    const workers = await db
        .select()
        .from(tIngestWorker)
        .where(
            and(
                filters.realm ? eq(tIngestWorker.realm, filters.realm) : undefined,
                filters.league ? eq(tIngestWorker.league, filters.league) : undefined,
            ),
        );
    const coverage = filters.view === "workers" ? null : await storedCoverage(db, filters);
    return serverStatusResult.parse({
        checkedAt,
        coverageCheckedAt: coverage?.checkedAt ?? null,
        workers: workers.map(({ report, receivedAt }) => ({
            ...report,
            receivedAt,
            health: ingestHealth(report, receivedAt, checkedAt),
        })),
        coverage: coverage?.rows ?? [],
    });
}
