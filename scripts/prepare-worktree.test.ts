import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { prepareWorktree } from "./prepare-worktree.ts";

const repos: string[] = [];

const git = (cwd: string, args: string[]) =>
    execFileSync("git", ["-C", cwd, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
    }).trim();

const scopes = (root: string) => {
    try {
        return git(root, ["config", "--show-scope", "--get-all", "core.hooksPath"]);
    } catch {
        return "";
    }
};

function repo(): string {
    const root = mkdtempSync(path.join(tmpdir(), "prepare-worktree-"));
    repos.push(root);
    git(root, ["init", "-q", "-b", "main"]);
    git(root, ["config", "extensions.worktreeConfig", "true"]);
    return root;
}

afterEach(() => {
    for (const root of repos.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("prepareWorktree", () => {
    it("removes the worktree override before a hook driver exists", () => {
        const root = repo();
        git(root, ["config", "--local", "core.hooksPath", ".vite-hooks/_"]);
        git(root, ["config", "--worktree", "core.hooksPath", "F:\\main\\.vite-hooks\\_"]);

        expect(prepareWorktree(root)).toEqual(["worktree"]);
        expect(scopes(root)).toBe("local\t.vite-hooks/_");
    });

    it("makes an absolute shared path portable", () => {
        const root = repo();
        git(root, ["config", "--local", "core.hooksPath", "F:\\shared\\.vite-hooks\\_"]);

        expect(prepareWorktree(root)).toEqual(["local"]);
        expect(scopes(root)).toBe("local\t.vite-hooks/_");
    });

    it("leaves a portable configuration alone", () => {
        const root = repo();
        git(root, ["config", "--local", "core.hooksPath", ".vite-hooks/_"]);

        expect(prepareWorktree(root)).toEqual([]);
        expect(scopes(root)).toBe("local\t.vite-hooks/_");
    });

    it("does nothing outside a repository", () => {
        const root = mkdtempSync(path.join(tmpdir(), "prepare-worktree-"));
        repos.push(root);

        expect(prepareWorktree(root)).toEqual([]);
    });
});
