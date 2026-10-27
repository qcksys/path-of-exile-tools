import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defaultEquipmentClassifier, type EquipmentClassifier } from "#src/ps/equipment.ts";
import { createEquipmentDiagnostics } from "#src/ps/equipment-diagnostics.ts";

type DiagnosticRequestOptions = {
    statusFile?: string;
    realm: string;
    league: string;
    classifier?: EquipmentClassifier;
};

class InvalidDiagnosticRequest extends Error {}

export function createEquipmentDiagnosticsLoader(opts: DiagnosticRequestOptions) {
    let previous: string | undefined;
    let diagnostics: ReturnType<typeof createEquipmentDiagnostics>;
    let expiry = 0;
    return async () => {
        if (!opts.statusFile || opts.realm === "poe2" || !opts.league || opts.league === "all")
            return;
        const directory = dirname(opts.statusFile);
        const requestFile = join(directory, "equipment-diagnostics.request.json");
        let changed = false;
        try {
            if ((await stat(requestFile)).size > 16_384) throw new Error("Oversized request");
            const contents = await readFile(requestFile, "utf8");
            if (Buffer.byteLength(contents) > 16_384) throw new Error("Oversized request");
            if (contents === previous) return Date.now() < expiry ? diagnostics : undefined;
            changed = true;
            previous = contents;
            diagnostics = undefined;
            expiry = 0;
            const request: unknown = JSON.parse(contents);
            if (
                !request ||
                typeof request !== "object" ||
                !("format" in request) ||
                request.format !== 1 ||
                !("realm" in request) ||
                request.realm !== opts.realm ||
                !("league" in request) ||
                request.league !== opts.league ||
                !("expiresAt" in request) ||
                typeof request.expiresAt !== "string" ||
                !("cohortIds" in request) ||
                !Array.isArray(request.cohortIds) ||
                request.cohortIds.length < 1 ||
                request.cohortIds.length > 64 ||
                !request.cohortIds.every((id): id is string => typeof id === "string")
            )
                throw new InvalidDiagnosticRequest("Invalid request");
            const expiresAt = Date.parse(request.expiresAt);
            const now = Date.now();
            if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + 86_400_000)
                throw new InvalidDiagnosticRequest("Invalid expiry");
            const classifier = opts.classifier ?? (await defaultEquipmentClassifier());
            if (request.cohortIds.some((id) => !classifier.definition(id)))
                throw new InvalidDiagnosticRequest("Unknown equipment cohort");
            diagnostics = createEquipmentDiagnostics({
                file: join(directory, "equipment-diagnostics.json"),
                cohortIds: request.cohortIds,
                classifier,
                realm: opts.realm,
                league: opts.league,
                expiresAt,
            });
            expiry = expiresAt;
            return diagnostics;
        } catch (error) {
            if (error instanceof Error && "code" in error && error.code === "ENOENT") {
                previous = undefined;
                diagnostics = undefined;
            } else {
                if (
                    changed &&
                    !(error instanceof SyntaxError || error instanceof InvalidDiagnosticRequest)
                )
                    previous = undefined;
                console.warn("Equipment diagnostic request ignored; ingestion will continue.");
            }
        }
    };
}

export async function loadEquipmentDiagnostics(opts: DiagnosticRequestOptions) {
    return createEquipmentDiagnosticsLoader(opts)();
}
