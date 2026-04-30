import { defineConfig } from "vite-plus";

export default defineConfig({
    staged: {
        "*": "biome check --write",
    },
    resolve: {
        tsconfigPaths: true,
    },
});
