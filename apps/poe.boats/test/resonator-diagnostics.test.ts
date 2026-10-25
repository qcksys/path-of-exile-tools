import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
    createResonatorDiagnostics,
    type ResonatorDiagnosticFixture,
} from "../../../packages/poe-stash-ingest/src/ps/resonator-diagnostics";
import { loadResonatorDiagnostics } from "../../../packages/poe-stash-ingest/src/ps/resonator-diagnostics-request";

vi.mock("node:fs/promises", async (original) => {
    const actual = await original<typeof fs>();
    return { ...actual, writeFile: vi.fn(actual.writeFile), rename: vi.fn(actual.rename) };
});

const base = "Prime Chaotic Resonator";
const observedAt = new Date("2026-10-25T08:35:00Z");
let directory: string;
function raw() {
    return {
        baseType: base,
        typeLine: base,
        name: "",
        frameType: 5,
        frameTypeId: "currency",
        rarity: "Currency",
        identified: true,
        corrupted: false,
        verified: true,
        stackSize: 1,
        maxStackSize: 10,
        foilVariation: null,
        sockets: Array.from({ length: 4 }, (_, group) => ({ group, attr: "DV", sColour: "DV" })),
        socketedItems: [],
    };
}
function options() {
    return {
        statusFile: join(directory, "status.json"),
        realm: "pc",
        league: "Allflame",
        expiresAt: Date.now() + 3_600_000,
    };
}
function create(overrides: Partial<Parameters<typeof createResonatorDiagnostics>[0]> = {}) {
    return createResonatorDiagnostics({ ...options(), ...overrides });
}
async function saved() {
    const text = await fs.readFile(join(directory, "resonator-diagnostics.json"), "utf8");
    return { text, fixtures: JSON.parse(text).fixtures as ResonatorDiagnosticFixture[] };
}
async function request(value: unknown) {
    await fs.writeFile(
        join(directory, "resonator-diagnostics.request.json"),
        JSON.stringify(value),
    );
    return loadResonatorDiagnostics(options());
}
function validRequest() {
    return {
        format: 1,
        realm: "pc",
        league: "Allflame",
        expiresAt: new Date(Date.now() + 1000).toISOString(),
    };
}
beforeEach(async () => {
    directory = await fs.mkdtemp(join(tmpdir(), "poe-resonator-diagnostics-"));
    vi.clearAllMocks();
});
afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(directory, { recursive: true, force: true });
});

describe("bounded resonator shape diagnostics", () => {
    it("limits activation to PC, a specific league and a current expiry within 24 hours", () => {
        vi.spyOn(Date, "now").mockReturnValue(observedAt.getTime());
        for (const override of [
            { statusFile: undefined },
            { realm: "poe2" },
            { realm: "xbox" },
            { league: "" },
            { league: "all" },
            { league: "x".repeat(101) },
            { expiresAt: Date.now() },
            { expiresAt: Number.NaN },
            { expiresAt: Date.now() + 86_400_001 },
        ])
            expect(create(override)).toBeUndefined();
        expect(create()).toBeDefined();
    });

    it("retains exact known shape evidence without identities, arbitrary strings or nested contents", async () => {
        const diagnostics = create()!;
        const input = {
            ...raw(),
            id: "private-id",
            accountName: "private-account",
            note: "private-price",
            icon: "private-icon",
            privateField: "private-value",
            name: "private-name",
            sockets: [{ group: 0, attr: "DV", sColour: "DV", item: "private-socket" }],
            socketedItems: [
                {
                    id: "private-nested",
                    note: "private-nested-price",
                    baseType: "private-nested-base",
                },
            ],
        };
        const fixture = diagnostics.collect(input, observedAt)!;
        expect(fixture).toMatchObject({
            format: 1,
            origin: "live",
            realm: "pc",
            league: "Allflame",
            observedAt: observedAt.toISOString(),
            hour: 1792915200,
            shape: {
                baseType: base,
                typeLine: base,
                name: "nonempty",
                frameType: 5,
                frameTypeId: "currency",
                identified: true,
                corrupted: false,
                stackSize: 1,
                maxStackSize: 10,
                foilVariation: null,
                sockets: {
                    state: "array",
                    count: 1,
                    entries: [{ group: 0, attr: "DV", sColour: "DV" }],
                },
                socketedItems: { state: "array", count: 1 },
            },
        });
        expect(fixture.shapeSha256).toMatch(/^[a-f0-9]{64}$/);
        fixture.shape.id = "private-after-collect";
        await diagnostics.flush([fixture, structuredClone(fixture)]);
        const output = await saved();
        expect(output.fixtures).toHaveLength(1);
        expect(output.text).not.toContain("private-");
        expect(output.fixtures[0]!.shape.socketedItems).toEqual({ state: "array", count: 1 });
    });

    it("distinguishes missing, null, empty, nonempty and malformed socket fields", async () => {
        const diagnostics = create()!;
        const inputs = [undefined, null, [], [{}], "private-malformed"];
        const fixtures = inputs.map(
            (value) =>
                diagnostics.collect(
                    { ...raw(), sockets: value, socketedItems: value },
                    observedAt,
                )!,
        );
        expect(new Set(fixtures.map((fixture) => fixture.shapeSha256)).size).toBe(5);
        expect(fixtures.map((fixture) => fixture.shape.socketedItems)).toEqual([
            { state: "missing" },
            { state: "null" },
            { state: "array", count: 0 },
            { state: "array", count: 1 },
            { state: "invalid" },
        ]);
        expect(fixtures[3]!.shape.sockets).toEqual({
            state: "array",
            count: 1,
            entries: [{ group: "missing", attr: "missing", sColour: "missing" }],
        });
        await diagnostics.flush(fixtures);
        expect((await saved()).text).not.toContain("private-");
    });

    it("records invalid scalar shapes without copying their strings and ignores other bases", () => {
        const diagnostics = create()!;
        expect(
            diagnostics.collect({ ...raw(), baseType: "Potent Chaotic Resonator" }, observedAt),
        ).toBeNull();
        expect(diagnostics.collect(null, observedAt)).toBeNull();
        expect(diagnostics.collect(raw(), new Date("invalid"))).toBeNull();
        const fixture = diagnostics.collect(
            {
                ...raw(),
                typeLine: "private-type",
                frameTypeId: "private-frame",
                rarity: "private-rarity",
                identified: "private-identified",
                stackSize: "private-stack",
                foilVariation: false,
                sockets: [
                    { group: "private-group", attr: "private-attr", sColour: "private-colour" },
                ],
            },
            observedAt,
        )!;
        expect(JSON.stringify(fixture)).not.toContain("private-");
        expect(fixture.shape).toMatchObject({
            typeLine: "invalid",
            frameTypeId: "invalid",
            identified: "invalid",
            stackSize: "invalid",
        });
        expect(
            diagnostics.collect(
                { ...raw(), identified: false, stackSize: 0, foilVariation: -1 },
                observedAt,
            )!.shape,
        ).toMatchObject({ identified: false, stackSize: 0, foilVariation: -1 });
    });

    it("deduplicates saved shapes while allowing a discarded page to be collected again", async () => {
        const diagnostics = create()!;
        const first = diagnostics.collect(raw(), observedAt)!;
        const retryTime = new Date(observedAt.getTime() + 60_000);
        const retry = diagnostics.collect({ ...raw(), id: "unrelated-private-id" }, retryTime)!;
        expect(retry.shapeSha256).toBe(first.shapeSha256);
        await diagnostics.flush([retry, retry]);
        expect((await saved()).fixtures[0]!.observedAt).toBe(retryTime.toISOString());
        expect(diagnostics.collect(raw(), observedAt)).toBeNull();
    });

    it("caps distinct fixtures and serialized bytes without traversing socketed items", async () => {
        const diagnostics = create()!;
        const fixtures: ResonatorDiagnosticFixture[] = [];
        const contents = new Array(100_000);
        Object.defineProperty(contents, "0", {
            get() {
                throw new Error("Nested content must not be inspected");
            },
        });
        for (let index = 0; index < 20; index++) {
            const fixture = diagnostics.collect(
                {
                    ...raw(),
                    stackSize: index + 1,
                    socketedItems: contents,
                    sockets: Array.from({ length: 128 }, (_, group) => ({
                        group,
                        attr: "DV",
                        sColour: "DV",
                    })),
                },
                observedAt,
            );
            if (index < 16) {
                expect(fixture).not.toBeNull();
                fixtures.push(fixture!);
            } else expect(fixture).toBeNull();
        }
        await diagnostics.flush(fixtures);
        const output = await saved();
        expect(output.fixtures).toHaveLength(16);
        expect(Buffer.byteLength(output.text)).toBeLessThanOrEqual(256 * 1024);
        for (const fixture of output.fixtures)
            expect(Buffer.byteLength(JSON.stringify(fixture))).toBeLessThanOrEqual(16 * 1024);
        expect(create()!.collect({ ...raw(), sockets: new Array(129) }, observedAt)).toBeNull();
    });

    it("writes through an exclusive private temporary file and serializes concurrent flushes", async () => {
        const diagnostics = create()!;
        const first = diagnostics.collect(raw(), observedAt)!;
        const second = diagnostics.collect({ ...raw(), stackSize: 2 }, observedAt)!;
        await Promise.all([diagnostics.flush([first]), diagnostics.flush([second])]);
        expect((await saved()).fixtures).toHaveLength(2);
        expect(fs.writeFile).toHaveBeenCalledWith(
            expect.stringMatching(/resonator-diagnostics\.json\.[\da-f-]+\.tmp$/),
            expect.any(String),
            { mode: 0o600, flag: "wx" },
        );
        expect(fs.rename).toHaveBeenCalledWith(
            expect.stringMatching(/\.tmp$/),
            join(directory, "resonator-diagnostics.json"),
        );
        expect(await fs.readdir(directory)).toEqual(["resonator-diagnostics.json"]);
    });

    it("disables collection and publication at expiry", async () => {
        const expiresAt = Date.now() + 1000;
        const diagnostics = create({ expiresAt })!;
        const fixture = diagnostics.collect(raw(), observedAt)!;
        vi.spyOn(Date, "now").mockReturnValue(expiresAt);
        expect(diagnostics.collect(raw(), observedAt)).toBeNull();
        await diagnostics.flush([fixture]);
        await expect(saved()).rejects.toThrow();
    });

    it("does not leak a write error or retry after one generic warning", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const diagnostics = create()!;
        const fixture = diagnostics.collect(raw(), observedAt)!;
        vi.mocked(fs.writeFile).mockRejectedValueOnce(new Error("private-write-error"));
        await expect(diagnostics.flush([fixture])).resolves.toBeUndefined();
        await expect(diagnostics.flush([fixture])).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalledExactlyOnceWith(
            "Resonator diagnostics unavailable; ingestion will continue.",
        );
        expect(diagnostics.collect(raw(), observedAt)).toBeNull();
        expect(await fs.readdir(directory)).toEqual([]);
    });

    it("contains collection exceptions without interrupting ingestion", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const diagnostics = create()!;
        const input = {
            get baseType() {
                throw new Error("private-collection-error");
            },
        };
        expect(diagnostics.collect(input, observedAt)).toBeNull();
        expect(diagnostics.collect(input, observedAt)).toBeNull();
        expect(warn).toHaveBeenCalledExactlyOnceWith(
            "Resonator diagnostics unavailable; ingestion will continue.",
        );
    });
});

describe("fixed resonator diagnostic request", () => {
    it("ignores a missing request and loads only its fixed sibling file", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        expect(await loadResonatorDiagnostics(options())).toBeUndefined();
        expect(warn).not.toHaveBeenCalled();
        const diagnostics = await request(validRequest());
        expect(diagnostics).toBeDefined();
        await diagnostics!.flush([diagnostics!.collect(raw(), observedAt)!]);
        expect((await saved()).fixtures).toHaveLength(1);
    });

    it("rejects extra path/family fields, scope changes, invalid expiry, malformed and oversized requests", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        for (const value of [
            { ...validRequest(), file: "private-path" },
            { ...validRequest(), families: [base] },
            { ...validRequest(), realm: "poe2" },
            { ...validRequest(), league: "Other" },
            { ...validRequest(), format: 2 },
            { ...validRequest(), expiresAt: "private-invalid" },
            { ...validRequest(), expiresAt: new Date(Date.now() - 1).toISOString() },
            { ...validRequest(), expiresAt: new Date(Date.now() + 86_401_000).toISOString() },
            [],
            null,
        ])
            expect(await request(value)).toBeUndefined();
        await fs.writeFile(
            join(directory, "resonator-diagnostics.request.json"),
            "private-invalid-json",
        );
        expect(await loadResonatorDiagnostics(options())).toBeUndefined();
        await fs.writeFile(
            join(directory, "resonator-diagnostics.request.json"),
            " ".repeat(16_385),
        );
        expect(await loadResonatorDiagnostics(options())).toBeUndefined();
        expect(warn).toHaveBeenCalledExactlyOnceWith(
            "Resonator diagnostic request ignored; ingestion will continue.",
        );
        expect(await loadResonatorDiagnostics({ ...options(), realm: "poe2" })).toBeUndefined();
        expect(await loadResonatorDiagnostics({ ...options(), league: "all" })).toBeUndefined();
    });
});
