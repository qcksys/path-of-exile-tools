import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { clearWorktreeHooksPath, sharedHooksPathIsAbsolute } from "./unset-worktree-hookspath.ts";

const repos: string[] = [];

const git = (cwd: string, args: string[]) =>
    execFileSync("git", ["-C", cwd, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
    }).trim();

/** A repository with worktree-scoped config available, as a real checkout has. */
function repo({ worktreeConfig = true } = {}): string {
    const root = mkdtempSync(path.join(tmpdir(), "hookspath-"));
    repos.push(root);
    git(root, ["init", "-q", "-b", "main"]);
    if (worktreeConfig) git(root, ["config", "extensions.worktreeConfig", "true"]);
    return root;
}

const worktreeValue = (root: string) => {
    try {
        return git(root, ["config", "--worktree", "--get", "core.hooksPath"]);
    } catch {
        return undefined;
    }
};

function installRepositoryHook(root: string): void {
    const hooks = path.join(root, ".vite-hooks", "_");
    mkdirSync(hooks, { recursive: true });
    writeFileSync(path.join(hooks, "pre-commit"), "#!/bin/sh\n");
}

afterEach(() => {
    for (const root of repos.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("clearWorktreeHooksPath", () => {
    it("does nothing when there is no override", () => {
        const root = repo();
        git(root, ["config", "--local", "core.hooksPath", ".vite-hooks/_"]);

        expect(clearWorktreeHooksPath(root)).toBe("none");
        expect(git(root, ["config", "--local", "--get", "core.hooksPath"])).toBe(".vite-hooks/_");
    });

    it("clears an override that shadows the repository's own hooksPath", () => {
        const root = repo();
        git(root, ["config", "--local", "core.hooksPath", ".vite-hooks/_"]);
        git(root, ["config", "--worktree", "core.hooksPath", "F:\\somewhere\\.vite-hooks\\_"]);
        installRepositoryHook(root);

        expect(clearWorktreeHooksPath(root)).toBe("cleared");
        expect(worktreeValue(root)).toBeUndefined();
        expect(git(root, ["config", "--get", "core.hooksPath"])).toBe(".vite-hooks/_");
    });

    it("keeps an override when the repository config has no hooksPath", () => {
        const root = repo();
        git(root, ["config", "--worktree", "core.hooksPath", "F:\\somewhere\\.vite-hooks\\_"]);

        expect(clearWorktreeHooksPath(root)).toBe("kept");
        expect(worktreeValue(root)).toBe("F:\\somewhere\\.vite-hooks\\_");
    });

    it("keeps an override when the repository hook has not been installed", () => {
        const root = repo();
        git(root, ["config", "--local", "core.hooksPath", ".vite-hooks/_"]);
        git(root, ["config", "--worktree", "core.hooksPath", "F:\\somewhere\\.vite-hooks\\_"]);

        expect(clearWorktreeHooksPath(root)).toBe("kept");
        expect(worktreeValue(root)).toBe("F:\\somewhere\\.vite-hooks\\_");
    });

    it("keeps an override when the repository hooksPath is absolute", () => {
        const root = repo();
        git(root, ["config", "--local", "core.hooksPath", "F:\\shared\\.vite-hooks\\_"]);
        git(root, ["config", "--worktree", "core.hooksPath", "F:\\somewhere\\.vite-hooks\\_"]);

        expect(clearWorktreeHooksPath(root)).toBe("kept");
        expect(worktreeValue(root)).toBe("F:\\somewhere\\.vite-hooks\\_");
    });

    // `git config --worktree --get` falls back to the local value when
    // worktree config is off, so asking by value rather than by scope reports
    // an override that isn't there — and unsetting it deletes the repository's
    // own hooksPath, leaving commits unlinted.
    it("leaves the repository's hooksPath alone when worktree config is off", () => {
        const root = repo({ worktreeConfig: false });
        git(root, ["config", "--local", "core.hooksPath", ".vite-hooks/_"]);

        expect(clearWorktreeHooksPath(root)).toBe("none");
        expect(git(root, ["config", "--local", "--get", "core.hooksPath"])).toBe(".vite-hooks/_");
    });

    it("does not repair the shared config, only reports it", () => {
        const root = repo();
        git(root, ["config", "--local", "core.hooksPath", "F:\\shared\\.vite-hooks\\_"]);

        expect(clearWorktreeHooksPath(root)).toBe("none");
        expect(git(root, ["config", "--local", "--get", "core.hooksPath"])).toBe(
            "F:\\shared\\.vite-hooks\\_",
        );
    });

    it("is silent about a directory that is not a repository at all", () => {
        const root = mkdtempSync(path.join(tmpdir(), "hookspath-"));
        repos.push(root);

        expect(clearWorktreeHooksPath(root)).toBe("none");
    });
});

describe("sharedHooksPathIsAbsolute", () => {
    it("spots an absolute shared path", () => {
        const root = repo();
        git(root, ["config", "--local", "core.hooksPath", "F:\\shared\\.vite-hooks\\_"]);

        expect(sharedHooksPathIsAbsolute(root)).toBe(true);
    });

    it("accepts the relative path the repo is supposed to carry", () => {
        const root = repo();
        git(root, ["config", "--local", "core.hooksPath", ".vite-hooks/_"]);

        expect(sharedHooksPathIsAbsolute(root)).toBe(false);
    });

    it("is false when nothing sets a hooksPath", () => {
        expect(sharedHooksPathIsAbsolute(repo())).toBe(false);
    });
});
