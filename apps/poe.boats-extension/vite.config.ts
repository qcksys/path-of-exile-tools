import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

export default defineConfig({
    resolve: {
        alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
    },
    test: {
        environment: "node",
        include: ["test/**/*.test.ts"],
    },
});
