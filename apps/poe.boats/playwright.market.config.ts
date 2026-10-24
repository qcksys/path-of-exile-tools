import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

export default defineConfig({
    ...config,
    testMatch: "market.spec.ts",
    testIgnore: [],
    webServer: {
        ...config.webServer,
        command:
            process.env.PLAYWRIGHT_SKIP_BUILD === "1"
                ? "vp exec tsx test/e2e/market-browser-server.ts"
                : "vp run build && vp exec tsx test/e2e/market-browser-server.ts",
        timeout: 180_000,
    },
});
