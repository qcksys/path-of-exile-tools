import { beforeEach, expect, it, vi } from "vite-plus/test";
import { createClient } from "../../../packages/poe-api-client/src/client";
import { runPipeline } from "../../../packages/poe-stash-ingest/src/pipeline";
import {
    openDb,
    queryAll,
    TransactionRollbackError,
    withTransaction,
} from "../../../packages/poe-stash-ingest/src/shared/db";
import { watchCycles } from "../../../packages/poe-stash-ingest/src/shared/watch";

const fixture = vi.hoisted(() => ({
    realm: "pc",
    events: [] as string[],
    failedStage: "",
    error: undefined as unknown,
    capture: vi.fn(),
    visit(stage: string) {
        this.events.push(stage);
        if (stage === this.failedStage) throw this.error;
    },
}));
vi.mock("../../../packages/poe-stash-ingest/src/shared/auth.ts", () => ({
    // biome-ignore lint/style/useNamingConvention: Match the live auth module export.
    get REALM() {
        return fixture.realm;
    },
}));
vi.mock("../../../packages/poe-stash-ingest/src/ps/ingest.ts", () => ({
    ingestPs: fixture.capture,
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
    flushCheckpoints: async () => fixture.visit("checkpoint-delivery"),
}));
vi.mock("../../../packages/poe-stash-ingest/src/ps/equipment-rollup.ts", () => ({
    rollupEquipment: async () => {
        fixture.visit("rollup-delivery");
        return { rows: 1 };
    },
}));

const stages = [
    "capture",
    "exchange",
    "checkpoint",
    "reclassify",
    "checkpoint-delivery",
    "rollup-delivery",
];
const client = createClient({ userAgent: "checkpoint-test", token: "inert" });

beforeEach(() => {
    fixture.realm = "pc";
    fixture.events.length = 0;
    fixture.failedStage = "";
    fixture.error = undefined;
    fixture.capture.mockReset().mockImplementation(async () => {
        fixture.visit("capture");
        return { caughtUp: false };
    });
});

async function database() {
    const db = await openDb(":memory:");
    await db.conn.run(
        "INSERT INTO ps_equipment_cohort_hour VALUES ('fixture', 'Allflame', 3600, 'fixture', current_timestamp)",
    );
    const run = db.conn.run.bind(db.conn);
    vi.spyOn(db.conn, "run").mockImplementation(async (sql, ...args) => {
        if (sql.trim().toUpperCase() === "CHECKPOINT") fixture.visit("checkpoint");
        return run(sql, ...args);
    });
    return db;
}

it.each([
    true,
    false,
])("checkpoints committed PC capture before replay with currency capture %s", async (currency) => {
    const db = await database();
    try {
        await runPipeline(db.conn, client, { pages: 5, league: "Allflame", currency });
        expect(fixture.events).toEqual(
            currency ? stages : stages.filter((stage) => stage !== "exchange"),
        );
    } finally {
        vi.restoreAllMocks();
        await db.close();
    }
});

it("checkpoints earlier committed work after an ordinary capture transaction rolls back", async () => {
    const db = await database();
    const status = vi.fn(async () => {});
    fixture.capture.mockImplementationOnce(async () => {
        fixture.visit("capture");
        await db.conn.run("INSERT INTO pipeline_config VALUES ('committed-fixture', 'retained')");
        await withTransaction(db.conn, async () => {
            await db.conn.run(
                "INSERT INTO pipeline_config VALUES ('rolled-back-fixture', 'absent')",
            );
            throw new Error("Capture statement failed");
        });
    });
    try {
        await expect(
            runPipeline(db.conn, client, { pages: 5, league: "Allflame", onStatus: status }),
        ).rejects.toThrow("One or more pipeline stages failed");
        expect(fixture.events).toEqual(stages);
        expect(
            await queryAll(db.conn, "SELECT key FROM pipeline_config WHERE key LIKE '%-fixture'"),
        ).toEqual([{ key: "committed-fixture" }]);
        expect(status).toHaveBeenLastCalledWith(
            expect.objectContaining({ state: "error", failedStages: ["stash"] }),
        );
    } finally {
        vi.restoreAllMocks();
        await db.close();
    }
});

it("logs a checkpoint failure, skips replay, delivers committed work and retries next cycle", async () => {
    const db = await database();
    fixture.failedStage = "checkpoint";
    fixture.error = Object.assign(new Error("Out of Memory: failed to pin block"), {
        request: { authorization: "Bearer fixture-private-token" },
    });
    const status = vi.fn(async () => {});
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const stop = new AbortController();
    let cycles = 0;
    try {
        await watchCycles(
            async () => {
                if (++cycles === 2) {
                    fixture.failedStage = "";
                    stop.abort();
                }
                await runPipeline(db.conn, client, {
                    pages: 5,
                    league: "Allflame",
                    onStatus: status,
                });
            },
            { signal: stop.signal, intervalMs: 1 },
        );
        expect(cycles).toBe(2);
        expect(fixture.events).toEqual([
            ...stages.filter((stage) => stage !== "reclassify"),
            ...stages,
        ]);
        expect(status).toHaveBeenCalledWith(
            expect.objectContaining({ state: "error", failedStages: ["stash"] }),
        );
        expect(status).toHaveBeenLastCalledWith(
            expect.objectContaining({ state: "idle", failedStages: [] }),
        );
        expect(log).toHaveBeenCalledOnce();
        const output = log.mock.calls.flat().join(" ");
        expect(output).toContain("Capture database checkpoint failed");
        expect(output).toContain("Out of Memory: failed to pin block");
        expect(output).not.toContain("fixture-private");
        expect(output).not.toContain("authorization");
    } finally {
        stop.abort();
        vi.restoreAllMocks();
        await db.close();
    }
});

it.each([
    "capture",
    "exchange",
    "checkpoint",
])("stops immediately with the exact fatal rollback error from %s", async (stage) => {
    const db = await database();
    const failure = new TransactionRollbackError(
        new Error("Commit failed"),
        new Error("Rollback failed"),
    );
    fixture.failedStage = stage;
    fixture.error = failure;
    const status = vi.fn(async () => {});
    try {
        await expect(
            runPipeline(db.conn, client, { pages: 5, league: "Allflame", onStatus: status }),
        ).rejects.toBe(failure);
        expect(fixture.events).toEqual(stages.slice(0, stages.indexOf(stage) + 1));
        expect(status).toHaveBeenLastCalledWith(
            expect.objectContaining({
                state: "error",
                failedStages: [stage === "exchange" ? "currency" : "stash"],
            }),
        );
    } finally {
        vi.restoreAllMocks();
        await db.close();
    }
});

it("keeps the PoE 2 exchange-only pipeline free of the PC checkpoint and replay", async () => {
    fixture.realm = "poe2";
    const db = await database();
    try {
        await runPipeline(db.conn, client, { pages: 5, league: "Allflame" });
        expect(fixture.events).toEqual(["exchange", "checkpoint-delivery", "rollup-delivery"]);
        expect(fixture.capture).not.toHaveBeenCalled();
    } finally {
        vi.restoreAllMocks();
        await db.close();
    }
});
