import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync } from "node:zlib";
import { expect, it } from "vite-plus/test";
import { exportImage, readDds } from "../src/images.ts";

it("resolves DDS aliases and checks Brotli size", async () => {
    const dds = Buffer.from("DDS fixture");
    const size = Buffer.alloc(4);
    size.writeUInt32LE(dds.length);
    const compressed = Buffer.concat([size, brotliCompressSync(dds)]);
    const source = {
        get: async (name: string) =>
            name === "alias.dds" ? Buffer.from("*image.dds") : compressed,
    };
    expect(await readDds(source, "alias.dds")).toEqual(dds);
    compressed.writeUInt32LE(100);
    await expect(readDds(source, "image.dds")).rejects.toThrow("Invalid compressed DDS");
    await expect(
        readDds({ get: async () => Buffer.from("*loop.dds") }, "loop.dds"),
    ).rejects.toThrow("Cyclic");
});

const root = process.env.POE_REFERENCE_SNAPSHOT;
it.skipIf(!root)(
    "exports a client DDS as PNG and WebP through local WASM",
    async () => {
        if (!root) return;
        const output = await mkdtemp(join(tmpdir(), "poe-images-"));
        const path =
            process.env.POE_REFERENCE_GAME === "poe2"
                ? "Art/2DItems/Belts/Basetypes/Belt01.dds"
                : "Art/2DItems/Belts/Belt3.dds";
        try {
            await exportImage(
                { get: (name) => readFile(join(root, "raw", name)) },
                { path, compose: false },
                output,
            );
            const png = await readFile(join(output, path.replace(".dds", ".png")));
            const webp = await readFile(join(output, path.replace(".dds", ".webp")));
            expect(png.subarray(1, 4).toString()).toBe("PNG");
            expect(webp.subarray(8, 12).toString()).toBe("WEBP");
        } finally {
            await rm(output, { recursive: true, force: true });
        }
    },
    30_000,
);
