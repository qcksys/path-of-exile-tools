import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { describeMcpConfigGap, findMcpConfigGap } from "./check-claude-mcp.ts";

const roots: string[] = [];

interface CheckoutOptions {
    enabled?: string[];
    claudeScope?: string;
    servers?: Record<string, object>;
}

/** A checkout declaring two servers for Claude Code on project scope, and no `.mcp.json` yet. */
function checkout(options: CheckoutOptions = {}): string {
    const root = mkdtempSync(path.join(tmpdir(), "claude-mcp-"));
    roots.push(root);
    mkdirSync(path.join(root, ".agents"), { recursive: true });
    writeFileSync(
        path.join(root, ".agents", "agents.json"),
        JSON.stringify({
            integrations: {
                enabled: options.enabled ?? ["codex", "claude"],
                options: { claudeScope: options.claudeScope ?? "project" },
            },
            mcp: { servers: options.servers ?? { planetscale: {}, context7: {} } },
        }),
    );
    return root;
}

function writeMcpJson(root: string, names: string[]): void {
    const mcpServers = Object.fromEntries(
        names.map((name) => [name, { type: "http", url: "https://example.test" }]),
    );
    writeFileSync(path.join(root, ".mcp.json"), JSON.stringify({ mcpServers }));
}

afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("findMcpConfigGap", () => {
    it("reports every declared server when the file never arrived", () => {
        const root = checkout();

        expect(findMcpConfigGap(root)).toEqual({
            missing: ["planetscale", "context7"],
            fileAbsent: true,
        });
    });

    it("says nothing when every declared server is there", () => {
        const root = checkout();
        writeMcpJson(root, ["context7", "planetscale"]);

        expect(findMcpConfigGap(root)).toBeUndefined();
    });

    it("reports a server declared after the file was copied in", () => {
        const root = checkout();
        writeMcpJson(root, ["planetscale"]);

        expect(findMcpConfigGap(root)).toEqual({ missing: ["context7"], fileAbsent: false });
    });

    it("treats an unreadable file as absent rather than throwing at session start", () => {
        const root = checkout();
        writeFileSync(path.join(root, ".mcp.json"), "{ not json");

        expect(findMcpConfigGap(root)).toEqual({
            missing: ["planetscale", "context7"],
            fileAbsent: true,
        });
    });

    it("ignores servers the config keeps away from Claude Code", () => {
        const root = checkout({
            servers: {
                planetscale: {},
                off: { enabled: false },
                cursorOnly: { targets: ["cursor"] },
            },
        });
        writeMcpJson(root, ["planetscale"]);

        expect(findMcpConfigGap(root)).toBeUndefined();
    });

    // On local scope the agents CLI registers through the `claude` CLI, and
    // `.mcp.json` is not where Claude Code's servers come from.
    it("has no opinion when Claude Code is not on project scope", () => {
        expect(findMcpConfigGap(checkout({ claudeScope: "local" }))).toBeUndefined();
        expect(findMcpConfigGap(checkout({ enabled: ["codex"] }))).toBeUndefined();
    });

    it("does nothing outside a checkout the agents CLI manages", () => {
        const root = mkdtempSync(path.join(tmpdir(), "claude-mcp-"));
        roots.push(root);

        expect(findMcpConfigGap(root)).toBeUndefined();
    });
});

describe("describeMcpConfigGap", () => {
    it("names the servers and the command that brings them back", () => {
        const message = describeMcpConfigGap({
            missing: ["planetscale", "context7"],
            fileAbsent: true,
        });

        expect(message).toContain("has no .mcp.json");
        expect(message).toContain("planetscale, context7");
        expect(message).toContain("vp run agents:sync");
        expect(message).toContain("start a new session");
    });

    it("tells a stale file apart from a missing one", () => {
        expect(describeMcpConfigGap({ missing: ["planetscale"], fileAbsent: false })).toContain(
            "older than .agents/agents.json",
        );
    });
});
