import { createHash, randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const BASE = "Prime Chaotic Resonator";
const MAX_FIXTURES = 16;
const MAX_FIXTURE_BYTES = 16 * 1024;
const MAX_FILE_BYTES = 256 * 1024;
const WARNING = "Resonator diagnostics unavailable; ingestion will continue.";
type JsonObject = Record<string, unknown>;

export interface ResonatorDiagnosticFixture {
    format: 1;
    origin: "live";
    observedAt: string;
    hour: number;
    realm: "pc";
    league: string;
    shapeSha256: string;
    shape: JsonObject;
}

function object(value: unknown): JsonObject | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as JsonObject)
        : null;
}

function scalar(value: unknown, valid: (value: unknown) => boolean) {
    if (value === undefined) return "missing";
    if (value === null) return null;
    return valid(value) ? value : "invalid";
}
const boolean = (value: unknown) => scalar(value, (value) => typeof value === "boolean");
const integer = (value: unknown) =>
    scalar(value, (value) => typeof value === "number" && Number.isSafeInteger(value));
const enumeration = (value: unknown, allowed: string[]) =>
    scalar(value, (value) => typeof value === "string" && allowed.includes(value));

function arrayShape(value: unknown) {
    if (value === undefined) return { state: "missing" };
    if (value === null) return { state: "null" };
    return Array.isArray(value) ? { state: "array", count: value.length } : { state: "invalid" };
}

function sanitize(input: unknown): JsonObject | null {
    const source = object(input);
    if (!source || source.baseType !== BASE) return null;
    const sockets = source.sockets;
    const socketShape: JsonObject = arrayShape(sockets);
    if (Array.isArray(sockets)) {
        if (sockets.length > 128) return null;
        socketShape.entries = sockets.map((value) => {
            const socket = object(value);
            return socket
                ? {
                      group: integer(socket.group),
                      attr: enumeration(socket.attr, ["S", "D", "I", "G", "A", "DV"]),
                      sColour: enumeration(socket.sColour, ["R", "G", "B", "W", "A", "DV"]),
                  }
                : { state: "invalid" };
        });
    }
    return {
        baseType: BASE,
        typeLine: enumeration(source.typeLine, [BASE]),
        name:
            scalar(source.name, (value) => value === "") === "invalid"
                ? typeof source.name === "string"
                    ? "nonempty"
                    : "invalid"
                : scalar(source.name, (value) => value === ""),
        frameType: integer(source.frameType),
        frameTypeId: enumeration(source.frameTypeId, [
            "currency",
            "normal",
            "magic",
            "rare",
            "unique",
        ]),
        rarity: enumeration(source.rarity, ["Currency", "Normal", "Magic", "Rare", "Unique"]),
        identified: boolean(source.identified),
        corrupted: boolean(source.corrupted),
        verified: boolean(source.verified),
        stackSize: integer(source.stackSize),
        maxStackSize: integer(source.maxStackSize),
        foilVariation: integer(source.foilVariation),
        sockets: socketShape,
        socketedItems: arrayShape(source.socketedItems),
    };
}

function snapshot(values: Iterable<string>) {
    return `{"format":1,"fixtures":[${[...values].join(",")}]}\n`;
}

export function createResonatorDiagnostics(options: {
    statusFile?: string;
    realm: string;
    league: string;
    expiresAt: number;
}) {
    const now = Date.now();
    if (
        !options.statusFile ||
        options.realm !== "pc" ||
        !options.league ||
        options.league === "all" ||
        options.league.length > 100 ||
        !Number.isFinite(options.expiresAt) ||
        options.expiresAt <= now ||
        options.expiresAt > now + 86_400_000
    )
        return undefined;
    const file = join(dirname(options.statusFile), "resonator-diagnostics.json");
    const issued = new WeakMap<ResonatorDiagnosticFixture, { key: string; json: string }>();
    const known = new Set<string>();
    const saved = new Map<string, string>();
    let disabled = false;
    let pending = Promise.resolve();
    const active = () => !disabled && Date.now() < options.expiresAt;
    function warn() {
        if (!disabled) console.warn(WARNING);
        disabled = true;
    }
    return {
        collect(input: unknown, observedAt: Date) {
            if (!active() || saved.size >= MAX_FIXTURES) return null;
            try {
                if (!Number.isFinite(observedAt.getTime())) return null;
                const shape = sanitize(input);
                if (!shape) return null;
                const shapeSha256 = createHash("sha256")
                    .update(JSON.stringify(shape))
                    .digest("hex");
                if (
                    saved.has(shapeSha256) ||
                    (!known.has(shapeSha256) && known.size >= MAX_FIXTURES)
                )
                    return null;
                const fixture: ResonatorDiagnosticFixture = {
                    format: 1,
                    origin: "live",
                    observedAt: observedAt.toISOString(),
                    hour: Math.floor(observedAt.getTime() / 3_600_000) * 3600,
                    realm: "pc",
                    league: options.league,
                    shapeSha256,
                    shape,
                };
                const json = JSON.stringify(fixture);
                if (Buffer.byteLength(json) > MAX_FIXTURE_BYTES) return null;
                known.add(shapeSha256);
                issued.set(fixture, { key: shapeSha256, json });
                return fixture;
            } catch {
                warn();
                return null;
            }
        },
        flush(fixtures: ResonatorDiagnosticFixture[]): Promise<void> {
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
                const temporary = `${file}.${randomUUID()}.tmp`;
                try {
                    await writeFile(temporary, snapshot(next.values()), {
                        mode: 0o600,
                        flag: "wx",
                    });
                    if (!active()) return;
                    await rename(temporary, file);
                    for (const [key, value] of next) saved.set(key, value);
                } catch {
                    warn();
                } finally {
                    await rm(temporary, { force: true }).catch(() => {});
                }
            });
            return pending;
        },
    };
}

export type ResonatorDiagnostics = NonNullable<ReturnType<typeof createResonatorDiagnostics>>;
