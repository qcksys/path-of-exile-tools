import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vite-plus/test";
import { openDb } from "../../../packages/poe-stash-ingest/src/shared/db";

// The deploy README compacts a stopped worker's database with `docker run <image> compact`, where
// none of the worker's credentials or settings are set. Every other command loads and checks them.
it("runs compact without the worker's environment", async () => {
    const dir = await mkdtemp(join(tmpdir(), "compact-command-"));
    try {
        const source = join(dir, "market.duckdb");
        const db = await openDb(source);
        await db.conn.run(
            "INSERT INTO rollup_state VALUES ('psapi', 'Standard', 3600, current_timestamp, 1)",
        );
        await db.close();
        const run = spawnSync(
            process.execPath,
            [
                "src/ps/cli.ts",
                "compact",
                source,
                join(dir, "copy.duckdb"),
                "--memory-limit",
                "512MB",
            ],
            {
                cwd: resolve(import.meta.dirname, "../../../packages/poe-stash-ingest"),
                encoding: "utf8",
                timeout: 60_000,
                // Only what a process needs to start; nothing the worker's configuration reads,
                // which the app's ProcessEnv declares as always set.
                env: Object.fromEntries(
                    ["PATH", "Path", "SystemRoot", "HOME", "USERPROFILE", "TEMP", "TMP", "TMPDIR"]
                        .filter((name) => process.env[name] !== undefined)
                        .map((name) => [name, process.env[name]]),
                ) as NodeJS.ProcessEnv,
            },
        );
        expect(run.status, run.stderr).toBe(0);
        expect(JSON.parse(run.stdout)).toMatchObject({
            targetStorage: expect.stringMatching(/^v2\./),
            tables: expect.arrayContaining([{ name: "rollup_state", rows: 1 }]),
        });
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}, 90_000);
