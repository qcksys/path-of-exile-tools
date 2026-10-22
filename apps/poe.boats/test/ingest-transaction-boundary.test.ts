import { expect, it, vi } from "vite-plus/test";
import { createClient } from "../../../packages/poe-api-client/src/client";
import { runPipeline } from "../../../packages/poe-stash-ingest/src/pipeline";
import { openDb, TransactionRollbackError } from "../../../packages/poe-stash-ingest/src/shared/db";

const fixture = vi.hoisted(() => ({
    events: [] as string[],
    failedStage: "",
    error: undefined as unknown,
    visit(stage: string) {
        this.events.push(stage);
        if (stage === this.failedStage) throw this.error;
    },
}));
vi.mock("../../../packages/poe-stash-ingest/src/shared/auth.ts", () => ({ REALM: "pc" }));
vi.mock("../../../packages/poe-stash-ingest/src/ps/ingest.ts", () => ({
    ingestPs: async () => {
        fixture.visit("capture");
        return { caughtUp: false };
    },
}));
vi.mock("../../../packages/poe-stash-ingest/src/cx/ingest.ts", () => ({
    ingestCx: async () => {
        fixture.visit("exchange");
        return [];
    },
}));
vi.mock("../../../packages/poe-stash-ingest/src/ps/equipment-reclassify.ts", () => ({
    reclassifyArchivedEquipment: async () => {
        fixture.visit("reclassify");
        return { pages: 0, hours: 0, completedHours: [], pending: false };
    },
}));
vi.mock("../../../packages/poe-stash-ingest/src/ps/checkpoints.ts", () => ({
    flushCheckpoints: async () => fixture.visit("checkpoints"),
}));
vi.mock("../../../packages/poe-stash-ingest/src/ps/equipment-rollup.ts", () => ({
    rollupEquipment: async () => {
        fixture.visit("rollup");
        return { rows: 1 };
    },
}));

const stages = ["capture", "exchange", "reclassify", "checkpoints", "rollup"];
it.each(
    stages.flatMap((stage) => [false, true].map((statusFailure) => ({ stage, statusFailure }))),
)("stops immediately when $stage cannot roll back, with status failure $statusFailure", async ({
    stage,
    statusFailure,
}) => {
    const db = await openDb(":memory:");
    const failure = new TransactionRollbackError(
        new Error("Failed to commit: Out of Memory"),
        new Error("Cannot rollback: no transaction is active"),
    );
    fixture.events.length = 0;
    fixture.failedStage = stage;
    fixture.error = failure;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const status = vi.fn(async (patch: { state?: string }) => {
        if (statusFailure && patch.state === "error") throw new Error("Status unavailable");
    });
    try {
        await db.conn.run(
            "INSERT INTO ps_equipment_cohort_hour VALUES ('fixture', 'Allflame', 3600, 'fixture', current_timestamp)",
        );
        await expect(
            runPipeline(db.conn, createClient({ userAgent: "pipeline-test", token: "inert" }), {
                pages: 1,
                league: "Allflame",
                onStatus: status,
            }),
        ).rejects.toBe(failure);
        expect(fixture.events).toEqual(stages.slice(0, stages.indexOf(stage) + 1));
        const failedStage =
            stage === "exchange"
                ? "currency"
                : stage === "capture" || stage === "reclassify"
                  ? "stash"
                  : "delivery";
        expect(status).toHaveBeenLastCalledWith(
            expect.objectContaining({ state: "error", failedStages: [failedStage] }),
        );
    } finally {
        log.mockRestore();
        await db.close();
    }
});
