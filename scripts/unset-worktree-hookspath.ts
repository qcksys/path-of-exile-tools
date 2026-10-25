// Clears the per-worktree `core.hooksPath` override that Claude Code Desktop's
// worktree manager writes into `.git/worktrees/<name>/config.worktree`. The
// value is absolute and points at the main checkout's hook driver, shadowing
// the relative `.vite-hooks/_` in the repository's own config, so the worktree
// runs the main checkout's hooks — or none, when the driver there is missing or
// cannot be dispatched from a backslashed path. See docs/worktrees.md.
//
// Wired to PreToolUse on `Bash(git commit *)` and `PowerShell(git commit *)` —
// a commit can come through either tool — rather than SessionStart, because
// the desktop writes the override when it binds a session to a worktree: a
// session-start repair would be racing the thing that causes the problem, while
// a commit happens long afterwards and cannot lose.

import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";

import { hookCwd, readHookInput } from "./claude-hook.ts";

export type OverrideResult =
    /** No worktree-scope override — the ordinary case, and in the main checkout. */
    | "none"
    /** The override was shadowing the repository's own hooksPath; removed. */
    | "cleared"
    /** This checkout has no usable hook of its own, so removing the override would leave the commit unlinted. */
    | "kept";

export function git(cwd: string, args: readonly string[]): string | undefined {
    try {
        return execFileSync("git", ["-C", cwd, ...args], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
    } catch {
        return undefined;
    }
}

/**
 * Which config scope supplies each `core.hooksPath`. Read by scope, never by
 * value — `git config --worktree --get` falls back to the local value when
 * `extensions.worktreeConfig` is off, so asking that way reports an override
 * that does not exist and unsetting it would delete the repository's own.
 */
export function hooksPathScopes(cwd: string): Map<string, string> {
    const rows = git(cwd, ["config", "--show-scope", "--get-all", "core.hooksPath"]);
    const byScope = new Map<string, string>();
    for (const row of rows?.split("\n") ?? []) {
        const [scope, ...value] = row.split("\t");
        if (scope !== undefined && value.length > 0) {
            byScope.set(scope.trim(), value.join("\t").trim());
        }
    }
    return byScope;
}

export function isAbsoluteHooksPath(value: string): boolean {
    return path.isAbsolute(value) || path.win32.isAbsolute(value);
}

function hasRepositoryPreCommitHook(cwd: string, hooksPath: string): boolean {
    if (isAbsoluteHooksPath(hooksPath)) return false;

    const root = git(cwd, ["rev-parse", "--show-toplevel"]);
    if (root === undefined) return false;

    return (
        statSync(path.resolve(root, hooksPath, "pre-commit"), {
            throwIfNoEntry: false,
        })?.isFile() ?? false
    );
}

export function clearWorktreeHooksPath(cwd: string): OverrideResult {
    const byScope = hooksPathScopes(cwd);
    if (!byScope.has("worktree")) return "none";
    // Unsetting when this checkout has no hook driver of its own would swap a
    // commit that runs the main checkout's hooks for one that runs none.
    const local = byScope.get("local");
    if (local === undefined || !hasRepositoryPreCommitHook(cwd, local)) return "kept";

    return git(cwd, ["config", "--worktree", "--unset", "core.hooksPath"]) === undefined
        ? "kept"
        : "cleared";
}

/**
 * The shared `.git/config` carrying an absolute path breaks a commit the same
 * way the worktree override does, and this script deliberately will not repair
 * it: that file is shared with the main checkout and every other worktree.
 */
export function sharedHooksPathIsAbsolute(cwd: string): boolean {
    const local = hooksPathScopes(cwd).get("local");
    return local !== undefined && isAbsoluteHooksPath(local);
}

async function main(): Promise<void> {
    const cwd = hookCwd(await readHookInput());

    // PreToolUse stdout is not added to the conversation, so a repair stays
    // silent. Only what still leaves the commit broken is worth a word.
    const warning =
        clearWorktreeHooksPath(cwd) === "kept"
            ? "A per-worktree core.hooksPath override is set, but this checkout has no usable repository pre-commit hook to replace it. Run `vp install`, then retry the commit."
            : sharedHooksPathIsAbsolute(cwd)
              ? "The shared .git/config carries an absolute core.hooksPath. Set it back with `git config --local core.hooksPath .vite-hooks/_` — it is shared with every worktree, so this script will not touch it."
              : undefined;
    if (warning === undefined) return;

    console.error(`${warning} This commit may skip or break its hooks — see docs/worktrees.md.`);
    process.exitCode = 1;
}

if (import.meta.filename === process.argv[1]) await main();
