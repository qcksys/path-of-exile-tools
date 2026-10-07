import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import type { SerializedEnvGraph } from "varlock";
import { execSyncVarlock } from "varlock/exec-sync-varlock";
import { unstable_startWorker } from "wrangler";

const fixtures = parseEnv(await readFile(new URL("../../.env.test", import.meta.url), "utf8"));
const { stdout } = execSyncVarlock("load --format json-full --compact", {
    fullResult: true,
    env: { ...process.env, ...fixtures, APP_ENV: "test", OP_SERVICE_ACCOUNT_TOKEN: "" },
});
const graph: SerializedEnvGraph = JSON.parse(stdout);
const worker = await unstable_startWorker({
    config: "build/server/wrangler.json",
    bindings: {
        ...Object.fromEntries(
            Object.entries(graph.config)
                .filter(([, item]) => item.value !== undefined)
                .map(([name, item]) => [
                    name,
                    {
                        type: "plain_text",
                        value:
                            typeof item.value === "string"
                                ? item.value
                                : JSON.stringify(item.value),
                    },
                ]),
        ),
        // biome-ignore lint/style/useNamingConvention: Varlock requires this binding name.
        __VARLOCK_ENV: { type: "plain_text", value: stdout },
    },
    sendMetrics: false,
    dev: {
        server: { hostname: "127.0.0.1", port: Number(process.env.PLAYWRIGHT_PORT ?? 4173) },
        remote: false,
        // Wrangler's inspector stalls forwarding large retained-catalog fetch events on Windows.
        inspector: false,
        watch: false,
        persist: false,
    },
});
await worker.ready;
console.log(`Browser test server ready at ${await worker.url}`);

for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, async () => {
        await worker.dispose();
        process.exit(0);
    });
