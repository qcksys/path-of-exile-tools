// Says so, at SessionStart, when this checkout's `.mcp.json` is missing servers
// that `.agents/agents.json` declares. Wired up in `.claude/settings.json`; safe
// to run by hand.
//
// This exists because the failure is otherwise silent. Claude Code reads MCP
// configuration once, at session start, and a server it never loaded is not an
// error anywhere — its tools are simply not in the list. The file is generated
// and gitignored, so a fresh clone, a main checkout nobody re-synced, and a
// worktree older than its `.worktreeinclude` entry all start without it.
//
// It reports and never repairs: generating the file takes an install a fresh
// worktree does not have, and the session that needed it has already started.

import { readFileSync } from "node:fs";
import path from "node:path";

import { hookCwd, readHookInput } from "./claude-hook.ts";
import { git } from "./unset-worktree-hookspath.ts";

interface AgentsConfig {
    integrations?: { enabled?: unknown[]; options?: { claudeScope?: unknown } };
    mcp?: { servers?: Record<string, { enabled?: unknown; targets?: unknown }> };
}

function readJson<T>(file: string): T | undefined {
    try {
        return JSON.parse(readFileSync(file, "utf8")) as T;
    } catch {
        return undefined;
    }
}

/** The servers `.agents/agents.json` hands to Claude Code through `.mcp.json`. */
function declaredServers(config: AgentsConfig): string[] {
    const enabled = config.integrations?.enabled ?? [];
    // On local scope the agents CLI registers servers through the `claude`
    // CLI instead, and `.mcp.json` says nothing about what loaded.
    if (!enabled.includes("claude") || config.integrations?.options?.claudeScope !== "project") {
        return [];
    }

    return Object.entries(config.mcp?.servers ?? {})
        .filter(([, server]) => server.enabled !== false)
        .filter(([, server]) => !Array.isArray(server.targets) || server.targets.includes("claude"))
        .map(([name]) => name);
}

export interface McpConfigGap {
    /** Declared servers this checkout's `.mcp.json` does not carry. */
    missing: string[];
    /** True when there is no readable `.mcp.json` at all. */
    fileAbsent: boolean;
}

/** What `<root>/.mcp.json` lacks, or `undefined` when nothing is missing. */
export function findMcpConfigGap(root: string): McpConfigGap | undefined {
    const config = readJson<AgentsConfig>(path.join(root, ".agents", "agents.json"));
    if (config === undefined) return undefined;

    const declared = declaredServers(config);
    const materialized = readJson<{ mcpServers?: Record<string, unknown> }>(
        path.join(root, ".mcp.json"),
    );
    const present = new Set(Object.keys(materialized?.mcpServers ?? {}));

    const missing = declared.filter((name) => !present.has(name));
    return missing.length === 0 ? undefined : { missing, fileAbsent: materialized === undefined };
}

export function describeMcpConfigGap(gap: McpConfigGap): string {
    const what = gap.fileAbsent
        ? "This checkout has no .mcp.json, so none of the project's MCP servers loaded"
        : "This checkout's .mcp.json is older than .agents/agents.json, so some of the project's MCP servers did not load";

    return `${what}: ${gap.missing.join(", ")}. Their tools are absent from this session, not broken. Claude Code reads MCP configuration once, at session start, so tell the user: run \`vp install\` (its prepare step runs \`vp run agents:sync\`) in this checkout and start a new session — and in the main checkout too, which is where new worktrees copy the file from. See docs/worktrees.md.`;
}

async function main(): Promise<void> {
    // `${CLAUDE_PROJECT_DIR}` stays at the main checkout, so resolve the
    // checkout from the hook's `cwd`, which follows Claude into a worktree.
    const root = git(hookCwd(await readHookInput()), ["rev-parse", "--show-toplevel"]);
    if (root === undefined) return;

    // SessionStart stdout becomes context Claude can read, so say something
    // only when servers are actually missing.
    const gap = findMcpConfigGap(root);
    if (gap !== undefined) console.log(describeMcpConfigGap(gap));
}

if (import.meta.filename === process.argv[1]) await main();
