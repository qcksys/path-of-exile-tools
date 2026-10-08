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

export const serverStatusFilters = ingestStatusSchema.pick({ realm: true, league: true }).partial();
export const serverStatusResult = z.object({
    checkedAt: z.number(),
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
    const coverage = await Promise.all(
        (
            [
                ["currency", tStashCurrencyHourly],
                ["uniques", tStashUniqueHourly],
                ["equipment", tStashCohortHourly],
            ] as const
        ).map(async ([stream, table]) => {
            const rows = await db
                .select({
                    realm: table.realm,
                    league: table.league,
                    firstHour: min(table.hour),
                    latestHour: max(table.hour),
                    hours: countDistinct(table.hour),
                    rows: count(),
                })
                .from(table)
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
    );
    return serverStatusResult.parse({
        checkedAt,
        workers: workers.map(({ report, receivedAt }) => ({
            ...report,
            receivedAt,
            health: ingestHealth(report, receivedAt, checkedAt),
        })),
        coverage: coverage.flat(),
    });
}
