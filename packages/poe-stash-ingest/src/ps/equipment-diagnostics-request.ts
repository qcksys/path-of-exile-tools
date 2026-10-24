import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defaultEquipmentClassifier, type EquipmentClassifier } from "#src/ps/equipment.ts";
import { createEquipmentDiagnostics } from "#src/ps/equipment-diagnostics.ts";

export async function loadEquipmentDiagnostics(opts: {
    statusFile?: string;
    realm: string;
    league: string;
    classifier?: EquipmentClassifier;
}) {
    if (!opts.statusFile || opts.realm === "poe2" || !opts.league || opts.league === "all") return;
    const directory = dirname(opts.statusFile);
    const requestFile = join(directory, "equipment-diagnostics.request.json");
    try {
        if ((await stat(requestFile)).size > 16_384) throw new Error("Oversized request");
        const request: unknown = JSON.parse(await readFile(requestFile, "utf8"));
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
            throw new Error("Invalid request");
        const expiresAt = Date.parse(request.expiresAt);
        const now = Date.now();
        if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + 86_400_000)
            throw new Error("Invalid expiry");
        const classifier = opts.classifier ?? (await defaultEquipmentClassifier());
        if (request.cohortIds.some((id) => !classifier.definition(id)))
            throw new Error("Unknown equipment cohort");
        return createEquipmentDiagnostics({
            file: join(directory, "equipment-diagnostics.json"),
            cohortIds: request.cohortIds,
            classifier,
            realm: opts.realm,
            league: opts.league,
            expiresAt,
        });
    } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
            console.warn("Equipment diagnostic request ignored; ingestion will continue.");
    }
}
