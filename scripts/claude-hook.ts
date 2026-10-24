// Shared plumbing for the hooks wired up in `.claude/settings.json`. Each of
// them repairs or reports something a fresh worktree gets wrong, and each needs
// to know which checkout it is looking at.

/** Everything Claude Code piped in, or "" when the script is run by hand. */
export async function readHookInput(): Promise<string> {
    if (process.stdin.isTTY) return "";
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8");
}

/**
 * The hook's `cwd` field. This is the only thing that follows Claude into a
 * worktree — `${CLAUDE_PROJECT_DIR}` stays at the main checkout the session
 * started in. Falls back to ours for a hand run.
 */
export function hookCwd(payload: string): string {
    try {
        const { cwd } = JSON.parse(payload) as { cwd?: unknown };
        if (typeof cwd === "string" && cwd.length > 0) return cwd;
    } catch {
        // Not hook input — a hand run, or an event shape we don't know.
    }
    return process.cwd();
}
