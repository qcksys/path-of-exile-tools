import { defineConfig } from "vite-plus";

export default defineConfig({
    test: {
        passWithNoTests: true,
    },
    pack: {
        entry: ["src/index.ts"],
        format: "esm",
        dts: true,
        fixedExtension: true,
    },
    resolve: {
        tsconfigPaths: true,
    },
});
