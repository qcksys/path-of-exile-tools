import { rename, writeFile } from "node:fs/promises";
import { type IngestStatus, ingestHealth } from "@poe-tools/market";
import { push } from "#src/shared/remote/push.ts";

export function createStatusReporter(scope: Pick<IngestStatus, "workerId" | "realm" | "league">) {
    let status: IngestStatus = {
        ...scope,
        state: "starting",
        stage: null,
        startedAt: Date.now(),
        reportedAt: Date.now(),
        progressAt: Date.now(),
        completedAt: null,
        lastSuccessAt: null,
        failedStages: [],
        cycles: 0,
        pages: 0,
        equipmentObserved: 0,
        stashCaughtUp: null,
        currencyNextHour: null,
        deliveredHours: 0,
        deliveredRows: 0,
    };
    let pending = Promise.resolve();
    async function publish() {
        const report = { ...status, reportedAt: Date.now() };
        const file = process.env.INGEST_STATUS_FILE;
        try {
            if (file) {
                const health = ingestHealth(report, report.reportedAt, report.reportedAt);
                await writeFile(
                    `${file}.tmp`,
                    JSON.stringify({
                        ...report,
                        ok: !["error", "stalled", "stopped"].includes(health),
                    }),
                );
                await rename(`${file}.tmp`, file);
            }
            await push({ stream: "status", rows: [report] });
        } catch {
            console.error("Worker status delivery failed; the next heartbeat will retry.");
        }
    }
    function update(patch: Partial<IngestStatus> = {}) {
        status = { ...status, ...patch };
        pending = pending.then(publish);
        return pending;
    }
    const timer = setInterval(() => {
        void update();
    }, 30_000);
    timer.unref();
    return {
        update,
        get current() {
            return status;
        },
        async close() {
            clearInterval(timer);
            await update({ state: "stopped", stage: null });
        },
    };
}
