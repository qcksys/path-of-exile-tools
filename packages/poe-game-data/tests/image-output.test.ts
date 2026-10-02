import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ImageMagick } from "@imagemagick/magick-wasm";
import { expect, it } from "vite-plus/test";
import { exportImage } from "../src/images.ts";

function dds() {
    const bytes = Buffer.alloc(128 + 12);
    bytes.write("DDS ");
    bytes.writeUInt32LE(124, 4);
    bytes.writeUInt32LE(0x100f, 8);
    bytes.writeUInt32LE(1, 12);
    bytes.writeUInt32LE(3, 16);
    bytes.writeUInt32LE(12, 20);
    bytes.writeUInt32LE(32, 76);
    bytes.writeUInt32LE(0x41, 80);
    bytes.writeUInt32LE(32, 88);
    bytes.writeUInt32LE(0xff0000, 92);
    bytes.writeUInt32LE(0xff00, 96);
    bytes.writeUInt32LE(0xff, 100);
    bytes.writeUInt32LE(0xff000000, 104);
    bytes.writeUInt32LE(0x1000, 108);
    bytes.set([0, 0, 255, 128, 0, 0, 0, 0, 255, 0, 0, 255], 128);
    return bytes;
}

it("composes three-part flask art and emits PNG without volatile timestamps", async () => {
    const output = await mkdtemp(join(tmpdir(), "poe-image-output-"));
    try {
        await exportImage({ get: async () => dds() }, { path: "flask.dds", compose: true }, output);
        const png = await readFile(join(output, "flask.png"));
        expect(png.includes(Buffer.from("date:"))).toBe(false);
        ImageMagick.read(png, (image) => {
            expect([image.width, image.height]).toEqual([1, 1]);
            const pixels = image.getPixels((pixels) => pixels.toByteArray(0, 0, 1, 1, "RGBA"));
            expect(pixels?.[0]).toBeCloseTo(128, 0);
            expect(pixels?.[2]).toBeCloseTo(127, 0);
            expect(pixels?.[3]).toBe(255);
        });
        expect((await readFile(join(output, "flask.webp"))).subarray(8, 12).toString()).toBe(
            "WEBP",
        );
    } finally {
        await rm(output, { recursive: true, force: true });
    }
});
