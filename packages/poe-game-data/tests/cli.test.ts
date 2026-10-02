import { runCli } from "@poe-tools/cli";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { createProgram } from "../src/cli.ts";
import { materializePackage } from "../src/distribute.ts";
import { verify } from "../src/pipeline.ts";
import { discoverVersion } from "../src/versions.ts";

vi.mock("../src/distribute.ts", () => ({
    commitDataPackages: vi.fn(),
    dataPackages: { poe1: "poe-1-data", poe2: "poe-2-data" },
    materializePackage: vi.fn(),
    verifyDataPackage: vi.fn(),
}));
vi.mock("../src/pipeline.ts", () => ({
    counts: vi.fn(),
    packageDirectory: ".",
    replay: vi.fn(),
    run: vi.fn(),
    verify: vi.fn(),
}));
vi.mock("../src/versions.ts", () => ({ discoverVersion: vi.fn() }));
beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
function program() {
    const cli = createProgram();
    for (const command of [cli, ...cli.commands])
        command.configureOutput({ writeOut: () => {}, writeErr: () => {} });
    return cli;
}

it("discovers only the requested game and retains JSON output", async () => {
    vi.mocked(discoverVersion).mockResolvedValue("4.5.5.4");
    expect(await runCli(program(), ["versions", "--game", "poe2"])).toBe(0);
    expect(discoverVersion).toHaveBeenCalledExactlyOnceWith("poe2");
    expect(JSON.parse(vi.mocked(console.log).mock.calls[0]![0])).toEqual({
        poe2: { patch: "4.5.5.4" },
    });
});
it.each([
    ["versions", "--game", "poe3"],
    ["versions", "--snapshot", "unexpected"],
    ["package"],
    ["inspect", "--snapshot", "fixture", "--base", "belt", "--item-level", "101"],
    ["inspect", "--item-level", "NaN"],
])("rejects invalid extraction arguments before I/O: %j", async (...args) => {
    expect(await runCli(program(), args)).toBe(1);
    expect(discoverVersion).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
    expect(materializePackage).not.toHaveBeenCalled();
});
