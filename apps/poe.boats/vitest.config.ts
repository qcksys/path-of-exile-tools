import { defineConfig } from "vite-plus";

export default defineConfig({
    resolve: {
        tsconfigPaths: true,
    },
    test: {
        environment: "node",
        include: ["test/**/*.test.{ts,tsx,mjs}"],
        exclude: ["test/e2e/**"],
        setupFiles: ["test/crafting-ui-setup.ts"],
    },
});
