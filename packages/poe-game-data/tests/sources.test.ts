import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { configSchema } from "../src/config.ts";
import { Ggpk } from "../src/ggpk.ts";
import { assetPath } from "../src/io.ts";
import { Metadata } from "../src/metadata.ts";
import { Source } from "../src/source.ts";

const temporary: string[] = [];
async function directory() {
    const path = await mkdtemp(join(tmpdir(), "poe-data-"));
    temporary.push(path);
    return path;
}
afterEach(async () => {
    for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true });
});

function ggpk(version: number): Buffer {
    const wchar = version === 4 ? 4 : 2;
    const name = "fixture.bin";
    const rootSize = 48 + wchar + 12;
    const fileSize = 44 + (name.length + 1) * wchar + 3;
    const data = Buffer.alloc(28 + rootSize + fileSize);
    data.writeUInt32LE(28);
    data.write("GGPK", 4);
    data.writeUInt32LE(version, 8);
    data.writeBigUInt64LE(28n, 12);
    data.writeUInt32LE(rootSize, 28);
    data.write("PDIR", 32);
    data.writeUInt32LE(1, 36);
    data.writeUInt32LE(1, 40);
    const file = 28 + rootSize;
    data.writeBigUInt64LE(BigInt(file), 28 + 48 + wchar + 4);
    data.writeUInt32LE(fileSize, file);
    data.write("FILE", file + 4);
    data.writeUInt32LE(name.length + 1, file + 8);
    for (let i = 0; i < name.length; i++)
        data.writeUIntLE(name.charCodeAt(i), file + 44 + i * wchar, wchar);
    data.set([10, 20, 30], data.length - 3);
    return data;
}

describe("sources", () => {
    it.each([2, 4])("reads GGPK version %i without modifying the archive", async (version) => {
        const path = join(await directory(), "Content.ggpk");
        const bytes = ggpk(version);
        await writeFile(path, bytes);
        const archive = await Ggpk.open(path);
        try {
            expect(await archive.get("FIXTURE.BIN")).toEqual(Buffer.from([10, 20, 30]));
            expect(await archive.get("missing")).toBeNull();
        } finally {
            await archive.close();
        }
        expect(await readFile(path)).toEqual(bytes);
    });
    it("records local raw inputs without network access", async () => {
        const root = await directory();
        await writeFile(join(root, "fixture.bin"), Buffer.from([1, 2]));
        const source = await Source.open(
            "poe1",
            { patch: "3.29.3.3", directory: root },
            join(root, "raw"),
            join(root, "cache"),
        );
        try {
            expect(await source.get("fixture.bin")).toEqual(Buffer.from([1, 2]));
            expect(source.inputs["fixture.bin"]?.bytes).toBe(2);
        } finally {
            await source.close();
        }
    });
    it.each([
        "../out",
        "/out",
        "C:/out",
        "a/../../out",
        "a\\..\\out",
    ])("rejects unsafe path %s", (path) => expect(() => assetPath("data", path)).toThrow());
    it("validates game-specific patches and rejects unknown config keys", () => {
        expect(configSchema.safeParse({ poe1: { patch: "4.5.5.4" } }).success).toBe(false);
        expect(
            configSchema.safeParse({ poe2: { patch: "4.5.5.4", url: "https://example.com" } })
                .success,
        ).toBe(false);
        expect(
            configSchema.safeParse({ poe1: { patch: "3.29.3.3" }, poe2: { patch: "4.5.5.4" } })
                .success,
        ).toBe(true);
    });
    it("merges inherited tags and rejects cycles", async () => {
        const files: Record<string, string> = {
            "base.it": 'version 3\nextends "nothing"\nBase\n{\ntag = "default"\n}',
            "belt.it": 'version 3\nextends "base"\nBase\n{\ntag = "belt"\n}',
            "cycle.it": 'version 3\nextends "cycle"',
        };
        const metadata = new Metadata({ get: async (name) => Buffer.from(files[name] ?? "") });
        expect(await metadata.tags("belt")).toEqual(["belt", "default"]);
        await expect(metadata.get("cycle")).rejects.toThrow("Cyclic");
    });
});
