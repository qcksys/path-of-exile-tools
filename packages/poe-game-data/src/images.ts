import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { brotliDecompressSync } from "node:zlib";
import {
    CompositeOperator,
    type IMagickImage,
    ImageMagick,
    initializeImageMagick,
    MagickFormat,
    MagickGeometry,
} from "@imagemagick/magick-wasm";
import { assetPath, writeBytes } from "./io.ts";
import type { ImageAsset } from "./normalize.ts";
import type { AssetSource } from "./source.ts";

let initialization: Promise<void> | undefined;
export function initializeImages() {
    initialization ??= readFile(
        fileURLToPath(import.meta.resolve("@imagemagick/magick-wasm/magick.wasm")),
    ).then((bytes) => initializeImageMagick(bytes));
    return initialization;
}

export async function readDds(
    source: AssetSource,
    name: string,
    seen = new Set<string>(),
): Promise<Uint8Array> {
    if (seen.has(name)) throw new Error(`Cyclic DDS reference: ${name}`);
    seen.add(name);
    const bytes = Buffer.from(await source.get(name));
    if (bytes.subarray(0, 4).toString() === "DDS ") return bytes;
    if (bytes[0] === 42) return readDds(source, bytes.subarray(1).toString("utf8"), seen);
    if (bytes.length < 4) throw new Error(`Truncated DDS: ${name}`);
    const decoded = brotliDecompressSync(bytes.subarray(4), { maxOutputLength: 256 * 1024 * 1024 });
    if (decoded.length !== bytes.readUInt32LE(0) || decoded.subarray(0, 4).toString() !== "DDS ")
        throw new Error(`Invalid compressed DDS: ${name}`);
    return decoded;
}

async function save(image: IMagickImage, stem: string) {
    image.settings.setDefine(MagickFormat.Png, "exclude-chunks", "date,time");
    await image.write(MagickFormat.Png, (bytes) => writeBytes(`${stem}.png`, bytes));
    await image.write(MagickFormat.WebP, (bytes) => writeBytes(`${stem}.webp`, bytes));
}

export async function exportImage(source: AssetSource, asset: ImageAsset, output: string) {
    await initializeImages();
    const dds = await readDds(source, asset.path);
    const stem = assetPath(output, asset.path.replace(/\.[^.]+$/, ""));
    await ImageMagick.read(dds, async (image) => {
        if (!asset.compose) return save(image, stem);
        const width = Math.floor(image.width / 3);
        await image.clone(async (left) => {
            left.crop(new MagickGeometry(0, 0, width, image.height));
            left.resetPage();
            await image.clone(async (right) => {
                right.crop(new MagickGeometry(width * 2, 0, width, image.height));
                right.resetPage();
                right.composite(left, CompositeOperator.Over);
                image.crop(new MagickGeometry(width, 0, width, image.height));
                image.resetPage();
                image.composite(right, CompositeOperator.Over);
                await save(image, stem);
            });
        });
    });
}
