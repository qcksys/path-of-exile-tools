import * as prompts from "@clack/prompts";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { Command, positiveInteger, runCli } from "../src/index.ts";

vi.mock("@clack/prompts", () => ({
    select: vi.fn(),
    text: vi.fn(),
    confirm: vi.fn(),
    intro: vi.fn(),
    outro: vi.fn(),
    cancel: vi.fn(),
    log: { error: vi.fn() },
    isCancel: (value: unknown) => typeof value === "symbol",
}));

const inputTty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
const outputTty = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
function tty(enabled: boolean) {
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: enabled });
    Object.defineProperty(process.stderr, "isTTY", { configurable: true, value: enabled });
}
beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CI", "");
    tty(false);
});
afterEach(() => {
    vi.unstubAllEnvs();
    if (inputTty) Object.defineProperty(process.stdin, "isTTY", inputTty);
    else Reflect.deleteProperty(process.stdin, "isTTY");
    if (outputTty) Object.defineProperty(process.stderr, "isTTY", outputTty);
    else Reflect.deleteProperty(process.stderr, "isTTY");
});
function fixture() {
    const output: string[] = [];
    const errors: string[] = [];
    const action = vi.fn();
    const program = new Command().name("fixture").configureOutput({
        writeOut: (text) => output.push(text),
        writeErr: (text) => errors.push(text),
    });
    program
        .command("ingest")
        .argument("[cursor]", "starting cursor")
        .option("--pages <n>", "page count", positiveInteger, 3)
        .option("--no-currency", "skip currency")
        .option(
            "--existing <id>",
            "existing ID",
            (value: string, previous: string[]) => [...previous, value],
            [],
        )
        .action(action);
    return { program, action, output, errors };
}

it("preserves positional arguments, repeated flags and explicit negation without prompts", async () => {
    const { program, action } = fixture();
    expect(
        await runCli(program, [
            "ingest",
            "cursor",
            "--pages",
            "2",
            "--no-currency",
            "--existing",
            "a",
            "--existing",
            "b",
        ]),
    ).toBe(0);
    expect(action.mock.calls[0]?.slice(0, 2)).toEqual([
        "cursor",
        { pages: 2, currency: false, existing: ["a", "b"] },
    ]);
    expect(prompts.text).not.toHaveBeenCalled();
});
it.each([
    ["--help"],
    ["ingest", "--help"],
    [],
])("prints help without performing work: %j", async (...args) => {
    const { program, action, output } = fixture();
    expect(await runCli(program, args)).toBe(0);
    expect(output.join("")).toContain("Usage:");
    expect(action).not.toHaveBeenCalled();
});
it.each([
    ["unknown"],
    ["ingest", "--typo"],
    ["ingest", "--pages", "NaN"],
    ["ingest", "--pages", "0"],
    ["ingest", "--pages", "1.5"],
])("rejects invalid input before work: %j", async (...args) => {
    const { program, action, errors } = fixture();
    expect(await runCli(program, args)).toBe(1);
    expect(errors.length).toBeGreaterThan(0);
    expect(action).not.toHaveBeenCalled();
});
it("prompts for omitted values without overwriting explicit CLI values", async () => {
    tty(true);
    const { program, action } = fixture();
    vi.mocked(prompts.text)
        .mockResolvedValueOnce("chosen-cursor")
        .mockResolvedValueOnce("existing-mod");
    expect(
        await runCli(program, ["ingest", "--interactive", "--pages", "7", "--no-currency"]),
    ).toBe(0);
    expect(action.mock.calls[0]?.slice(0, 2)).toEqual([
        "chosen-cursor",
        { pages: 7, currency: false, existing: ["existing-mod"] },
    ]);
    expect(prompts.confirm).not.toHaveBeenCalled();
    expect(prompts.text).toHaveBeenCalledWith(expect.objectContaining({ output: process.stderr }));
});
it("opens a command picker for a bare interactive invocation", async () => {
    tty(true);
    const { program, action } = fixture();
    vi.mocked(prompts.select).mockResolvedValue("ingest");
    vi.mocked(prompts.text).mockResolvedValue("");
    vi.mocked(prompts.confirm).mockResolvedValue(false);
    expect(await runCli(program, [])).toBe(0);
    expect(prompts.select).toHaveBeenCalled();
    expect(action.mock.calls[0]?.[1]).toEqual({ pages: 3, currency: true, existing: [] });
});
it("cancels without dispatching the selected command", async () => {
    tty(true);
    const { program, action } = fixture();
    vi.mocked(prompts.text).mockResolvedValue(
        Symbol.for("cancel") as Awaited<ReturnType<typeof prompts.text>>,
    );
    expect(await runCli(program, ["ingest", "--interactive"])).toBe(130);
    expect(action).not.toHaveBeenCalled();
    expect(prompts.cancel).toHaveBeenCalled();
});
it.each([false, true])("refuses interactive mode without a usable terminal (CI=%s)", async (ci) => {
    tty(ci);
    if (ci) vi.stubEnv("CI", "true");
    const { program, action } = fixture();
    expect(await runCli(program, ["ingest", "--interactive"])).toBe(1);
    expect(action).not.toHaveBeenCalled();
    expect(prompts.text).not.toHaveBeenCalled();
});
it("disables prompts explicitly even on a terminal", async () => {
    tty(true);
    const { program, action } = fixture();
    expect(await runCli(program, ["ingest", "--no-interactive"])).toBe(0);
    expect(action).toHaveBeenCalled();
    expect(prompts.text).not.toHaveBeenCalled();
});
