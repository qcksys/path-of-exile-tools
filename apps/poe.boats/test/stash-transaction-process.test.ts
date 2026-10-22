import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vite-plus/test";

it("stops after a failed rollback and preserves archived bodies through a new process", async () => {
    const directory = await mkdtemp(join(tmpdir(), "poe-fatal-transaction-"));
    const database = join(directory, "fixture.duckdb");
    const resultPath = join(directory, "result.json");
    const fixture = resolve(import.meta.dirname, "fixtures/stash-transaction-process.ts");
    const invoke = (mode: string) =>
        spawnSync(process.execPath, ["--import", "tsx", fixture, mode, database, resultPath], {
            cwd: resolve(import.meta.dirname, ".."),
            encoding: "utf8",
            timeout: 10_000,
        });
    try {
        const failed = invoke("fail");
        expect(failed.error).toBeUndefined();
        expect(failed.status, failed.stderr).toBe(1);
        expect(failed.stderr).toMatch(/Failed to commit.*duplicate key/i);
        expect(failed.stderr).toMatch(/cannot rollback.*no transaction is active/i);
        expect(JSON.parse(await readFile(resultPath, "utf8"))).toEqual({
            fatal: "TransactionRollbackError",
            cycles: 1,
        });
        const recovered = invoke("recover");
        expect(recovered.error).toBeUndefined();
        expect(recovered.status, recovered.stderr).toBe(0);
        expect(JSON.parse(await readFile(resultPath, "utf8"))).toEqual({
            recoveredBodies: 6,
            finalBodies: 14,
        });
        const verified = invoke("verify");
        expect(verified.error).toBeUndefined();
        expect(verified.status, verified.stderr).toBe(0);
        expect(JSON.parse(await readFile(resultPath, "utf8"))).toEqual({ reopenedBodies: 14 });
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
