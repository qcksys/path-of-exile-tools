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
        maxWorkers: 2,
        include: ["test/**/*.test.{ts,tsx,mjs}"],
        exclude: ["test/e2e/**"],
        setupFiles: ["test/crafting-ui-setup.ts"],
    },
});
