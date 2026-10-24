import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeApiItem } from "@poe-tools/item-query";
import { compileMarketCohorts, marketCohortManifestSchema } from "@poe-tools/market";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
    createEquipmentDiagnostics,
    type EquipmentDiagnosticFixture,
} from "../../../packages/poe-stash-ingest/src/ps/equipment-diagnostics";

const bases = [
    "Conquest Lamellar",
    "Heat-attuned Tower Shield",
    "Pinnacle Tower Shield",
    ...Array.from({ length: 6 }, (_, index) => `Test Armour ${index}`),
];
const classifier = compileMarketCohorts(
    marketCohortManifestSchema.parse({
        format: 1,
        game: "poe1",
        revision: "diagnostic-model3",
        catalogHash: "a".repeat(64),
        modifierTextModel: {
            format: 5,
            modifiers: [],
            bases: bases.map((baseType) => ({ baseType })),
        },
        sourcePreparationModel: {
            format: 3,
            bases: bases.map((baseType, index) => ({
                id: `base-${index}`,
                baseType,
                itemClass: "Body Armour",
                scourImplicits: { ids: [], texts: [[]] },
            })),
        },
        cohorts: bases.flatMap((baseType, index) =>
            [false, true].map((source) => ({
                id: `${source ? "source" : "ordinary"}-${index}`,
                name: `${baseType} ${source ? "source" : "ordinary"}`,
                purpose: "base",
                query: {
                    game: "poe1",
                    ...(source
                        ? {
                              sourcePreparation: {
                                  kind: "scour-v1",
                                  crafted: false,
                                  enchanted: false,
                              },
                          }
                        : {}),
                    groups: [
                        {
                            type: "and",
                            filters: [{ kind: "base", field: "baseType", values: [baseType] }],
                        },
                    ],
                },
            })),
        ),
    }),
);
const preparedClassifier = compileMarketCohorts(
    marketCohortManifestSchema.parse({
        ...classifier.manifest,
        cohorts: [
            ...classifier.manifest.cohorts,
            ...bases.map((baseType, index) => ({
                id: `prepared-${index}`,
                name: `${baseType} prepared item`,
                purpose: "isolated-modifier",
                query: {
                    game: "poe1",
                    groups: [
                        {
                            type: "and",
                            filters: [
                                { kind: "base", field: "baseType", values: [baseType] },
                                { kind: "range", field: "prefixes", value: { min: 1, max: 1 } },
                            ],
                        },
                    ],
                },
            })),
        ],
    }),
);
const observedAt = new Date("2026-10-25T03:12:00Z");
function sourceItem(base = bases[0]!, ilvl = 86) {
    return {
        baseType: base,
        typeLine: base,
        ilvl,
        itemLevel: 85,
        rarity: "Rare",
        frameType: 2,
        frameTypeId: "rare",
        identified: true,
        verified: true,
        implicitMods: ["Unrecognised native implicit"],
        explicitMods: ["Disposable affix"],
        extended: { prefixes: 1, suffixes: 0 },
    };
}
function classify(item: unknown) {
    return classifier.classify(normalizeApiItem("poe1", "stash", item));
}
let directory: string;
beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "poe-equipment-diagnostics-"));
});
afterEach(async () => {
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
});
function create(overrides: Partial<Parameters<typeof createEquipmentDiagnostics>[0]> = {}) {
    return createEquipmentDiagnostics({
        file: join(directory, "fixtures.json"),
        cohortIds: bases.map((_, index) => `source-${index}`),
        classifier,
        realm: "pc",
        league: "Allflame",
        expiresAt: Date.now() + 3_600_000,
        ...overrides,
    });
}
async function saved() {
    const text = await readFile(join(directory, "fixtures.json"), "utf8");
    return { text, fixtures: JSON.parse(text).fixtures as EquipmentDiagnosticFixture[] };
}

describe("bounded equipment diagnostics", () => {
    it("stays disabled without a file, current expiry, or known target", () => {
        expect(create({ file: undefined })).toBeUndefined();
        expect(create({ expiresAt: Date.now() })).toBeUndefined();
        expect(create({ expiresAt: Number.NaN })).toBeUndefined();
        expect(create({ cohortIds: ["missing"] })).toBeUndefined();
    });

    it("captures an ordinary prepared-item unknown with the same privacy and full parity", async () => {
        const diagnostics = create({
            classifier: preparedClassifier,
            cohortIds: ["prepared-0"],
        });
        expect(diagnostics).toBeDefined();
        const raw = {
            ...sourceItem(),
            extended: undefined,
            id: "private-id",
            name: "private-name",
            accountName: "private-account",
            note: "private-asking-price",
            icon: "private-url",
        };
        const result = preparedClassifier.classify(normalizeApiItem("poe1", "stash", raw));
        expect(result.unknown).toContain("prepared-0");
        const fixture = diagnostics!.collect(raw, result, observedAt)!;
        expect(fixture.targets).toEqual([{ cohortId: "prepared-0" }]);
        expect(fixture.item.name).toBe("present");
        expect(
            preparedClassifier.classify(normalizeApiItem("poe1", "stash", fixture.item)),
        ).toEqual(result);
        expect(diagnostics!.collect({ ...raw, privateFlag: true }, result, observedAt)).toBeNull();
        expect(
            diagnostics!.collect({ ...raw, ilvl: 87 }, { ...result, matches: [] }, observedAt),
        ).toBeNull();
        expect(
            diagnostics!.collect(
                { ...raw, ilvl: 88 },
                { ...result, unknown: [...result.unknown, "unrelated"] },
                observedAt,
            ),
        ).toBeNull();
        await diagnostics!.flush([fixture]);
        const output = await saved();
        expect(output.fixtures).toHaveLength(1);
        expect(output.fixtures[0]!.classification).toEqual({
            matches: [...result.matches].sort(),
            unknown: [...result.unknown].sort(),
        });
        expect(output.text).not.toContain("private-");
    });

    it("does not collect ordinary matches or definite no-matches", () => {
        const diagnostics = create({
            classifier: preparedClassifier,
            cohortIds: ["prepared-0"],
        });
        expect(diagnostics).toBeDefined();
        const match = sourceItem();
        const matched = preparedClassifier.classify(normalizeApiItem("poe1", "stash", match));
        expect(matched.matches).toContain("prepared-0");
        expect(diagnostics!.collect(match, matched, observedAt)).toBeNull();
        const miss = { ...match, extended: { prefixes: 0, suffixes: 0 } };
        const rejected = preparedClassifier.classify(normalizeApiItem("poe1", "stash", miss));
        expect(rejected.matches).not.toContain("prepared-0");
        expect(rejected.unknown).not.toContain("prepared-0");
        expect(diagnostics!.collect(miss, rejected, observedAt)).toBeNull();
    });

    it("shares the existing fixture cap across source and ordinary unknown targets", async () => {
        const diagnostics = create({
            classifier: preparedClassifier,
            cohortIds: bases.flatMap((_, index) => [`source-${index}`, `prepared-${index}`]),
        })!;
        const fixtures: EquipmentDiagnosticFixture[] = [];
        for (const [index, base] of bases.entries()) {
            for (let variant = 0; variant < 2; variant++) {
                const raw = { ...sourceItem(base, 86 + variant), extended: undefined };
                const result = preparedClassifier.classify(normalizeApiItem("poe1", "stash", raw));
                const fixture = diagnostics.collect(raw, result, observedAt);
                if (index < 8) {
                    expect(fixture?.targets).toEqual([
                        { cohortId: `prepared-${index}` },
                        {
                            cohortId: `source-${index}`,
                            sourcePreparation: {
                                kind: "scour-v1",
                                crafted: false,
                                enchanted: false,
                            },
                        },
                    ]);
                    fixtures.push(fixture!);
                } else expect(fixture).toBeNull();
            }
        }
        await diagnostics.flush(fixtures);
        expect((await saved()).fixtures).toHaveLength(16);
    });

    it("preserves actual model-3 unknowns and full membership without identities or listing data", async () => {
        const diagnostics = create()!;
        const raw = {
            ...sourceItem(),
            id: "private-item",
            name: "private-name",
            note: "private-note",
            accountName: "private-account",
            cursor: "private-cursor",
            icon: "private-icon",
            socketedItems: [{ id: "private-socketed" }],
            extended: { prefixes: 1, suffixes: 0, note: "private-extended" },
            sockets: [{ group: 0, attr: "S", item: "private-socket" }],
            properties: [
                { name: "Intangibility", type: 110, values: [["0%", 0]], note: "private-property" },
                { name: "Quality", type: 6, values: [["+20%", 1]] },
            ],
            explicitMods: [
                {
                    description: "+10 to maximum Life",
                    flags: { crafted: false, fractured: false },
                    mods: [{ name: "Healthy", tier: "P1", level: 1, id: "private-metadata" }],
                    note: "private-row",
                },
            ],
        };
        const result = classify(raw);
        expect(result).toEqual({ matches: ["ordinary-0"], unknown: ["source-0"] });
        const fixture = diagnostics.collect(raw, result, observedAt)!;
        expect(fixture).toMatchObject({
            format: 1,
            origin: "live",
            observedAt: observedAt.toISOString(),
            hour: 1792897200,
            realm: "pc",
            league: "Allflame",
            manifestRevision: "diagnostic-model3",
            sourcePreparationModelFormat: 3,
            modifierTextModelFormat: 5,
        });
        expect(classify(fixture.item)).toEqual(result);
        expect(fixture.item).toMatchObject({
            ilvl: 86,
            itemLevel: 85,
            frameType: 2,
            frameTypeId: "rare",
            name: "present",
        });
        expect(fixture.item.properties).toEqual(
            raw.properties.map(({ name, type, values }) => ({ name, type, values })),
        );
        expect(raw.name).toBe("private-name");
        fixture.item.note = "private-late-mutation";
        await diagnostics.flush([fixture]);
        const output = await saved();
        expect(output.text).not.toContain("private-");
        expect(output.fixtures[0]!.classification).toEqual(result);
        expect(output.fixtures[0]!.itemSha256).toMatch(/^[a-f0-9]{64}$/);
        expect(classify(output.fixtures[0]!.item)).toEqual(result);
    });

    it("rejects unfamiliar active key names and unsupported flag shapes without leaking them", () => {
        const diagnostics = create()!;
        for (const raw of [
            { ...sourceItem(), accountAlice: true },
            { ...sourceItem(), newGameFlag: true },
            {
                ...sourceItem(),
                explicitMods: [{ description: "Affix", flags: { accountAlice: true } }],
            },
            {
                ...sourceItem(),
                explicitMods: [{ description: "Affix", flags: { unfamiliar: "private-data" } }],
            },
            { ...sourceItem(), influences: { accountAlice: true } },
        ])
            expect(diagnostics.collect(raw, classify(raw), observedAt)).toBeNull();
        const known = {
            ...sourceItem(),
            explicitMods: [{ description: "Affix", flags: { vestigial: true } }],
            allflameCrafted: false,
        };
        const fixture = diagnostics.collect(known, classify(known), observedAt)!;
        expect(fixture.item).toMatchObject({
            allflameCrafted: false,
            explicitMods: known.explicitMods,
        });
    });

    it("keeps duplicate modifier rows and explicit null/false/zero state or skips unsupported shapes", () => {
        const diagnostics = create()!;
        const raw = {
            ...sourceItem(),
            intangibility: null,
            searing: false,
            tangled: false,
            memoryStrands: 0,
            explicitMods: ["Same line", "Same line"],
            scourgeMods: [],
        };
        const fixture = diagnostics.collect(raw, classify(raw), observedAt)!;
        expect(fixture.item).toMatchObject({
            intangibility: null,
            searing: false,
            tangled: false,
            memoryStrands: 0,
            explicitMods: ["Same line", "Same line"],
            scourgeMods: [],
        });
        const malformed = { ...sourceItem(), scourgeMods: "unsupported-shape" };
        expect(diagnostics.collect(malformed, classify(malformed), observedAt)).toBeNull();
    });

    it("requires full matches and unknown equality, not only the requested unknown target", () => {
        const diagnostics = create()!;
        const raw = sourceItem();
        expect(
            diagnostics.collect(raw, { matches: [], unknown: ["source-0"] }, observedAt),
        ).toBeNull();
        expect(
            diagnostics.collect(
                { ...raw, ilvl: 87 },
                { matches: ["ordinary-0"], unknown: ["source-0", "unrelated"] },
                observedAt,
            ),
        ).toBeNull();
    });

    it("deduplicates before replay, leaves rare bases capacity, and permits retry after discarded pages", async () => {
        const diagnostics = create()!;
        const raw = sourceItem(bases[1]);
        const classification = classify(raw);
        const replay = vi.spyOn(classifier, "classify");
        const first = diagnostics.collect(raw, classification, observedAt)!;
        for (let index = 0; index < 100; index++)
            expect(diagnostics.collect(raw, classification, observedAt)).not.toBeNull();
        expect(replay).toHaveBeenCalledTimes(1);
        const retryTime = new Date(observedAt.getTime() + 60_000);
        const retry = diagnostics.collect(raw, classification, retryTime)!;
        expect(retry.observedAt).toBe(retryTime.toISOString());
        await diagnostics.flush([retry, retry]);
        expect((await saved()).fixtures).toHaveLength(1);
        expect(diagnostics.collect(raw, classification, observedAt)).toBeNull();
        const second = diagnostics.collect(sourceItem(bases[1], 87), classification, observedAt)!;
        expect(second).not.toBeNull();
        for (let ilvl = 88; ilvl < 180; ilvl++)
            expect(
                diagnostics.collect(sourceItem(bases[1], ilvl), classification, observedAt),
            ).toBeNull();
        const rare = sourceItem(bases[0]);
        const rareFixture = diagnostics.collect(
            rare,
            { matches: ["ordinary-0"], unknown: ["source-0"] },
            observedAt,
        )!;
        expect(rareFixture).not.toBeNull();
        expect(replay).toHaveBeenCalledTimes(3);
        await diagnostics.flush([first, second, rareFixture]);
        expect((await saved()).fixtures).toHaveLength(3);
    });

    it("caps attempted classifier replays at 64 and deduplicates parity failures", () => {
        const diagnostics = create()!;
        const replay = vi.spyOn(classifier, "classify");
        const wrong = { matches: [], unknown: ["source-0"] };
        for (let index = 0; index < 100; index++)
            diagnostics.collect(sourceItem(), wrong, observedAt);
        expect(replay).toHaveBeenCalledTimes(1);
        for (let ilvl = 1; ilvl <= 100; ilvl++)
            diagnostics.collect(sourceItem(bases[0], ilvl), wrong, observedAt);
        expect(replay).toHaveBeenCalledTimes(64);
    });

    it("bounds both records and serialized bytes without discarding an entire full page", async () => {
        const diagnostics = create()!;
        const fixtures: EquipmentDiagnosticFixture[] = [];
        for (const [index, base] of bases.entries()) {
            for (let variant = 0; variant < 2; variant++) {
                const raw = sourceItem(base, 86 + variant);
                const result = classify(raw);
                const probe = create()!.collect(raw, result, observedAt)!;
                const padding = 16 * 1024 - Buffer.byteLength(JSON.stringify(probe));
                const fixture = diagnostics.collect(
                    { ...raw, typeLine: raw.typeLine + "x".repeat(padding) },
                    result,
                    observedAt,
                );
                if (index < 8) {
                    expect(fixture).not.toBeNull();
                    expect(Buffer.byteLength(JSON.stringify(fixture))).toBe(16 * 1024);
                    fixtures.push(fixture!);
                } else expect(fixture).toBeNull();
            }
        }
        await diagnostics.flush(fixtures);
        const output = await saved();
        expect(output.fixtures).toHaveLength(15);
        expect(Buffer.byteLength(output.text)).toBeLessThanOrEqual(256 * 1024);
        expect(
            create()!.collect(
                { ...sourceItem(), typeLine: "x".repeat(17 * 1024) },
                { matches: ["ordinary-0"], unknown: ["source-0"] },
                observedAt,
            ),
        ).toBeNull();
    });

    it("does not repeatedly replay records that exceed the fixture limit after metadata", () => {
        const raw = sourceItem();
        const result = classify(raw);
        const probe = create()!.collect(raw, result, observedAt)!;
        const padding = 16 * 1024 - Buffer.byteLength(JSON.stringify(probe)) + 1;
        const oversized = { ...raw, typeLine: raw.typeLine + "x".repeat(padding) };
        const diagnostics = create()!;
        const replay = vi.spyOn(classifier, "classify");
        for (let index = 0; index < 100; index++)
            expect(diagnostics.collect(oversized, result, observedAt)).toBeNull();
        expect(replay).toHaveBeenCalledTimes(1);
        expect(diagnostics.collect(raw, result, observedAt)).not.toBeNull();
        expect(replay).toHaveBeenCalledTimes(2);
    });

    it("does not collect or persist after expiry", async () => {
        const expiresAt = Date.now() + 1000;
        const diagnostics = create({ expiresAt })!;
        const raw = sourceItem();
        const result = classify(raw);
        const fixture = diagnostics.collect(raw, result, observedAt)!;
        vi.spyOn(Date, "now").mockReturnValue(expiresAt);
        expect(diagnostics.collect(raw, result, observedAt)).toBeNull();
        await diagnostics.flush([fixture]);
        await expect(saved()).rejects.toThrow();
    });

    it("makes file failures nonfatal and only warns with fixed safe text", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const diagnostics = create({
            file: join(directory, "private-missing-dir", "fixtures.json"),
        })!;
        const raw = sourceItem();
        const fixture = diagnostics.collect(raw, classify(raw), observedAt)!;
        await expect(diagnostics.flush([fixture])).resolves.toBeUndefined();
        await expect(diagnostics.flush([fixture])).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalledExactlyOnceWith(
            "Equipment diagnostics unavailable; ingestion will continue.",
        );
        expect(diagnostics.collect(raw, classify(raw), observedAt)).toBeNull();
    });
});
