import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { internal } from "varlock";
import { resolveCacheTtl } from "varlock/plugin-lib";
import { describe, expect, it } from "vite-plus/test";

const appDir = resolve(import.meta.dirname, "..");
const cli = resolve(appDir, "node_modules/varlock/bin/cli.js");
const packages = [
    ["web app", appDir],
    ["stash ingestor", resolve(appDir, "../../packages/poe-stash-ingest")],
    ["stash tracker", resolve(appDir, "../../packages/poe-stash-tracker")],
];
const fixtures = {
    LOG_LEVEL: "silent",
    DATABASE_URL: "mysql://test:test@localhost/poe_test",
    BETTER_AUTH_SECRET: "ci-only-not-a-real-secret-0000000000000000",
    GOOGLE_CLIENT_ID: "ci-only-client-id",
    GOOGLE_CLIENT_SECRET: "ci-only-google-secret",
    POE_CLIENT_ID: "ci-only-poe-client-id",
    POE_CLIENT_SECRET: "ci-only-poe-client-secret",
    POE_USER_AGENT_CONTACT: "test@example.invalid",
    POE_BOATS_INGEST_TOKEN: "ci-only-ingest-token",
    STASH_INGEST_TOKEN: "ci-only-ingest-token",
};

function loadEnv(
    directory = appDir,
    environment = "test",
    overrides: Record<string, string | undefined> = {},
) {
    return spawnSync(
        process.execPath,
        [
            cli,
            "load",
            "--path",
            ".env.schema",
            "--path",
            `.env.${environment}`,
            "--format",
            "json-full",
        ],
        {
            cwd: directory,
            encoding: "utf8",
            timeout: 20_000,
            env: {
                ...process.env,
                OP_SERVICE_ACCOUNT_TOKEN: "",
                PATH: process.env.PATH,
                SYSTEMROOT: process.env.SYSTEMROOT,
                TEMP: process.env.TEMP,
                TMP: process.env.TMP,
                USERPROFILE: process.env.USERPROFILE,
                VARLOCK_TELEMETRY_DISABLED: "1",
                APP_ENV: environment,
                ...fixtures,
                ...overrides,
            },
        },
    );
}

describe("environment configuration", () => {
    it.each(packages)("validates the %s without 1Password credentials", (_name, directory) => {
        const result = loadEnv(directory);
        expect(result.stderr).toBe("");
        expect(result.status).toBe(0);
    });

    describe.each(packages)("%s 1Password cache", (_name, directory) => {
        it.each([
            [undefined, "1h"],
            ["local", "1h"],
            ["dev", "1h"],
            ["test", undefined],
            ["prod", undefined],
        ])("uses the expected TTL for APP_ENV=%s", async (environment, expectedTtl) => {
            const graph = await internal.loadEnvGraph({
                entryFilePaths: [resolve(directory, ".env.schema")],
                overrideValues: {
                    ...(environment ? { APP_ENV: environment } : {}),
                    OP_SERVICE_ACCOUNT_TOKEN: "",
                },
                processEnvOverride: {},
                skipCache: true,
            });
            expect(internal.checkForSchemaErrors(graph, { noThrow: true }).hasErrors).toBe(false);
            const initializers = graph.getRootDecFns("initOp");
            expect(initializers).toHaveLength(1);
            const cacheTtl = initializers[0].decValueResolver?.objArgs?.cacheTtl;
            expect(cacheTtl).toBeDefined();
            expect(await resolveCacheTtl(cacheTtl)).toBe(expectedTtl);
        });
    });

    it.each([
        ["test", "local", "poe-boats.localhost"],
        ["dev", "dev", "dev.poe.boats"],
        ["prod", "prod", "poe.boats"],
    ])("selects the %s environment and auth hostname", (environment, name, hostname) => {
        const result = loadEnv(appDir, environment);
        expect(result.status).toBe(0);
        const graph = JSON.parse(result.stdout);
        expect(graph.config.ENVIRONMENT.value).toBe(name);
        expect(graph.config.URL.value).toBe(hostname);
    });

    it("excludes 1Password credentials and references from the deployed graph", () => {
        const result = loadEnv();
        expect(result.status).toBe(0);
        const graph = JSON.parse(result.stdout);
        expect(graph.config).not.toHaveProperty("OP_SERVICE_ACCOUNT_TOKEN");
        expect(graph.config).not.toHaveProperty("OP_ITEM");
        expect(graph.config).not.toHaveProperty("APP_ENV");
        expect(graph.config.DATABASE_URL.isSensitive).toBe(true);
        expect(graph.config.STASH_INGEST_TOKEN.isSensitive).toBe(true);
    });

    it.each([
        { DATABASE_URL: "not-a-url" },
        { BETTER_AUTH_SECRET: "too-short" },
        { GOOGLE_CLIENT_SECRET: "" },
        { STASH_INGEST_TOKEN: "" },
    ])("rejects invalid or missing credentials: %j", (overrides) => {
        const result = loadEnv(appDir, "test", overrides);
        expect(result.status).not.toBe(0);
    });
});
