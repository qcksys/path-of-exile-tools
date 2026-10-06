import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { availableOmens } from "../app/lib/crafting-omens";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    hasCraftingRequirements,
} from "../app/lib/crafting-simulation";
import {
    type CraftingItem,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";

const catalog = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const engine = new CraftingEngine(catalog);
const vaal = {
    kind: "currency" as const,
    id: catalog.crafting.currencies.find((entry) => entry.id.endsWith("/CurrencyCorrupt"))!.id,
};
const omen = availableOmens(catalog, vaal)[0]!;
const withOmen = { ...vaal, omens: [omen.id] };
const blank = (tier = 15) =>
    engine.createItem(catalog.crafting.waystones.find((entry) => entry.tier === tier)!.id);
function prepared(tier = 15, rarity: CraftingItem["rarity"] = "rare") {
    let item = { ...blank(tier), rarity };
    const sides =
        rarity === "rare"
            ? ["prefix", "prefix", "prefix", "suffix", "suffix", "suffix"]
            : rarity === "magic"
              ? ["prefix", "suffix"]
              : [];
    for (const side of sides)
        item = engine.addStartingMod(item, engine.pool(item, { side })[0]!.id, seededRandom(1));
    return item;
}
function force(outcome: string, choice?: number) {
    const random = seededRandom(42);
    const pick = vi
        .spyOn(random, "pick")
        .mockImplementationOnce(
            (choices) => choices.find((entry) => entry.value === outcome)!.value,
        );
    if (choice !== undefined)
        pick.mockImplementationOnce(
            (choices) => choices.find((entry) => entry.value === choice)!.value,
        );
    return random;
}

describe("PoE 2 Waystone corruption", () => {
    it("uses extracted tier records on every Waystone and consumes Vaal and omen costs", () => {
        expect(catalog.crafting.waystones).toHaveLength(16);
        for (const entry of catalog.crafting.waystones) {
            const item = blank(entry.tier);
            expect(engine.waystone(item)).toEqual(entry);
            expect(engine.corruptionKind(item)).toBe("waystone");
            expect(engine.apply(item, vaal, force("none")).item).toEqual({
                ...item,
                corrupted: true,
            });
            expect(
                engine
                    .apply(item, withOmen, force("extra", 0))
                    .cost.map(({ id, amount }) => [id, amount]),
            ).toEqual([
                [vaal.id, 1],
                [omen.id, 1],
            ]);
        }
        for (const waystoneTier of [
            { min: 0, max: 16 },
            { min: 1, max: 17 },
            { min: 16, max: 15 },
        ])
            expect(() => engine.validateTarget({ groups: [], waystoneTier })).toThrow();
        const target = engine.validateTarget({ groups: [], waystoneTier: { min: 16, max: 16 } });
        expect(hasCraftingRequirements(target)).toBe(true);
        const jewel = engine.createItem(
            Object.entries(catalog.bases).find(([, entry]) => entry.name === "Ruby")![0],
        );
        expect(engine.matches(jewel, target)).toBe(false);
        const poe1 = new CraftingEngine(
            craftingCatalogSchema.parse(
                JSON.parse(readFileSync("public/game-data/crafting-poe1.json", "utf8")),
            ),
        );
        expect(() => poe1.validateTarget(target)).toThrow("extracted PoE 2 build");
    });

    it.each([
        [15, 1, 16],
        [15, -1, 14],
        [1, -1, 1],
        [16, 1, 16],
    ])("changes tier %i by %i to %i, rerolling affixes even at boundaries", (tier, direction, expected) => {
        const item = { ...prepared(tier), quality: 20 };
        item.mods.forEach((entry) => {
            entry.fractured = true;
        });
        const before = structuredClone(item);
        const result = engine.apply(item, vaal, force("tier", direction)).item;
        expect(engine.waystone(result)?.tier).toBe(expected);
        expect(engine.waystone(result)?.areaLevel).toBe(expected + 64);
        expect(result).toMatchObject({
            level: item.level,
            quality: 20,
            rarity: "rare",
            corrupted: true,
        });
        expect(result.mods).toHaveLength(6);
        expect(result.mods.every((entry) => !entry.fractured)).toBe(true);
        expect(engine.validateItem(result)).toEqual(result);
        expect(item).toEqual(before);
        const copied = exportCraftingItemText(engine, result);
        expect(
            importCraftingItemText(engine, copied).some(
                (entry) => exportCraftingItemText(engine, entry.item) === copied,
            ),
        ).toBe(true);
    });

    it("replaces suffixes with prefixes while retaining existing prefixes and fractured suffixes", () => {
        for (const fractures of [false, true]) {
            const item = prepared();
            const prefixes = item.mods.slice(0, 3);
            if (fractures)
                item.mods.slice(3).forEach((entry) => {
                    entry.fractured = true;
                });
            const result = engine.apply(item, vaal, force("prefixes")).item;
            expect(engine.counts(result)).toEqual({ prefixes: 6, suffixes: fractures ? 3 : 0 });
            expect(result.mods).toHaveLength(fractures ? 9 : 6);
            expect(result.mods.slice(0, 3)).toEqual(prefixes);
            if (fractures) expect(result.mods.slice(3, 6)).toEqual(item.mods.slice(3));
            expect(engine.validateItem(result)).toEqual(result);
            expect(() => engine.validateItem({ ...result, corrupted: false })).toThrow(
                "affix limits",
            );
            if (fractures) {
                const forged = structuredClone(result);
                forged.mods[3]!.fractured = false;
                expect(() => engine.validateItem(forged)).toThrow("affix limits");
            }
            const text = exportCraftingItemText(engine, result);
            expect(
                importCraftingItemText(engine, text).some(
                    (entry) => exportCraftingItemText(engine, entry.item) === text,
                ),
            ).toBe(true);
        }
    });

    it.each([
        0, 1, 2, 3, 4,
    ])("adds %i affixes subject to four per side and eight total without rerolling existing values", (count) => {
        const item = prepared();
        item.mods[0]!.fractured = true;
        const result = engine.apply(item, vaal, force("extra", count)).item;
        expect(result.mods).toHaveLength(Math.min(8, 6 + count));
        expect(result.mods.slice(0, 6)).toEqual(item.mods);
        expect(engine.counts(result).prefixes).toBeLessThanOrEqual(4);
        expect(engine.counts(result).suffixes).toBeLessThanOrEqual(4);
        expect(engine.validateItem(result)).toEqual(result);
        if (result.mods.length === 8) {
            const text = exportCraftingItemText(engine, result);
            expect(
                importCraftingItemText(engine, text).some(
                    (entry) => exportCraftingItemText(engine, entry.item) === text,
                ),
            ).toBe(true);
        }
    });

    it.each([
        "normal",
        "magic",
    ] as const)("preserves %s rarity for each outcome, including added affixes", (rarity) => {
        const item = prepared(15, rarity);
        for (const [outcome, choice] of [
            ["tier", 1],
            ["prefixes", undefined],
            ["extra", 4],
        ] as const) {
            const result = engine.apply(item, vaal, force(outcome, choice)).item;
            expect(result.rarity).toBe(rarity);
            expect(result.mods).toHaveLength(item.mods.length + (outcome === "extra" ? 4 : 0));
            expect(engine.validateItem(result)).toEqual(result);
        }
    });

    it("clears removed hidden suffix reveals and stops when a replacement pool runs out", () => {
        const bone = catalog.crafting.desecration.find((entry) =>
            entry.itemClasses.includes("Map"),
        )!;
        const item = prepared();
        item.mods.pop();
        const hidden = engine.apply(item, { kind: "currency", id: bone.id }, seededRandom(1)).item;
        expect(hidden.reveal).toBeDefined();
        expect(engine.mod(hidden.reveal!.mod).generation_type).toBe("suffix");
        for (const [outcome, choice] of [
            ["prefixes", undefined],
            ["tier", 1],
        ] as const) {
            const result = engine.apply(hidden, vaal, force(outcome, choice)).item;
            expect(result.reveal).toBeUndefined();
            expect(result.mods).toHaveLength(6);
        }
        const expanded = engine.apply(hidden, vaal, force("extra", 4)).item;
        expect(expanded.mods).toHaveLength(8);
        expect(expanded.reveal).toEqual(hidden.reveal);
        const offered = engine.revealChoices(expanded, seededRandom(1));
        const revealed = engine.chooseRevealed(
            offered,
            offered.reveal!.choices[0]!,
            seededRandom(2),
        );
        expect(revealed.mods).toHaveLength(8);
        expect(revealed.reveal).toBeUndefined();
        expect(engine.validateItem(revealed)).toEqual(revealed);
        const narrow = new CraftingEngine({ ...catalog, mods: {} });
        expect(narrow.apply(blank(), vaal, force("extra", 4)).item.mods).toEqual([]);
    });

    it("retains corruption affixes without creating ordinary open slots", () => {
        for (const rarity of ["normal", "magic", "rare"] as const) {
            const item = prepared(15, rarity);
            const limits = engine.limits(item);
            for (const [outcome, choice] of [
                ["none", undefined],
                ["tier", 1],
                ["extra", 4],
            ] as const) {
                const result = engine.apply(item, vaal, force(outcome, choice)).item;
                expect(engine.limits(result)).toEqual(limits);
                expect(
                    engine.matches(
                        result,
                        engine.validateTarget({
                            groups: [],
                            affixCount: { min: result.mods.length, max: result.mods.length },
                        }),
                    ),
                ).toBe(true);
                expect(
                    engine.matches(result, engine.validateTarget({ groups: [], openAffixes: 1 })),
                ).toBe(false);
                expect(
                    engine.matches(result, engine.validateTarget({ groups: [], openPrefixes: 1 })),
                ).toBe(false);
                expect(
                    engine.matches(result, engine.validateTarget({ groups: [], openSuffixes: 1 })),
                ).toBe(false);
            }
        }
        const prefixOnly = engine.apply(prepared(), vaal, force("prefixes")).item;
        expect(
            engine.matches(prefixOnly, engine.validateTarget({ groups: [], openAffixes: 1 })),
        ).toBe(false);
        expect(engine.validateItem(prefixOnly)).toEqual(prefixOnly);
    });

    it("enumerates all five affix-count choices, tier targets, omen odds and conditional spending", () => {
        const source = prepared();
        const narrow = {
            ...catalog,
            mods: Object.fromEntries(
                source.mods.slice(0, 3).map((entry) => [entry.id, catalog.mods[entry.id]!]),
            ),
        };
        const model = new CraftingEngine(narrow);
        const item = blank();
        for (const method of [vaal, withOmen]) {
            const divisor = method === vaal ? 4 : 3;
            const countTarget = model.validateTarget({
                groups: [],
                affixCount: { min: 3, max: 3 },
            });
            expect(calculateExact(model, item, method, countTarget).probability).toBeCloseTo(
                2 / (5 * divisor),
            );
            const target = model.validateTarget({ groups: [], waystoneTier: { min: 16, max: 16 } });
            expect(calculateExact(model, item, method, target).probability).toBeCloseTo(
                1 / (2 * divisor),
            );
            const project = craftingProjectSchema.parse({
                format: 1,
                game: "poe2",
                patch: catalog.patch,
                item,
                method,
                target,
                steps: [{ id: "vaal", method, condition: target }],
                prices: { [vaal.id]: 2, [omen.id]: 3 },
                seed: 42,
                iterations: 1000,
                maxActions: 1,
            });
            expect(calculateProcessExact(model, { ...project, useProcess: true })).toMatchObject({
                probability: expect.closeTo(1 / (2 * divisor)),
                meanCost: expect.closeTo(method === vaal ? 2 : 5),
            });
            const simulation = new CraftingSimulation(catalog, project, true);
            for (let index = 0; index < project.iterations; index++) simulation.runTrial();
            const result = simulation.result();
            expect(result.errors).toEqual({});
            expect(result.meanCost).toBe(method === vaal ? 2 : 5);
            expect(Math.abs(result.probability - 1 / (2 * divisor))).toBeLessThan(0.03);
            expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(
                project,
            );
        }
    });

    it("rejects corrupted and mirrored inputs before making any random decision", () => {
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        for (const state of [{ corrupted: true }, { mirrored: true }])
            expect(() => engine.apply({ ...blank(), ...state }, vaal, random)).toThrow();
        expect(pick).not.toHaveBeenCalled();
    });
});
