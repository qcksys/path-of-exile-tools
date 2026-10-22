import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type IngestStatus, ingestHealth, ingestStatusSchema } from "@poe-tools/market";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createStatusReporter } from "../../../packages/poe-stash-ingest/src/shared/status";

const now = 1_791_447_600_000;
const report = ingestStatusSchema.parse({
    workerId: "pc:Allflame",
    realm: "pc",
    league: "Allflame",
    state: "running",
    stage: "currency",
    startedAt: now - 60_000,
    reportedAt: now,
    progressAt: now,
    completedAt: null,
    lastSuccessAt: null,
    failedStages: [],
    cycles: 1,
    pages: 5,
    equipmentObserved: 10,
    stashCaughtUp: false,
    currencyNextHour: now / 1000,
    deliveredHours: 0,
    deliveredRows: 0,
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("ingestion status", () => {
    it("distinguishes missing heartbeat, stalled progress, source errors and intentional shutdown", () => {
        expect(ingestHealth(report, now, now)).toBe("running");
        expect(ingestHealth(report, now - 180_001, now)).toBe("stale");
        expect(ingestHealth({ ...report, progressAt: now - 600_001 }, now, now)).toBe("stalled");
        expect(ingestHealth({ ...report, failedStages: ["currency"] }, now, now)).toBe("error");
        expect(ingestHealth({ ...report, state: "stopped" }, 0, now)).toBe("stopped");
        expect(ingestHealth({ ...report, state: "idle", progressAt: 0 }, now, now)).toBe("idle");
    });

    it("retries telemetry failure without failing collection and sends final shutdown state", async () => {
        vi.stubEnv("POE_BOATS_INGEST_URL", "https://receiver.invalid/api/stash-ingest");
        vi.stubEnv("POE_BOATS_INGEST_TOKEN", "test-secret");
        vi.stubEnv("INGEST_STATUS_FILE", "");
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        vi.spyOn(console, "log").mockImplementation(() => {});
        const fetcher = vi
            .fn()
            .mockRejectedValueOnce(new Error("offline"))
            .mockImplementation(async () => Response.json({ written: 1 }));
        vi.stubGlobal("fetch", fetcher);
        const reporter = createStatusReporter({
            workerId: "pc:Allflame",
            realm: "pc",
            league: "Allflame",
        });
        try {
            await reporter.update({ state: "running", stage: "stash" });
            await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
            await reporter.update({ pages: 3, progressAt: now });
            await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
        } finally {
            await reporter.close();
        }
        expect(fetcher).toHaveBeenCalledTimes(3);
        expect(error).toHaveBeenCalledWith(
            "Worker status delivery failed; the next heartbeat will retry.",
        );
        const payload = JSON.parse(fetcher.mock.calls[2]![1].body);
        expect(payload).toMatchObject({
            stream: "status",
            rows: [{ state: "stopped", pages: 3, stage: null }],
        });
        expect(JSON.stringify(payload)).not.toContain("test-secret");
    });

    it("keeps capture and local health moving while a slow remote report is coalesced", async () => {
        const directory = await mkdtemp(join(tmpdir(), "ingest-status-"));
        const statusFile = join(directory, "status.json");
        vi.stubEnv("POE_BOATS_INGEST_URL", "https://receiver.invalid/api/stash-ingest");
        vi.stubEnv("POE_BOATS_INGEST_TOKEN", "test-secret");
        vi.stubEnv("INGEST_STATUS_FILE", statusFile);
        vi.spyOn(console, "log").mockImplementation(() => {});
        const first = Promise.withResolvers<Response>();
        const fetcher = vi
            .fn()
            .mockReturnValueOnce(first.promise)
            .mockImplementation(async () => Response.json({ written: 1 }));
        vi.stubGlobal("fetch", fetcher);
        const reporter = createStatusReporter({
            workerId: "pc:Allflame",
            realm: "pc",
            league: "Allflame",
        });
        try {
            await reporter.update({ state: "running", stage: "stash", pages: 1 });
            await reporter.update({ pages: 2 });
            const failedStages: IngestStatus["failedStages"] = [];
            await reporter.update({ pages: 3, failedStages });
            failedStages.push("stash");
            expect(fetcher).toHaveBeenCalledTimes(1);
            expect(JSON.parse(await readFile(statusFile, "utf8"))).toMatchObject({
                state: "running",
                pages: 3,
                failedStages: [],
                ok: true,
            });
            let closed = false;
            const closing = reporter.close().then(() => {
                closed = true;
            });
            await vi.waitFor(async () => {
                expect(JSON.parse(await readFile(statusFile, "utf8"))).toMatchObject({
                    state: "stopped",
                    pages: 3,
                    ok: false,
                });
            });
            expect(closed).toBe(false);
            expect(fetcher).toHaveBeenCalledTimes(1);
            first.resolve(Response.json({ written: 1 }));
            await closing;
            expect(fetcher).toHaveBeenCalledTimes(2);
            expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toMatchObject({
                stream: "status",
                rows: [{ state: "stopped", stage: null, pages: 3, failedStages: [] }],
            });
        } finally {
            first.resolve(Response.json({ written: 1 }));
            await reporter.close();
            await rm(directory, { recursive: true, force: true });
        }
    });
});
