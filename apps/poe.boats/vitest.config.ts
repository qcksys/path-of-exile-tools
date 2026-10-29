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
        // CI runners have 4 vCPUs. Locally, half the cores or more slows the CPU-heavy
        // crafting and DuckDB tests past their timeouts.
        maxWorkers: process.env.CI ? 2 : "40%",
        include: ["test/**/*.test.{ts,tsx,mjs}"],
        exclude: ["test/e2e/**"],
        setupFiles: ["test/crafting-ui-setup.ts"],
    },
});
