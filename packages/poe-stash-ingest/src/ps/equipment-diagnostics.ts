import { createHash } from "node:crypto";
import { rename, writeFile } from "node:fs/promises";
import { normalizeApiItem, type SourcePreparationProfile } from "@poe-tools/item-query";
import type { EquipmentClassifier } from "#src/ps/equipment.ts";

const MAX_FIXTURES = 16;
const MAX_FIXTURE_BYTES = 16 * 1024;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_ATTEMPTS = 64;
const WARNING = "Equipment diagnostics unavailable; ingestion will continue.";
const scalarFields = [
    "baseType",
    "typeLine",
    "ilvl",
    "itemLevel",
    "rarity",
    "frameType",
    "frameTypeId",
    "identified",
    "corrupted",
    "duplicated",
    "fractured",
    "split",
    "synthesised",
    "sanctified",
    "verified",
    "searing",
    "tangled",
    "mutated",
    "memoryItem",
    "allflameCrafted",
    "intangibility",
    "memoryStrands",
    "memoryStrandsSpent",
];
const modifierFields = [
    "explicitMods",
    "implicitMods",
    "fracturedMods",
    "craftedMods",
    "enchantMods",
    "scourgeMods",
    "crucibleMods",
    "veiledMods",
    "runeMods",
    "mutatedMods",
    "allflameMods",
];

type JsonObject = Record<string, unknown>;
type Classification = { matches: string[]; unknown: string[] };

export interface EquipmentDiagnosticFixture {
    format: 1;
    origin: "live" | "archive";
    observedAt: string;
    hour: number;
    realm: string;
    league: string;
    manifestRevision: string;
    sourcePreparationModelFormat: number | null;
    modifierTextModelFormat: number | null;
    itemSha256: string;
    item: JsonObject;
    targets: Array<{ cohortId: string; sourcePreparation?: SourcePreparationProfile }>;
    classification: Classification;
}

function object(value: unknown): JsonObject | null {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as JsonObject)
        : null;
}

function scalar(value: unknown) {
    return (
        value === null ||
        typeof value === "string" ||
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value))
    );
}

function pick(input: JsonObject, fields: string[]): JsonObject | null {
    const result: JsonObject = {};
    for (const field of fields) {
        if (input[field] === undefined) continue;
        if (!scalar(input[field])) return null;
        result[field] = input[field];
    }
    return result;
}

function flags(input: unknown, allowed: string[]): JsonObject | null {
    const source = object(input);
    if (!source) return null;
    const result: JsonObject = {};
    for (const [key, value] of Object.entries(source)) {
        if (!allowed.includes(key) || typeof value !== "boolean") return null;
        result[key] = value;
    }
    return result;
}

function modifiers(input: unknown): unknown[] | null {
    if (!Array.isArray(input) || input.length > 128) return null;
    const result: unknown[] = [];
    for (const value of input) {
        if (typeof value === "string") {
            result.push(value);
            continue;
        }
        const row = object(value);
        if (!row || typeof row.description !== "string") return null;
        const projected: JsonObject = { description: row.description };
        if (row.flags !== undefined) {
            const retained = flags(row.flags, [
                "fractured",
                "crafted",
                "desecrated",
                "mutated",
                "vestigial",
            ]);
            if (!retained) return null;
            projected.flags = retained;
        }
        if (row.mods !== undefined) {
            if (!Array.isArray(row.mods) || row.mods.length > 128) return null;
            const metadata = [];
            for (const mod of row.mods) {
                const source = object(mod);
                const retained = source && pick(source, ["name", "tier", "level"]);
                if (!retained) return null;
                metadata.push(retained);
            }
            projected.mods = metadata;
        }
        result.push(projected);
    }
    return result;
}

function sanitize(input: unknown): JsonObject | null {
    const source = object(input);
    if (!source) return null;
    const result = pick(source, scalarFields);
    if (!result) return null;
    if (source.name !== undefined) {
        if (typeof source.name !== "string") return null;
        result.name = source.name === "" ? "" : "present";
    }
    for (const [key, value] of Object.entries(source)) {
        if (value !== true || scalarFields.includes(key)) continue;
        // Unknown keys can contain identity data; dropping active flags would change evidence.
        return null;
    }
    for (const field of modifierFields) {
        if (source[field] === undefined) continue;
        const retained = modifiers(source[field]);
        if (!retained) return null;
        result[field] = retained;
    }
    if (source.influences !== undefined) {
        const retained = flags(source.influences, [
            "shaper",
            "elder",
            "crusader",
            "redeemer",
            "hunter",
            "warlord",
        ]);
        if (!retained) return null;
        result.influences = retained;
    }
    if (source.extended !== undefined) {
        const extended = object(source.extended);
        const retained = extended && pick(extended, ["prefixes", "suffixes"]);
        if (!retained) return null;
        result.extended = retained;
    }
    if (source.sockets !== undefined) {
        if (!Array.isArray(source.sockets) || source.sockets.length > 128) return null;
        const retained = [];
        for (const socket of source.sockets) {
            const row = object(socket);
            const projected = row && pick(row, ["group"]);
            if (!projected) return null;
            retained.push(projected);
        }
        result.sockets = retained;
    }
    if (source.properties !== undefined) {
        if (!Array.isArray(source.properties) || source.properties.length > 128) return null;
        const retained = [];
        for (const property of source.properties) {
            const row = object(property);
            const projected = row && pick(row, ["name", "type"]);
            if (!row || !projected) return null;
            if (row.values !== undefined) {
                if (
                    !Array.isArray(row.values) ||
                    row.values.length > 128 ||
                    row.values.some(
                        (value) =>
                            !Array.isArray(value) || value.length > 16 || !value.every(scalar),
                    )
                )
                    return null;
                projected.values = row.values.map((value) => [...value]);
            }
            retained.push(projected);
        }
        result.properties = retained;
    }
    return result;
}

function sorted(result: Classification): Classification {
    return { matches: [...result.matches].sort(), unknown: [...result.unknown].sort() };
}

function snapshot(values: Iterable<string>) {
    return `{"format":1,"fixtures":[${[...values].join(",")}]}\n`;
}

export function createEquipmentDiagnostics(options: {
    file?: string;
    cohortIds: string[];
    classifier: EquipmentClassifier;
    realm: string;
    league: string;
    expiresAt: number;
}) {
    if (!options.file || !Number.isFinite(options.expiresAt) || options.expiresAt <= Date.now())
        return undefined;
    const file = options.file;
    const targets = [...new Set(options.cohortIds)].sort().flatMap((cohortId) => {
        const definition = options.classifier.definition(cohortId);
        if (!definition) return [];
        const sourcePreparation = definition.query.sourcePreparation;
        return [{ cohortId, ...(sourcePreparation ? { sourcePreparation } : {}) }];
    });
    if (!targets.length) return undefined;
    const issued = new WeakMap<EquipmentDiagnosticFixture, { key: string; json: string }>();
    const saved = new Map<string, string>();
    const attempted = new Set<string>();
    const verified = new Map<string, string>();
    const groups = new Map<string, number>();
    let attempts = 0;
    let disabled = false;
    let pending = Promise.resolve();
    const active = () => !disabled && Date.now() < options.expiresAt;
    function warn() {
        if (!disabled) console.warn(WARNING);
        disabled = true;
    }
    return {
        collect(
            input: unknown,
            classification: Classification,
            observedAt: Date,
            origin: EquipmentDiagnosticFixture["origin"] = "live",
        ) {
            if (!active() || saved.size >= MAX_FIXTURES) return null;
            const selected = targets.filter((target) =>
                classification.unknown.includes(target.cohortId),
            );
            if (!selected.length || !Number.isFinite(observedAt.getTime())) return null;
            try {
                const item = sanitize(input);
                if (!item) return null;
                const itemJson = JSON.stringify(item);
                if (Buffer.byteLength(itemJson) > MAX_FIXTURE_BYTES) return null;
                const itemSha256 = createHash("sha256").update(itemJson).digest("hex");
                const key = JSON.stringify([item.baseType, selected, itemSha256]);
                if (saved.has(key) || attempted.has(key)) return null;
                const original = sorted(classification);
                const originalJson = JSON.stringify(original);
                const group = JSON.stringify([
                    item.baseType,
                    selected.map((target) => target.cohortId),
                ]);
                if (verified.has(key)) {
                    if (verified.get(key) !== originalJson) return null;
                } else {
                    if (
                        verified.size >= MAX_FIXTURES ||
                        (groups.get(group) ?? 0) >= 2 ||
                        attempts >= MAX_ATTEMPTS
                    )
                        return null;
                    attempts++;
                    const replayed = sorted(
                        options.classifier.classify(normalizeApiItem("poe1", "stash", item)),
                    );
                    if (originalJson !== JSON.stringify(replayed)) {
                        attempted.add(key);
                        return null;
                    }
                }
                const fixture: EquipmentDiagnosticFixture = {
                    format: 1,
                    origin,
                    observedAt: observedAt.toISOString(),
                    hour: Math.floor(observedAt.getTime() / 3_600_000) * 3600,
                    realm: options.realm,
                    league: options.league,
                    manifestRevision: options.classifier.manifest.revision,
                    sourcePreparationModelFormat:
                        options.classifier.manifest.sourcePreparationModel?.format ?? null,
                    modifierTextModelFormat:
                        options.classifier.manifest.modifierTextModel?.format ?? null,
                    itemSha256,
                    item,
                    targets: selected,
                    classification: original,
                };
                const json = JSON.stringify(fixture);
                if (Buffer.byteLength(json) > MAX_FIXTURE_BYTES) {
                    attempted.add(key);
                    return null;
                }
                if (!verified.has(key)) {
                    verified.set(key, originalJson);
                    groups.set(group, (groups.get(group) ?? 0) + 1);
                }
                issued.set(fixture, { key, json });
                return fixture;
            } catch {
                warn();
                return null;
            }
        },
        flush(fixtures: EquipmentDiagnosticFixture[]): Promise<void> {
            pending = pending.then(async () => {
                if (!active()) return;
                const next = new Map(saved);
                for (const fixture of fixtures) {
                    const value = issued.get(fixture);
                    if (!value || next.has(value.key) || next.size >= MAX_FIXTURES) continue;
                    next.set(value.key, value.json);
                    if (Buffer.byteLength(snapshot(next.values())) > MAX_FILE_BYTES)
                        next.delete(value.key);
                }
                if (next.size === saved.size) return;
                const json = snapshot(next.values());
                try {
                    await writeFile(`${file}.tmp`, json, { mode: 0o600 });
                    await rename(`${file}.tmp`, file);
                    for (const [key, value] of next) saved.set(key, value);
                } catch {
                    warn();
                }
            });
            return pending;
        },
    };
}

export type EquipmentDiagnostics = NonNullable<ReturnType<typeof createEquipmentDiagnostics>>;
