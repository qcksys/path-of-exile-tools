import { expect, it, vi } from "vite-plus/test";
import { createClient } from "../../../packages/poe-api-client/src/client";
import { runPipeline } from "../../../packages/poe-stash-ingest/src/pipeline";
import type { EquipmentDiagnostics } from "../../../packages/poe-stash-ingest/src/ps/equipment-diagnostics";
import { openDb } from "../../../packages/poe-stash-ingest/src/shared/db";

const fixture = vi.hoisted(() => ({
    events: [] as string[],
    ingest: vi.fn(),
    reclassify: vi.fn(),
}));
vi.mock("../../../packages/poe-stash-ingest/src/shared/auth.ts", () => ({ REALM: "pc" }));
vi.mock("../../../packages/poe-stash-ingest/src/ps/ingest.ts", () => ({
    ingestPs: fixture.ingest.mockImplementation(async () => {
        fixture.events.push("capture");
        return { caughtUp: false };
    }),
}));
vi.mock("../../../packages/poe-stash-ingest/src/cx/ingest.ts", () => ({
    ingestCx: async () => {
        fixture.events.push("exchange");
        return [];
    },
}));
vi.mock("../../../packages/poe-stash-ingest/src/ps/equipment-reclassify.ts", () => ({
    reclassifyArchivedEquipment: fixture.reclassify,
}));
vi.mock("../../../packages/poe-stash-ingest/src/ps/checkpoints.ts", () => ({
    flushCheckpoints: async () => fixture.events.push("delivery"),
}));

it("reclassifies a bounded archive batch on the owning connection after live exchange capture", async () => {
    const db = await openDb(":memory:");
    const client = createClient({ userAgent: "pipeline-test", token: "inert" });
    fixture.events.length = 0;
    fixture.reclassify.mockReset().mockImplementation(async () => {
        fixture.events.push("reclassify");
        return { pages: 1, hours: 0, completedHours: [], pending: true };
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const equipmentDiagnostics: EquipmentDiagnostics = {
        collect: vi.fn(() => null),
        flush: vi.fn(async () => {}),
    };
    fixture.ingest.mockClear();
    try {
        await runPipeline(db.conn, client, { pages: 50, league: "Allflame", equipmentDiagnostics });
        expect(fixture.events).toEqual(["capture", "exchange", "reclassify", "delivery"]);
        expect(fixture.ingest).toHaveBeenCalledExactlyOnceWith(
            db.conn,
            client,
            expect.objectContaining({ equipmentDiagnostics }),
        );
        expect(fixture.ingest.mock.calls[0]![2].equipmentDiagnostics).toBe(equipmentDiagnostics);
        expect(fixture.reclassify).toHaveBeenCalledExactlyOnceWith(db.conn, {
            realm: "pc",
            league: "Allflame",
            limitPages: 5,
            equipmentDiagnostics,
        });
        expect(fixture.reclassify.mock.calls[0]![1].equipmentDiagnostics).toBe(
            equipmentDiagnostics,
        );
        expect(log).toHaveBeenCalledWith(
            "reclassified 1 archived equipment pages; completed hours=none; pending=true",
        );
    } finally {
        log.mockRestore();
        await db.close();
    }
});

it("reclassifies only what PS_RECLASSIFY_PAGES_PER_HOUR allows and skips its checkpoint otherwise", async () => {
    const db = await openDb(":memory:");
    const client = createClient({ userAgent: "pipeline-test", token: "inert" });
    fixture.reclassify.mockReset().mockImplementation(async (_conn, { limitPages }) => ({
        pages: limitPages,
        hours: 0,
        completedHours: [],
        pending: true,
    }));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const run = vi.spyOn(db.conn, "run");
    vi.stubEnv("PS_RECLASSIFY_PAGES_PER_HOUR", "120");
    vi.useFakeTimers({ now: Date.now() + 2 * 3_600_000, toFake: ["Date"] });
    try {
        // A full allowance covers one cycle's cap; spending it leaves nothing for the next cycle.
        await runPipeline(db.conn, client, { pages: 50, league: "Allflame" });
        expect(fixture.reclassify).toHaveBeenCalledOnce();
        expect(fixture.reclassify.mock.calls[0]![1].limitPages).toBe(5);
        run.mockClear();
        await runPipeline(db.conn, client, { pages: 50, league: "Allflame" });
        expect(fixture.reclassify).toHaveBeenCalledOnce();
        expect(run.mock.calls.filter(([sql]) => sql === "CHECKPOINT")).toEqual([]);
        // 120 pages an hour refill one page every 30 seconds.
        vi.advanceTimersByTime(60_000);
        await runPipeline(db.conn, client, { pages: 50, league: "Allflame" });
        expect(fixture.reclassify).toHaveBeenCalledTimes(2);
        expect(fixture.reclassify.mock.calls[1]![1].limitPages).toBe(2);
    } finally {
        vi.useRealTimers();
        vi.unstubAllEnvs();
        run.mockRestore();
        log.mockRestore();
        await db.close();
    }
});

it("reports projection failure but still attempts pending delivery after exchange succeeds", async () => {
    const db = await openDb(":memory:");
    const client = createClient({ userAgent: "pipeline-test", token: "inert" });
    fixture.events.length = 0;
    fixture.reclassify.mockReset().mockImplementation(async () => {
        fixture.events.push("reclassify");
        throw new Error("Archive projection failed");
    });
    const status = vi.fn(async () => {});
    try {
        await expect(runPipeline(db.conn, client, { pages: 1, onStatus: status })).rejects.toThrow(
            "One or more pipeline stages failed",
        );
        expect(fixture.events).toEqual(["capture", "exchange", "reclassify", "delivery"]);
        expect(status).toHaveBeenLastCalledWith(
            expect.objectContaining({ state: "error", failedStages: ["stash"] }),
        );
        expect(fixture.reclassify).toHaveBeenCalledWith(db.conn, {
            realm: "pc",
            league: "all",
            limitPages: 1,
            equipmentDiagnostics: undefined,
        });
    } finally {
        await db.close();
    }
});
