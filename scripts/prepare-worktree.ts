// Runs from `prepare`, before `vp config` installs the hook driver. While an
// absolute `core.hooksPath` points at the main checkout's `.vite-hooks/_`,
// `vp config` leaves it in place and installs nothing in this checkout, so the
// worktree keeps running the main checkout's hooks. See docs/worktrees.md.

import { git, hooksPathScopes, isAbsoluteHooksPath } from "./unset-worktree-hookspath.ts";

export type HooksPathRepair =
    /** The shared config's absolute path was replaced with `.vite-hooks/_`. */
    | "local"
    /** The per-worktree override was removed, leaving the shared value. */
    | "worktree";

/**
 * Remove the per-worktree override and make an absolute shared value portable.
 * Unlike the commit hook, this unsets the override even when this checkout has
 * no hook driver yet: `vp config` runs next and installs one.
 */
export function prepareWorktree(cwd: string): HooksPathRepair[] {
    if (git(cwd, ["rev-parse", "--is-inside-work-tree"]) !== "true") return [];

    const byScope = hooksPathScopes(cwd);
    const repaired: HooksPathRepair[] = [];

    const local = byScope.get("local");
    if (local !== undefined && isAbsoluteHooksPath(local)) {
        git(cwd, ["config", "--local", "core.hooksPath", ".vite-hooks/_"]);
        repaired.push("local");
    }
    if (byScope.has("worktree")) {
        git(cwd, ["config", "--worktree", "--unset", "core.hooksPath"]);
        repaired.push("worktree");
    }

    return repaired;
}

if (import.meta.filename === process.argv[1]) {
    for (const scope of prepareWorktree(process.cwd())) {
        console.log(`prepare-worktree: repaired the ${scope} core.hooksPath`);
    }
}
