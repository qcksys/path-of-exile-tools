import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { craftingFlags, setCraftingFlag } from "../app/lib/crafting-flags";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    hasCraftingRequirements,
    validateProject,
} from "../app/lib/crafting-simulation";
import { craftingCatalogSchema, craftingProjectSchema } from "../app/schemas/crafting";

for (const game of ["poe1", "poe2"] as const) {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const engine = new CraftingEngine(catalog);
    const baseId = Object.entries(catalog.bases).find(
        ([, base]) => base.item_class === "Ring" && base.implicits.length,
    )![0];
    const item = engine.validateItem({ ...engine.createItem(baseId), rarity: "rare" });
    const currency = (action: string) => ({
        kind: "currency" as const,
        id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
    });
    const target = (patch: object = {}) => engine.validateTarget({ groups: [], ...patch });

    describe(`${game} item flags`, () => {
        it("edits flags without changing inputs or rolls and makes terminal flags exclusive", () => {
            const starting = engine.addStartingMod(item, engine.pool(item)[0]!.id, seededRandom(8));
            const before = structuredClone(starting);
            let edited = starting;
            for (const { key } of craftingFlags(game)) {
                edited = setCraftingFlag(engine, edited, key, true);
                expect(edited[key]).toBe(true);
                if (key !== "split") {
                    for (const other of ["corrupted", "mirrored", "sanctified"] as const)
                        expect(Boolean(edited[other])).toBe(other === key);
                }
                expect(edited.mods).toEqual(starting.mods);
            }
            for (const { key } of craftingFlags(game)) {
                edited = setCraftingFlag(engine, edited, key, false);
                expect(Boolean(edited[key])).toBe(false);
            }
            expect(edited).toEqual(starting);
            expect(starting).toEqual(before);
        });

        it("rejects flags and nested conditions from the other game, including false conditions", () => {
            const unsupported = game === "poe1" ? "sanctified" : "split";
            expect(() => setCraftingFlag(engine, item, unsupported, false)).toThrow("unavailable");
            expect(() => engine.validateItem({ ...item, [unsupported]: true })).toThrow();
            for (const value of [false, true]) {
                expect(() => target({ [unsupported]: value })).toThrow();
                expect(() =>
                    target({
                        expression: {
                            operator: "and",
                            operands: [{ groups: [], [unsupported]: value }],
                        },
                    }),
                ).toThrow();
            }
        });

        it("matches present and absent flags in combined and nested conditions", () => {
            for (const { key } of craftingFlags(game)) {
                const present = target({ [key]: true });
                const absent = target({ [key]: false });
                expect(hasCraftingRequirements(absent)).toBe(true);
                expect(engine.matches(item, absent)).toBe(true);
                expect(engine.matches(item, present)).toBe(false);
                const edited = setCraftingFlag(engine, item, key, true);
                expect(engine.matches(edited, present)).toBe(true);
                expect(engine.matches(edited, absent)).toBe(false);
                expect(
                    engine.matches(
                        edited,
                        target({
                            rarity: "rare",
                            expression: {
                                operator: "or",
                                operands: [present, target({ rarity: "magic" })],
                            },
                        }),
                    ),
                ).toBe(true);
            }
        });

        it("preserves flags and false requirements through projects, inventory, text and process routing", () => {
            const key = game === "poe1" ? "split" : "sanctified";
            const starting = setCraftingFlag(engine, item, key, true);
            const project = craftingProjectSchema.parse({
                format: 1,
                game,
                patch: catalog.patch,
                item: starting,
                method: currency("add_mod_to_rare"),
                target: target({ [key]: true, mirrored: false }),
                inventory: [{ id: "saved", name: "Flagged item", item: starting }],
                steps: [
                    {
                        id: "check",
                        condition: target({ [key]: true, mirrored: false }),
                        onSuccess: "success",
                        onFailure: "failure",
                    },
                ],
                useProcess: true,
                prices: {},
                seed: 42,
                iterations: 10,
                maxActions: 1,
            });
            expect(validateProject(catalog, JSON.parse(JSON.stringify(project)))).toEqual(project);
            expect(
                importCraftingItemText(engine, exportCraftingItemText(engine, starting))[0]!.item,
            ).toEqual(starting);
            expect(calculateProcessExact(engine, project)).toMatchObject({
                probability: 1,
                totalActions: 0,
                spending: {},
            });
            const simulation = new CraftingSimulation(catalog, project);
            for (let trial = 0; trial < 10; trial++) simulation.runTrial();
            expect(simulation.result()).toMatchObject({
                successes: 10,
                totalActions: 0,
                errors: {},
            });
            project.target = target({ [key]: false });
            project.steps[0]!.condition = project.target;
            expect(calculateProcessExact(engine, project)).toMatchObject({ probability: 0 });
        });

        it("preserves Corrupted and Mirrored independently in item text", () => {
            for (const key of ["corrupted", "mirrored"] as const) {
                const edited = setCraftingFlag(engine, item, key, true);
                expect(
                    importCraftingItemText(engine, exportCraftingItemText(engine, edited))[0]!.item,
                ).toEqual(edited);
            }
        });
    });

    if (game === "poe1") {
        it("retains Split through crafting and rejects removing corruption required by an implicit", () => {
            const split = setCraftingFlag(engine, item, "split", true);
            expect(
                engine.apply(split, currency("add_mod_to_rare"), seededRandom(8)).item.split,
            ).toBe(true);
            expect(
                calculateExact(engine, split, currency("add_mod_to_rare"), target({ split: true }))
                    .probability,
            ).toBe(1);
            const imprinted = engine.apply(split, currency("inital_imprint"), seededRandom(8)).item;
            expect(imprinted.imprint?.split).toBe(true);
            const restored = engine.apply(
                imprinted,
                currency("restore_imprint"),
                seededRandom(8),
            ).item;
            expect(restored.split).toBe(true);
            const implicit = engine.corruptedModifiers(item)[0]!;
            const corrupted = engine.validateItem({
                ...item,
                corrupted: true,
                implicits: [engine.rollMod(implicit.id, seededRandom(8))],
            });
            expect(() => setCraftingFlag(engine, corrupted, "corrupted", false)).toThrow();
            expect(() => setCraftingFlag(engine, corrupted, "mirrored", true)).toThrow();
            expect(corrupted.corrupted).toBe(true);
            const destroyed = engine.validateItem({ ...item, corrupted: true, destroyed: true });
            expect(() => setCraftingFlag(engine, destroyed, "corrupted", false)).toThrow(
                "Destroyed",
            );
        });
        it("protects intrinsic corruption and pending Allflame copies", () => {
            const intrinsic = Object.entries(catalog.bases).find(([, base]) => base.corrupted)![0];
            expect(() =>
                setCraftingFlag(engine, engine.createItem(intrinsic), "corrupted", false),
            ).toThrow("intrinsically corrupted");
            const pending = engine.prepareAllflame(
                item,
                { ...currency("add_mod_to_rare"), allflame: true },
                seededRandom(8),
            ).item;
            for (const { key } of craftingFlags(game))
                expect(() => setCraftingFlag(engine, pending, key, true)).toThrow(
                    "Choose an Allflame copy",
                );
        });
    } else {
        it("matches a Sanctification craft in exact and sampled calculations", () => {
            const starting = engine.addStartingMod(item, "IncreasedLife1", seededRandom(8));
            const method = {
                ...currency("reroll_mod_values"),
                omens: [
                    catalog.crafting.currencies.find((entry) =>
                        entry.id.endsWith("/OmenOnDivineSanctify"),
                    )!.id,
                ],
            };
            const requirement = target({ sanctified: true, mirrored: false });
            expect(calculateExact(engine, starting, method, requirement).probability).toBe(1);
            expect(
                calculateExact(engine, starting, method, target({ sanctified: false })).probability,
            ).toBe(0);
            const project = craftingProjectSchema.parse({
                format: 1,
                game,
                patch: catalog.patch,
                item: starting,
                method,
                target: requirement,
                steps: [],
                prices: {},
                seed: 42,
                iterations: 10,
                maxActions: 1,
            });
            const simulation = new CraftingSimulation(catalog, project);
            for (let trial = 0; trial < 10; trial++) simulation.runTrial();
            expect(simulation.result()).toMatchObject({
                successes: 10,
                totalActions: 10,
                errors: {},
            });
        });

        it("clears linked corruption markers on compatible outcomes", () => {
            for (const provenance of [{ twiceCorrupted: true }, { putrefied: true }]) {
                const corrupted = engine.validateItem({ ...item, corrupted: true, ...provenance });
                expect(setCraftingFlag(engine, corrupted, "corrupted", false)).toEqual(item);
            }
        });

        it("clears Sanctification multipliers without rerolling and requires an eligible rare item", () => {
            const mod = engine.rollMod("IncreasedLife1", seededRandom(9));
            const sanctified = engine.validateItem({
                ...item,
                sanctified: true,
                mods: [{ ...mod, sanctification: catalog.crafting.sanctification!.max }],
            });
            const edited = setCraftingFlag(engine, sanctified, "sanctified", false);
            expect(edited.mods).toEqual([mod]);
            expect(edited.sanctified).toBeUndefined();
            expect(sanctified.mods[0]!.sanctification).toBe(catalog.crafting.sanctification!.max);
            expect(() =>
                setCraftingFlag(engine, { ...item, rarity: "normal" }, "sanctified", true),
            ).toThrow("rare");
        });

        it("clears jewel corruption multipliers without rerolling", () => {
            const jewelId = Object.entries(catalog.bases).find(
                ([, base]) => base.item_class === "Jewel",
            )![0];
            const jewel = engine.validateItem({ ...engine.createItem(jewelId), rarity: "rare" });
            const mod = engine.rollMod(engine.pool(jewel)[0]!.id, seededRandom(8));
            const corrupted = engine.validateItem({
                ...jewel,
                corrupted: true,
                mods: [{ ...mod, corruptionScale: 110 }],
            });
            const edited = setCraftingFlag(engine, corrupted, "corrupted", false);
            expect(edited.mods).toEqual([mod]);
            expect(corrupted.mods[0]!.corruptionScale).toBe(110);
        });
    }
}
