import { z } from "zod";

export const ingestStageSchema = z.enum(["stash", "currency", "delivery"]);
export const ingestStatusSchema = z.object({
    workerId: z.string().min(1).max(100),
    realm: z.enum(["pc", "poe2", "xbox", "sony"]),
    league: z.string().min(1).max(100),
    state: z.enum(["starting", "running", "idle", "error", "stopped"]),
    stage: ingestStageSchema.nullable(),
    startedAt: z.number().int().nonnegative(),
    reportedAt: z.number().int().nonnegative(),
    progressAt: z.number().int().nonnegative(),
    completedAt: z.number().int().nonnegative().nullable(),
    lastSuccessAt: z.number().int().nonnegative().nullable(),
    failedStages: z.array(ingestStageSchema).max(3),
    cycles: z.number().int().nonnegative(),
    pages: z.number().int().nonnegative(),
    equipmentObserved: z.number().int().nonnegative(),
    stashCaughtUp: z.boolean().nullable(),
    currencyNextHour: z.number().int().nonnegative().nullable(),
    deliveredHours: z.number().int().nonnegative(),
    deliveredRows: z.number().int().nonnegative(),
});
export type IngestStatus = z.infer<typeof ingestStatusSchema>;

export const ingestHealthSchema = z.enum([
    "starting",
    "running",
    "idle",
    "error",
    "stopped",
    "stale",
    "stalled",
]);

export function ingestHealth(status: IngestStatus, receivedAt: number, now: number) {
    if (status.state === "stopped") return "stopped";
    if (now - receivedAt > 180_000) return "stale";
    if (status.failedStages.length || status.state === "error") return "error";
    if (status.state === "running" && now - status.progressAt > 600_000) return "stalled";
    return status.state;
}
