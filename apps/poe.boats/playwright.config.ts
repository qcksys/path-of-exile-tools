import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:4173";

export default defineConfig({
    testDir: "./test/e2e/browser",
    forbidOnly: !!process.env.CI,
    workers: 1,
    use: {
        baseURL,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: {
        command:
            "vp run build && vp exec varlock-wrangler dev --config build/server/wrangler.json --ip 127.0.0.1 --port 4173 --inspector-port 0 --local",
        url: `${baseURL}/1/recombinator`,
        timeout: 120_000,
        env: {
            APP_ENV: "test",
            VARLOCK_TELEMETRY_DISABLED: "1",
            WRANGLER_SEND_METRICS: "false",
        },
    },
});
