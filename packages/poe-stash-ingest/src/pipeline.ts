import type { DuckDBConnection } from "@duckdb/node-api";
import type { PoeApiClient } from "@poe-tools/api-client";
import type { IngestStatus } from "@poe-tools/market";
import { ingestCx } from "#src/cx/ingest.ts";
import { rollupCx } from "#src/cx/rollup.ts";
import { flushCheckpoints } from "#src/ps/checkpoints.ts";
import type { EquipmentDiagnostics } from "#src/ps/equipment-diagnostics.ts";
import { reclassifyArchivedEquipment } from "#src/ps/equipment-reclassify.ts";
import { rollupEquipment } from "#src/ps/equipment-rollup.ts";
import { ingestPs } from "#src/ps/ingest.ts";
import { rollupPs } from "#src/ps/rollup.ts";
import { REALM } from "#src/shared/auth.ts";
import { queryAll, TransactionRollbackError } from "#src/shared/db.ts";
import { configureSource } from "#src/shared/source.ts";

function operationFailure(operation: string, error: unknown) {
    return error instanceof TransactionRollbackError
        ? error
        : new Error(`${operation} failed`, { cause: error });
}

export async function flushRollups(
    conn: DuckDBConnection,
    opts: {
        league?: string | null;
        dryRun?: boolean;
        limit?: number;
        onProgress?: (hours: number, rows: number) => Promise<void>;
        onBatch?: () => Promise<void>;
    } = {},
) {
    const pending = await queryAll<{ stream: string; league: string; hour: number }>(
        conn,
        `
        WITH observations AS (
            SELECT league, observed_hour AS hour, last_seen_at AS changed_at, icon_asset, identified FROM ps_listing_hour
            UNION ALL
            SELECT league, epoch(date_trunc('hour', removed_at))::BIGINT, updated_at, icon_asset, identified FROM ps_sale
        ), dirty AS (
            SELECT DISTINCT 'psapi' AS stream, l.league, l.hour
            FROM observations l
            LEFT JOIN rollup_state r ON r.stream_name = 'psapi' AND r.league = l.league AND r.hour = l.hour
            LEFT JOIN icon_basemap b ON b.icon_asset = l.icon_asset
            WHERE (l.identified OR b.name IS NOT NULL)
                AND (r.pushed_at IS NULL OR l.changed_at > r.pushed_at OR b.first_seen_at > r.pushed_at)
            UNION ALL
            SELECT DISTINCT 'cxapi', l.league, l.observed_hour FROM cx_market_hour l
            LEFT JOIN rollup_state r ON r.stream_name = 'cxapi' AND r.league = l.league AND r.hour = l.observed_hour
            WHERE r.pushed_at IS NULL
            UNION ALL
            SELECT DISTINCT 'equipment', l.league, l.hour FROM ps_equipment_cohort_hour l
            LEFT JOIN rollup_state r ON r.stream_name = 'equipment' AND r.league = l.league AND r.hour = l.hour
            WHERE r.pushed_at IS NULL OR l.changed_at > r.pushed_at
        ) SELECT * FROM dirty
        WHERE hour < epoch(date_trunc('hour', current_timestamp)) AND ($1 IS NULL OR league = $1)
        ORDER BY hour, stream, league LIMIT $2`,
        [opts.league ?? null, opts.limit ?? 168],
    ).catch((error: unknown) => {
        throw operationFailure("Pending rollup discovery", error);
    });
    let rows = 0;
    let hours = 0;
    for (const entry of pending) {
        const rollup =
            entry.stream === "psapi"
                ? rollupPs
                : entry.stream === "equipment"
                  ? rollupEquipment
                  : rollupCx;
        rows += (
            await rollup(conn, {
                hour: Number(entry.hour),
                league: entry.league,
                dryRun: opts.dryRun,
                onBatch: opts.onBatch,
            }).catch((error: unknown) => {
                throw operationFailure(
                    `${entry.stream} rollup for hour ${Number(entry.hour)}`,
                    error,
                );
            })
        ).rows;
        await opts.onProgress?.(++hours, rows);
    }
    return { hours: pending.length, rows };
}

export async function runPipeline(
    conn: DuckDBConnection,
    client: PoeApiClient,
    opts: {
        pages: number;
        league?: string | null;
        cursor?: string;
        currency?: boolean;
        observedAt?: Date;
        equipmentDiagnostics?: EquipmentDiagnostics;
        onStatus?: (patch: Partial<IngestStatus>) => Promise<void>;
        currencyFromHour?: number;
        currencyHours?: number;
    },
) {
    await configureSource(conn, REALM ?? "pc", opts.league ?? null);
    const errors: unknown[] = [];
    const failedStages: IngestStatus["failedStages"] = [];
    const update = opts.onStatus ?? (async () => {});
    async function failStage(
        stage: IngestStatus["failedStages"][number],
        operation: string,
        error: unknown,
    ) {
        if (!failedStages.includes(stage)) failedStages.push(stage);
        if (error instanceof TransactionRollbackError) {
            try {
                await update({
                    state: "error",
                    failedStages: [...failedStages],
                    completedAt: Date.now(),
                });
            } catch {
                console.error("Worker status could not be updated before stopping.");
            }
            throw error;
        }
        errors.push(operationFailure(operation, error));
    }
    await update({
        state: "running",
        stage: "stash",
        failedStages,
        progressAt: Date.now(),
        pages: 0,
        equipmentObserved: 0,
        deliveredHours: 0,
        deliveredRows: 0,
    });
    const stash =
        REALM === "poe2"
            ? null
            : await ingestPs(conn, client, {
                  ...opts,
                  onProgress: async (result) => {
                      await update({
                          pages: result.pages,
                          equipmentObserved: result.equipmentObserved,
                          progressAt: Date.now(),
                      });
                  },
              }).catch(async (error: unknown) => {
                  await failStage("stash", "Live stash capture", error);
                  return null;
              });
    await update({
        stage: "currency",
        failedStages: [...failedStages],
        stashCaughtUp: stash?.caughtUp ?? null,
        progressAt: Date.now(),
    });
    const currency =
        opts.currency === false
            ? []
            : await ingestCx(conn, client, {
                  catchUp: (opts.currencyHours ?? 1) > 1,
                  maxHours: opts.currencyHours,
                  fromHour: opts.currencyFromHour,
                  league: opts.league,
                  onProgress: async (result) => {
                      await update({ currencyNextHour: result.nextHour, progressAt: Date.now() });
                  },
              }).catch(async (error: unknown) => {
                  await failStage("currency", "Currency capture", error);
                  return [];
              });
    if (REALM !== "poe2") {
        await update({ stage: "stash", failedStages: [...failedStages], progressAt: Date.now() });
        // Release capture indexes before replay publication loads its own indexes.
        const checkpointed = await conn.run("CHECKPOINT").then(
            () => true,
            async (error: unknown) => {
                await failStage("stash", "Capture database checkpoint", error);
                return false;
            },
        );
        if (checkpointed) {
            await reclassifyArchivedEquipment(conn, {
                realm: REALM ?? "pc",
                league: opts.league ?? "all",
                limitPages: Math.min(opts.pages, 5),
                equipmentDiagnostics: opts.equipmentDiagnostics,
            })
                .then(async (result) => {
                    if (result.pages)
                        console.log(
                            `reclassified ${result.pages} archived equipment pages; completed hours=${result.completedHours.join(",") || "none"}; pending=${result.pending}`,
                        );
                    await update({ progressAt: Date.now() });
                })
                .catch((error: unknown) => failStage("stash", "Archived equipment replay", error));
        }
    }
    await update({ stage: "delivery", failedStages: [...failedStages], progressAt: Date.now() });
    await flushCheckpoints(conn).catch((error: unknown) =>
        failStage("delivery", "Checkpoint delivery", error),
    );
    const delivered = await flushRollups(conn, {
        ...opts,
        onBatch: async () => {
            await update({ progressAt: Date.now() });
        },
        onProgress: async (hours, rows) => {
            await update({ deliveredHours: hours, deliveredRows: rows, progressAt: Date.now() });
        },
    }).catch(async (error: unknown) => {
        await failStage("delivery", "Rollup delivery", error);
        return null;
    });
    await update({
        stage: null,
        failedStages: [...failedStages],
        state: errors.length ? "error" : "idle",
        completedAt: Date.now(),
        ...(errors.length ? {} : { lastSuccessAt: Date.now() }),
    });
    if (errors.length)
        throw new AggregateError(
            errors,
            "One or more pipeline stages failed; committed data and pending deliveries are retained.",
        );
    return { stash, currency, delivered };
}
