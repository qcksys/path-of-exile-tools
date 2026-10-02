import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

export default defineConfig({
    resolve: {
        tsconfigPaths: true,
        alias: {
            "cloudflare:workers": fileURLToPath(
                new URL("./test/e2e/cloudflare.ts", import.meta.url),
            ),
        },
    },
    test: {
        environment: "node",
        include: ["test/e2e/*.test.ts"],
        hookTimeout: 180_000,
        testTimeout: 30_000,
        env: {
            APP_ENV: "test",
            VARLOCK_TELEMETRY_DISABLED: "1",
            POE_USER_AGENT_CONTACT: "test@example.invalid",
            POE_LEAGUE: "Standard",
        },
    },
});
