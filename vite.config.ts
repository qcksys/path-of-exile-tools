import { defineConfig } from "vite-plus";

export default defineConfig({
    staged: {
        "*": "biome check --write --no-errors-on-unmatched",
    },
    resolve: {
        tsconfigPaths: true,
    },
});
