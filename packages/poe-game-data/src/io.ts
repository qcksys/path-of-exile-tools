import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export const digest = (bytes: Uint8Array | string) =>
    createHash("sha256").update(bytes).digest("hex");

export function assetPath(root: string, name: string): string {
    const normalized = name.replaceAll("\\", "/");
    if (
        !normalized ||
        normalized.includes(":") ||
        normalized.startsWith("/") ||
        normalized.split("/").some((part) => part === "..")
    ) {
        throw new Error(`Unsafe asset path: ${name}`);
    }
    const path = resolve(root, normalized);
    const rel = relative(resolve(root), path);
    if (!rel || rel.startsWith("..") || isAbsolute(rel))
        throw new Error(`Asset path escapes root: ${name}`);
    return path;
}

export async function writeBytes(path: string, bytes: Uint8Array | string) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
}

export async function writeJson(path: string, value: unknown) {
    await writeBytes(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readJson(path: string): Promise<unknown> {
    return JSON.parse(await readFile(path, "utf8"));
}

export function missing(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function decodeText(bytes: Uint8Array): string {
    return new TextDecoder(bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : "utf-8").decode(
        bytes,
    );
}
