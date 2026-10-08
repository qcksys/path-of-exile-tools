import type { StashCheckpointQuery, StashCheckpointUpload } from "@poe-tools/market";
import { and, asc, eq, gt, gte, lt, or, sql } from "drizzle-orm";
import type { TDatabase } from "~/db/client";
import {
    tStashCheckpoint as checkpoints,
    tStashDailySample as samples,
} from "~/db/schema/stash.checkpoint";

export async function insertStashCheckpoints(db: TDatabase, rows: StashCheckpointUpload[]) {
    for (const { responseGzip, ...row } of rows) {
        await db
            .insert(checkpoints)
            .values(row)
            .onDuplicateKeyUpdate({ set: { id: sql`${checkpoints.id}` } });
        if (responseGzip !== null) {
            await db
                .insert(samples)
                .values({
                    realm: row.realm,
                    league: row.league,
                    day: new Date(row.capturedAt).toISOString().slice(0, 10),
                    checkpointId: row.id,
                    responseGzip,
                })
                .onDuplicateKeyUpdate({ set: { checkpointId: sql`${samples.checkpointId}` } });
        }
    }
    return rows.length;
}

export async function readStashCheckpoints(db: TDatabase, query: StashCheckpointQuery) {
    const scope = and(
        eq(checkpoints.realm, query.realm),
        eq(checkpoints.league, query.league),
        gte(checkpoints.capturedAt, query.from),
        lt(checkpoints.capturedAt, query.to),
    );
    if (query.kind === "sample") {
        const rows = await db
            .select({ checkpoint: checkpoints, responseGzip: samples.responseGzip })
            .from(samples)
            .innerJoin(checkpoints, eq(checkpoints.id, samples.checkpointId))
            .where(scope)
            .orderBy(asc(checkpoints.capturedAt), asc(checkpoints.id))
            .limit(1);
        return rows.map(({ checkpoint, responseGzip }) => ({ ...checkpoint, responseGzip }));
    }
    const after =
        query.afterTime === undefined
            ? undefined
            : or(
                  gt(checkpoints.capturedAt, query.afterTime),
                  and(
                      eq(checkpoints.capturedAt, query.afterTime),
                      gt(checkpoints.id, query.afterId!),
                  ),
              );
    const rows = await db
        .select()
        .from(checkpoints)
        .where(and(scope, after))
        .orderBy(asc(checkpoints.capturedAt), asc(checkpoints.id))
        .limit(500);
    return rows.map((row) => ({ ...row, responseGzip: null }));
}
