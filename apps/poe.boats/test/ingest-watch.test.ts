import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";
import { watchCycles } from "../../../packages/poe-stash-ingest/src/shared/watch";

describe("ingest worker lifecycle", () => {
    it("continues promptly while behind, then resumes normal polling once caught up", async () => {
        const stop = new AbortController();
        const timeout = setTimeout(() => stop.abort(), 3500);
        let attempts = 0;
        try {
            await watchCycles(async () => ({ caughtUp: ++attempts > 1 }), { signal: stop.signal });
            expect(attempts).toBe(2);
        } finally {
            clearTimeout(timeout);
            stop.abort();
        }
    });

    it("finishes an in-flight cycle, saves its health and stops without starting another", async () => {
        const directory = await mkdtemp(join(tmpdir(), "ingest-watch-"));
        const statusFile = join(directory, "status.json");
        const stop = new AbortController();
        const finished: string[] = [];
        try {
            await watchCycles(
                async () => {
                    finished.push("started");
                    stop.abort();
                    await Promise.resolve();
                    finished.push("committed");
                },
                { signal: stop.signal, statusFile },
            );
            expect(finished).toEqual(["started", "committed"]);
            expect(JSON.parse(await readFile(statusFile, "utf8"))).toMatchObject({ ok: true });
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    it("retries a failed cycle and immediately wakes from the wait when stopped", async () => {
        const stop = new AbortController();
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        let attempts = 0;
        try {
            await watchCycles(
                async () => {
                    if (++attempts === 1) throw new Error("temporary source failure");
                    setTimeout(() => stop.abort(), 5);
                },
                { signal: stop.signal, intervalMs: 10 },
            );
            expect(attempts).toBe(2);
            expect(log).toHaveBeenCalledOnce();
        } finally {
            log.mockRestore();
        }
    });
});
