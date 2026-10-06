import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { baseDefenceEntries } from "../app/lib/crafting-defences";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    validateProject,
} from "../app/lib/crafting-simulation";
import {
    type CraftingItem,
    type CraftingMethod,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";

for (const game of ["poe1", "poe2"] as const) {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const engine = new CraftingEngine(catalog);
    const baseId = Object.entries(catalog.bases).find(
        ([, base]) =>
            base.item_class === "Body Armour" &&
            !base.corrupted &&
            !base.implicits.length &&
            base.tags.includes("str_armour"),
    )![0];
    const wisdom = catalog.crafting.currencies.find((entry) => entry.action === "identify")!;
    const method: CraftingMethod = { kind: "currency", id: wisdom.id };
    const blank = (): CraftingItem => ({
        ...engine.createItem(baseId),
        rarity: "rare",
        unidentified: true,
        ...(game === "poe1" ? { memoryStrands: 82 } : {}),
    });

    describe(`${game} ordinary equipment identification`, () => {
        it.each([
            "magic",
            "rare",
        ] as const)("identifies %s equipment without changing its known properties", (rarity) => {
            const input = {
                ...blank(),
                rarity,
                corrupted: true,
                mirrored: true,
                quality: 20,
                sockets: 2,
                influences: game === "poe1" ? [0] : [],
                baseDefences: Object.fromEntries(
                    baseDefenceEntries(catalog, blank()).map(({ key, range }) => [key, range.max]),
                ),
            };
            const before = structuredClone(input);
            for (let seed = 0; seed < 10; seed++) {
                const result = engine.apply(input, method, seededRandom(seed));
                expect(result.item.unidentified).toBeUndefined();
                expect(result.item.mods.length).toBeGreaterThanOrEqual(rarity === "magic" ? 1 : 4);
                expect({ ...result.item, mods: [], unidentified: true }).toEqual(input);
                expect(result.cost).toEqual([{ id: wisdom.id, name: wisdom.name, amount: 1 }]);
            }
            expect(input).toEqual(before);
        });

        it("rejects other crafts and known modifiers before consuming randomness", () => {
            const random = seededRandom(42);
            const pick = vi.spyOn(random, "pick");
            const chaos = catalog.crafting.currencies.find((entry) => entry.action === "reroll")!;
            expect(() => engine.apply(blank(), { kind: "currency", id: chaos.id }, random)).toThrow(
                "Identify",
            );
            expect(() =>
                engine.apply({ ...blank(), unidentified: undefined }, method, random),
            ).toThrow("unidentified");
            const mod = engine.pool(blank())[0]!;
            expect(() => engine.addStartingMod(blank(), mod.id, random)).toThrow("Identify");
            expect(() =>
                engine.validateItem({
                    ...blank(),
                    mods: [engine.rollMod(mod.id, seededRandom(1))],
                }),
            ).toThrow("Unidentified");
            expect(() => engine.validateItem({ ...blank(), rarity: "normal" })).toThrow(
                "Unidentified",
            );
            expect(() => engine.validateItem({ ...blank(), allflameCrafted: true })).toThrow(
                "Unidentified",
            );
            expect(() =>
                engine.validateItem({ ...blank(), imprint: engine.createItem(baseId) }),
            ).toThrow("Unidentified");
            expect(() =>
                engine.validateItem({
                    ...blank(),
                    unidentified: undefined,
                    imprint: { ...blank(), rarity: "magic" },
                }),
            ).toThrow("imprint");
            expect(pick).not.toHaveBeenCalled();
        });

        it("keeps unidentified state through text and projects without claiming empty-affix targets", () => {
            const input = engine.validateItem(blank());
            const text = exportCraftingItemText(engine, input);
            expect(text).toContain("Unidentified");
            const imported = importCraftingItemText(engine, text);
            expect(imported.map(({ item }) => item)).toContainEqual(input);
            expect(imported[0]!.warnings.join(" ")).toContain("ordinary");
            const gameCopy = `Rarity: Rare\n${engine.base(input).name}\n--------\nItem Level: 86\n--------\nUnidentified`;
            expect(importCraftingItemText(engine, gameCopy)[0]!.item.unidentified).toBe(true);
            expect(() => importCraftingItemText(engine, `${gameCopy}\nFractured Item`)).toThrow(
                "hidden modifier",
            );
            expect(
                engine.matches(
                    input,
                    engine.validateTarget({ groups: [], affixCount: { min: 0, max: 0 } }),
                ),
            ).toBe(false);
            expect(engine.matches(input, engine.validateTarget({ groups: [] }))).toBe(false);
            const project = craftingProjectSchema.parse({
                format: 1,
                game,
                patch: catalog.patch,
                item: input,
                method,
                target: { groups: [], rarity: "rare" },
                steps: [],
                prices: {},
                seed: 42,
                iterations: 100,
                maxActions: 1,
            });
            expect(validateProject(catalog, JSON.parse(JSON.stringify(project))).item).toEqual(
                input,
            );
            expect(
                engine.apply(input, { kind: "generate", id: "normal" }, seededRandom(1)).item
                    .unidentified,
            ).toBeUndefined();
        });

        it("shares exact, sampled and process outcomes and charges one extracted Wisdom per attempt", () => {
            const input = blank();
            const candidates = engine.pool(input);
            const prefix = candidates.find(({ mod }) => mod.generation_type === "prefix")!;
            const suffix = candidates.find(({ mod }) => mod.generation_type === "suffix")!;
            const reduced = {
                ...catalog,
                mods: { [prefix.id]: prefix.mod, [suffix.id]: suffix.mod },
            };
            const small = new CraftingEngine(reduced);
            const project = craftingProjectSchema.parse({
                format: 1,
                game,
                patch: catalog.patch,
                item: input,
                method,
                target: { groups: [{ mods: [prefix.id] }, { mods: [suffix.id] }] },
                useProcess: true,
                steps: [
                    {
                        id: "identify",
                        method,
                        condition: { groups: [], rarity: "rare" },
                        onSuccess: "success",
                        onFailure: "failure",
                    },
                ],
                prices: { [wisdom.id]: 2 },
                seed: 42,
                iterations: 100,
                maxActions: 1,
            });
            expect(calculateExact(small, input, method, project.target).probability).toBe(1);
            expect(calculateProcessExact(small, project)).toMatchObject({
                probability: 1,
                meanCost: 2,
            });
            for (const process of [false, true]) {
                const simulation = new CraftingSimulation(reduced, project, process);
                for (let trial = 0; trial < 20; trial++) simulation.runTrial();
                expect(simulation.result()).toMatchObject({
                    probability: 1,
                    errors: {},
                    spending: { [wisdom.id]: 20 },
                    totalActions: 20,
                });
            }
        });

        if (game === "poe1") {
            it("uses the supplied 82-strand two-tier boundary for eight-tier resistances without consuming strands", () => {
                const input = blank();
                const fire = engine.pool(input).filter(({ id }) => /^FireResist\d$/.test(id));
                expect(fire).toHaveLength(8);
                const top = fire
                    .sort((a, b) => b.mod.required_level - a.mod.required_level)
                    .slice(0, 2);
                const reduced = {
                    ...catalog,
                    mods: Object.fromEntries(fire.map(({ id, mod }) => [id, mod])),
                };
                const small = new CraftingEngine(reduced);
                for (const strands of [0, 82]) {
                    const target = small.validateTarget({
                        groups: [{ mods: top.map(({ id }) => id) }],
                    });
                    const exact = calculateExact(
                        small,
                        { ...input, memoryStrands: strands },
                        method,
                        target,
                    );
                    expect(exact.probability).toBeCloseTo(
                        strands
                            ? 1
                            : top.reduce((n, m) => n + m.weight, 0) /
                                  fire.reduce((n, m) => n + m.weight, 0),
                        12,
                    );
                    for (let seed = 0; seed < 15; seed++) {
                        const result = small.apply(
                            { ...input, memoryStrands: strands },
                            method,
                            seededRandom(seed),
                        );
                        expect(result.item.memoryStrands).toBe(strands);
                        if (strands)
                            expect(top.map(({ id }) => id)).toContain(result.item.mods[0]!.id);
                    }
                }
            });

            it("rejects rare Grasping Mail templates with an unresolved special pool", () => {
                expect(() =>
                    engine.validateItem({
                        ...blank(),
                        baseId: "Metadata/Items/Armours/BodyArmours/BodyStrDexInt2",
                    }),
                ).toThrow("Unidentified");
            });
        }
    });
}
