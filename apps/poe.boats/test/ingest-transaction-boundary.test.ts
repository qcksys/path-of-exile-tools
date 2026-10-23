import { expect, it, vi } from "vite-plus/test";
import { createClient } from "../../../packages/poe-api-client/src/client";
import { runPipeline } from "../../../packages/poe-stash-ingest/src/pipeline";
import { openDb, TransactionRollbackError } from "../../../packages/poe-stash-ingest/src/shared/db";
import { watchCycles } from "../../../packages/poe-stash-ingest/src/shared/watch";

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
        const stop = new AbortController();
        const cycle = vi.fn(async () => {
            await runPipeline(
                db.conn,
                createClient({ userAgent: "pipeline-test", token: "inert" }),
                {
                    pages: 1,
                    league: "Allflame",
                    onStatus: status,
                },
            );
        });
        await expect(watchCycles(cycle, { signal: stop.signal })).rejects.toBe(failure);
        expect(cycle).toHaveBeenCalledOnce();
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
        const output = log.mock.calls.flat().join(" ");
        expect(output).toContain("stopping before further processing");
        expect(output).toContain("Failed to commit: Out of Memory");
        expect(output).toContain("Cannot rollback: no transaction is active");
    } finally {
        log.mockRestore();
        await db.close();
    }
});

it.each([
    ["capture", "Live stash capture", "stash"],
    ["exchange", "Currency capture", "currency"],
    ["reclassify", "Archived equipment replay", "stash"],
    ["checkpoints", "Checkpoint delivery", "delivery"],
    ["rollup", "Rollup delivery", "delivery"],
])("logs the %s operation and native cause while retrying ordinary failures", async (stage, operation, failedStage) => {
    const db = await openDb(":memory:");
    const nativeMessage = "Out of Memory Error: failed to pin block of size 256.0 KiB";
    fixture.events.length = 0;
    fixture.failedStage = stage;
    fixture.error = Object.assign(new Error(nativeMessage), {
        request: { authorization: "Bearer fixture-private-token" },
    });
    const status = vi.fn(async () => {});
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const stop = new AbortController();
    let cycles = 0;
    try {
        await db.conn.run(
            "INSERT INTO ps_equipment_cohort_hour VALUES ('fixture', 'Allflame', 3600, 'fixture', current_timestamp)",
        );
        await watchCycles(
            async () => {
                if (++cycles === 2) {
                    fixture.failedStage = "";
                    stop.abort();
                }
                await runPipeline(
                    db.conn,
                    createClient({ userAgent: "pipeline-test", token: "inert" }),
                    {
                        pages: 1,
                        league: "Allflame",
                        onStatus: status,
                    },
                );
            },
            { signal: stop.signal, intervalMs: 1 },
        );
        expect(cycles).toBe(2);
        expect(fixture.events).toEqual([...stages, ...stages]);
        expect(status).toHaveBeenCalledWith(
            expect.objectContaining({ state: "error", failedStages: [failedStage] }),
        );
        expect(status).toHaveBeenLastCalledWith(
            expect.objectContaining({ state: "idle", failedStages: [] }),
        );
        expect(log).toHaveBeenCalledOnce();
        expect(log.mock.calls.flat().every((value) => typeof value === "string")).toBe(true);
        const output = log.mock.calls.flat().join(" ");
        expect(output).toContain(`${operation} failed`);
        expect(output).toContain(nativeMessage);
        if (stage === "rollup") expect(output).toContain("equipment rollup for hour 3600 failed");
        expect(output).not.toContain("fixture-private");
        expect(output).not.toContain("authorization");
    } finally {
        stop.abort();
        log.mockRestore();
        await db.close();
    }
});

it("identifies pending rollup discovery in the safe native database failure log", async () => {
    const db = await openDb(":memory:");
    fixture.events.length = 0;
    fixture.failedStage = "";
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const stop = new AbortController();
    try {
        await db.conn.run("DROP TABLE ps_sale");
        await watchCycles(
            async () => {
                stop.abort();
                await runPipeline(
                    db.conn,
                    createClient({ userAgent: "pipeline-test", token: "inert" }),
                    {
                        pages: 1,
                        league: "Allflame",
                    },
                );
            },
            { signal: stop.signal },
        );
        expect(log).toHaveBeenCalledOnce();
        const output = log.mock.calls.flat().join(" ");
        expect(output).toContain("Rollup delivery failed");
        expect(output).toContain("Pending rollup discovery failed");
        expect(output).toContain("Table with name ps_sale does not exist");
    } finally {
        log.mockRestore();
        await db.close();
    }
});

it("labels an unknown operation failure without inspecting the thrown value", async () => {
    const db = await openDb(":memory:");
    const stringify = vi.fn(() => "fixture-private-token");
    fixture.events.length = 0;
    fixture.failedStage = "reclassify";
    fixture.error = { toString: stringify, authorization: "Bearer fixture-private-token" };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const stop = new AbortController();
    try {
        await watchCycles(
            async () => {
                stop.abort();
                await runPipeline(
                    db.conn,
                    createClient({ userAgent: "pipeline-test", token: "inert" }),
                    {
                        pages: 1,
                        league: "Allflame",
                    },
                );
            },
            { signal: stop.signal },
        );
        const output = log.mock.calls.flat().join(" ");
        expect(output).toContain("Archived equipment replay failed; Unknown error");
        expect(output).not.toContain("fixture-private");
        expect(stringify).not.toHaveBeenCalled();
    } finally {
        log.mockRestore();
        await db.close();
    }
});
