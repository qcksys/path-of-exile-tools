import { describe, expect, it } from "vite-plus/test";
import {
    type ItemQuery,
    itemQuerySchema,
    itemRecordSchema,
    matchItem,
    normalizeApiItem,
} from "../src/index.ts";

const query = (filters: unknown[], game = "poe1"): ItemQuery =>
    itemQuerySchema.parse({
        game,
        groups: filters.length ? [{ type: "and", filters }] : [],
    });
const base = { baseType: "Necrotic Armour", ilvl: 86, rarity: "Rare", identified: true };

describe("API-shaped item queries", () => {
    it("preserves unfamiliar source fields through normalization and JSON serialization", () => {
        const source = { ...base, frameTypeId: "rare", futureAttribute: { values: [1, "new"] } };
        const record = normalizeApiItem("poe1", "stash", source);
        expect(itemRecordSchema.parse(JSON.parse(JSON.stringify(record))).item).toEqual(source);
    });

    it("matches a useful base by level, links and excluded crafting restrictions", () => {
        const record = normalizeApiItem("poe1", "stash", {
            ...base,
            sockets: Array.from({ length: 6 }, () => ({ group: 0, sColour: "B" })),
        });
        const target = query([
            { kind: "base", field: "baseType", values: ["Necrotic Armour"] },
            { kind: "range", field: "ilvl", value: { min: 84, max: 86 } },
            { kind: "range", field: "links", value: { min: 6 } },
            ...["corrupted", "mirrored", "fractured", "influenced"].map((field) => ({
                kind: "flag",
                field,
                value: false,
            })),
        ]);
        expect(matchItem(record, target)).toBe("match");
        expect(matchItem({ ...record, item: { ...record.item, duplicated: true } }, target)).toBe(
            "no-match",
        );
        expect(
            matchItem({ ...record, item: { ...record.item, influences: { elder: true } } }, target),
        ).toBe("no-match");
    });

    it("distinguishes PoE 2 rarity and sockets without applying PoE 1 links", () => {
        const record = normalizeApiItem("poe2", "paste", {
            ...base,
            rarity: "Magic",
            sockets: [{ group: 0, type: "rune" }],
        });
        expect(matchItem(record, query([{ kind: "rarity", values: ["Magic"] }], "poe2"))).toBe(
            "match",
        );
        expect(matchItem(record, query([{ kind: "rarity", values: ["Rare"] }], "poe2"))).toBe(
            "no-match",
        );
        expect(
            matchItem(
                record,
                query([{ kind: "range", field: "links", value: { min: 1 } }], "poe2"),
            ),
        ).toBe("unknown");
        expect(matchItem(record, query([]))).toBe("no-match");
    });

    it("uses source affix counts but requires game-specific capacity for empty slots", () => {
        const record = normalizeApiItem("poe1", "stash", {
            ...base,
            explicitMods: ["unresolved line"],
            extended: { prefixes: 1, suffixes: 0 },
        });
        const target = query([{ kind: "range", field: "openSuffixes", value: { min: 3 } }]);
        expect(matchItem(record, target)).toBe("unknown");
        expect(matchItem({ ...record, facts: { ...record.facts, suffixLimit: 3 } }, target)).toBe(
            "match",
        );
        expect(matchItem({ ...record, facts: { ...record.facts, suffixLimit: 1 } }, target)).toBe(
            "no-match",
        );
    });

    it("reads verified trade tier metadata without treating display lines as separate affixes", () => {
        const record = normalizeApiItem("poe1", "trade", {
            ...base,
            baseType: "Solar Maul",
            rarity: "Magic",
            explicitMods: [
                {
                    description: "179% increased Physical Damage",
                    mods: [{ name: "Merciless", tier: "P1", level: 83 }],
                },
                {
                    description: "chance to cause Bleeding",
                    mods: [{ name: "of Haemophilia", tier: "S0", level: 40 }],
                },
                {
                    description: "increased Damage with Bleeding",
                    mods: [{ name: "of Haemophilia", tier: "S0", level: 40 }],
                },
            ],
        });
        expect(record.facts.modifiers).toHaveLength(2);
        expect(record.facts).toMatchObject({ prefixes: 1, suffixes: 1, modifiersComplete: true });
        expect(
            matchItem(
                record,
                query([
                    { kind: "mod", names: ["Merciless"], tier: { min: 1, max: 1 }, side: "prefix" },
                ]),
            ),
        ).toBe("match");
        expect(
            matchItem(record, query([{ kind: "mod", ids: ["LocalPhysicalDamagePercent9"] }])),
        ).toBe("unknown");
    });

    it("does not infer a hybrid modifier from combined displayed stat values", () => {
        const record = normalizeApiItem("poe1", "craft", base, {
            modifiersComplete: true,
            modifiers: [
                { id: "percent-physical", side: "prefix", tier: 2 },
                { id: "flat-accuracy", side: "prefix", tier: 1 },
            ],
            stats: {
                explicit: { physical: 100, accuracy: 150 },
                implicit: {},
                total: { physical: 100, accuracy: 150 },
            },
            statsComplete: true,
        });
        expect(
            matchItem(record, query([{ kind: "mod", ids: ["hybrid-physical"], tier: { max: 1 } }])),
        ).toBe("no-match");
        expect(
            matchItem(record, query([{ kind: "stat", id: "physical", value: { min: 100 } }])),
        ).toBe("match");
    });

    it("checks identity, tier and fracture on the same modifier", () => {
        const record = normalizeApiItem("poe1", "craft", base, {
            modifiersComplete: true,
            modifiers: [
                { id: "energy-shield", tier: 1, fractured: false },
                { id: "life", tier: 2, fractured: true },
            ],
        });
        expect(
            matchItem(record, query([{ kind: "mod", ids: ["energy-shield"], fractured: true }])),
        ).toBe("no-match");
        expect(
            matchItem(
                record,
                query([{ kind: "mod", ids: ["life"], tier: { max: 2 }, fractured: true }]),
            ),
        ).toBe("match");
    });

    it.each([
        "and",
        "or",
        "not",
        "count",
    ])("keeps missing canonical metadata unknown in %s groups", (type) => {
        const record = normalizeApiItem("poe1", "stash", {
            ...base,
            explicitMods: ["179% increased Physical Damage"],
        });
        const target = itemQuerySchema.parse({
            game: "poe1",
            groups: [
                {
                    type,
                    filters: [{ kind: "mod", ids: ["percent-physical"] }],
                    ...(type === "count" ? { value: { min: 1 } } : {}),
                },
            ],
        });
        expect(matchItem(record, target)).toBe("unknown");
    });

    it("can establish a count lower bound even if further modifiers are unknown", () => {
        const record = normalizeApiItem("poe1", "stash", base, {
            modifiersComplete: false,
            modifiers: [{ id: "life", fractured: true }],
        });
        expect(
            matchItem(record, query([{ kind: "mod", fractured: true, count: { min: 1 } }])),
        ).toBe("match");
        expect(
            matchItem(record, query([{ kind: "mod", fractured: true, count: { min: 1, max: 1 } }])),
        ).toBe("unknown");
    });

    it("rejects inverted ranges and oversized queries", () => {
        expect(() =>
            query([{ kind: "range", field: "ilvl", value: { min: 86, max: 84 } }]),
        ).toThrow();
        expect(() =>
            query(
                Array.from({ length: 65 }, () => ({
                    kind: "flag",
                    field: "corrupted",
                    value: false,
                })),
            ),
        ).toThrow();
    });

    it("keeps unresolved implicit identities unknown without losing known explicit affix counts", () => {
        const record = normalizeApiItem("poe1", "trade", {
            ...base,
            implicitMods: ["+20 to Strength"],
            explicitMods: [
                {
                    description: "179% increased Physical Damage",
                    mods: [{ name: "Merciless", tier: "P1", level: 83 }],
                },
            ],
        });
        expect(record.facts.prefixes).toBe(1);
        expect(
            matchItem(
                record,
                query([{ kind: "mod", ids: ["StrengthImplicit"], side: "implicit" }]),
            ),
        ).toBe("unknown");
    });
});
