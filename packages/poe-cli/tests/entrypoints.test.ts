import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vite-plus/test";

const execute = promisify(execFile);
const root = fileURLToPath(new URL("../../../", import.meta.url));
const tsx = createRequire(import.meta.url).resolve("tsx/cli");
const entrypoints = [
    ["packages/poe-game-data/src/cli.ts"],
    ["packages/poe-stash-ingest/src/cx/cli.ts"],
    ["packages/poe-stash-ingest/src/ps/cli.ts"],
    ["packages/poe-stash-tracker/src/cli.ts"],
    ["packages/poe-stash-tracker/src/cli.ts", "ingest-cx"],
    ["packages/poe-stash-tracker/src/cli.ts", "ingest-ps"],
    ["packages/poe-stash-tracker/src/cli.ts", "leagues"],
    ["packages/poe-stash-tracker/src/cli.ts", "build-basemap"],
    ["apps/poe.boats/scripts/poedb-idol-converter/index.ts"],
    ["apps/poe.boats/scripts/poedb-scarab-converter/index.ts"],
    ["apps/poe.boats/scripts/trade-stats-fetcher/index.ts"],
    ["apps/poe.boats/scripts/league-fetcher/index.ts"],
    ["apps/poe.boats/scripts/export-recombinator-catalog.ts"],
    ["apps/poe.boats/scripts/validate-vendor-recipes.ts"],
    ["apps/poe.boats/scripts/check-locales.mjs"],
];

it.each(entrypoints)("shows help without credentials or side effects: %s", async (...entry) => {
    const { stdout, stderr } = await execute(
        process.execPath,
        [tsx, resolve(root, entry[0]!), ...entry.slice(1), "--help"],
        {
            cwd: root,
            env: {
                ...process.env,
                APP_ENV: "missing-cli-help-environment",
                CI: "true",
                POE_CLIENT_ID: "",
                POE_CLIENT_SECRET: "",
                POE_LEAGUE: "",
            },
            timeout: 15_000,
        },
    );
    expect(stdout).toContain("Usage:");
    expect(stderr).not.toContain("Missing required");
}, 20_000);
