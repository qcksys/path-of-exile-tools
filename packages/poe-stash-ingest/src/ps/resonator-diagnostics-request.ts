import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createResonatorDiagnostics } from "#src/ps/resonator-diagnostics.ts";

let warned = false;
export async function loadResonatorDiagnostics(opts: {
    statusFile?: string;
    realm: string;
    league: string;
}) {
    if (!opts.statusFile || opts.realm !== "pc" || !opts.league || opts.league === "all") return;
    const file = join(dirname(opts.statusFile), "resonator-diagnostics.request.json");
    try {
        if ((await stat(file)).size > 16_384) throw new Error("Oversized request");
        const request: unknown = JSON.parse(await readFile(file, "utf8"));
        if (
            !request ||
            typeof request !== "object" ||
            Array.isArray(request) ||
            Object.keys(request).some(
                (key) => !["format", "realm", "league", "expiresAt"].includes(key),
            ) ||
            !("format" in request) ||
            request.format !== 1 ||
            !("realm" in request) ||
            request.realm !== "pc" ||
            !("league" in request) ||
            request.league !== opts.league ||
            !("expiresAt" in request) ||
            typeof request.expiresAt !== "string"
        )
            throw new Error("Invalid request");
        const diagnostics = createResonatorDiagnostics({
            ...opts,
            expiresAt: Date.parse(request.expiresAt),
        });
        if (!diagnostics) throw new Error("Invalid expiry or scope");
        return diagnostics;
    } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT") && !warned) {
            console.warn("Resonator diagnostic request ignored; ingestion will continue.");
            warned = true;
        }
    }
}
