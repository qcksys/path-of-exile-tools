import { defineConfig } from "vite-plus";

export default defineConfig({
    staged: {
        "*": "biome check --write --no-errors-on-unmatched",
    },
    resolve: {
        tsconfigPaths: true,
    },
    // Only `test:scripts` runs vitest from the root. Pinned to `scripts/` so the
    // default repo-wide include does not collect the apps' tests, or the copies
    // of this repo checked out under `.claude/worktrees/`.
    test: {
        include: ["scripts/**/*.test.ts"],
    },
});
