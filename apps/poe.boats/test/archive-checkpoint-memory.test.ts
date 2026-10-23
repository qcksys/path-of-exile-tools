import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vite-plus/test";

it("checkpoints and reopens mixed archives beyond the whole-BLOB memory failure boundary", async () => {
    const directory = await mkdtemp(join(tmpdir(), "poe-archive-memory-"));
    const fixture = resolve(import.meta.dirname, "fixtures/archive-checkpoint-memory.ts");
    const resultPath = join(directory, "result.json");
    const invoke = (mode: string, filename: string) =>
        spawnSync(
            process.execPath,
            ["--import", "tsx", fixture, mode, join(directory, filename), resultPath],
            {
                cwd: resolve(import.meta.dirname, ".."),
                encoding: "utf8",
                timeout: 20_000,
                env: { ...process.env, PS_MEMORY_LIMIT: "64MB", PS_THREADS: "2" },
            },
        );
    try {
        const baseline = invoke("legacy", "legacy.duckdb");
        expect(baseline.error).toBeUndefined();
        expect(baseline.status, baseline.stderr).toBe(2);
        const failure = JSON.parse(await readFile(resultPath, "utf8"));
        expect(failure.commitMemoryFailure).toBe(true);
        expect(failure.acknowledged).toBeGreaterThanOrEqual(96);
        expect(failure.acknowledged).toBeLessThan(256);
        const chunked = invoke("chunked", "chunked.duckdb");
        expect(chunked.error).toBeUndefined();
        expect(chunked.status, chunked.stderr).toBe(0);
        const reopened = invoke("verify", "chunked.duckdb");
        expect(reopened.error).toBeUndefined();
        expect(reopened.status, reopened.stderr).toBe(0);
        expect(JSON.parse(reopened.stdout)).toEqual({ verified: 256, legacy: 96 });
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}, 30_000);
