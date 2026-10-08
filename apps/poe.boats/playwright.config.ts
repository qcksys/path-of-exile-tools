import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("PLAYWRIGHT_PORT must be an integer between 1024 and 65535.");
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
    testDir: "./test/e2e/browser",
    forbidOnly: !!process.env.CI,
    fullyParallel: true,
    workers: 1,
    use: {
        baseURL,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: {
        command:
            process.env.PLAYWRIGHT_SKIP_BUILD === "1"
                ? "vp exec tsx test/e2e/server.ts"
                : "vp run build && vp exec tsx test/e2e/server.ts",
        url: `${baseURL}/1/recombinator`,
        timeout: 120_000,
        env: {
            PLAYWRIGHT_PORT: String(port),
            APP_ENV: "test",
            VARLOCK_TELEMETRY_DISABLED: "1",
            WRANGLER_SEND_METRICS: "false",
        },
    },
});
