import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { baseDefenceEntries } from "../app/lib/crafting-defences";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingProcess,
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    validateProject,
} from "../app/lib/crafting-simulation";
import { initialSockets } from "../app/lib/crafting-sockets";
import { strongboxMethod } from "../app/lib/crafting-strongboxes";
import {
    type CraftingItem,
    type CraftingMethod,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";

const generate = (id: CraftingItem["rarity"]): CraftingMethod => ({ kind: "generate", id });

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
    const blank = () => engine.createItem(baseId, 86);
    const project = () =>
        craftingProjectSchema.parse({
            format: 1,
            game,
            patch: catalog.patch,
            item: blank(),
            method: generate("normal"),
            target: { groups: [], rarity: "rare" },
            useProcess: true,
            steps: [
                {
                    id: "fresh",
                    method: generate("normal"),
                    condition: { groups: [], rarity: "rare" },
                    onFailure: "fresh",
                },
            ],
            prices: { "generated:normal": 2 },
            baseCost: 10,
            seed: 42,
            iterations: 100,
            maxActions: 3,
        });

    describe(`${game} fresh item generation`, () => {
        it.each([
            "normal",
            "magic",
            "rare",
        ] as const)("generates %s items using the ordinary extracted pool and currency count model", (rarity) => {
            const currency = catalog.crafting.currencies.find(
                (entry) =>
                    entry.action ===
                    (rarity === "magic" ? "transmute_to_magic" : "transmute_to_rare"),
            )!;
            for (let seed = 0; seed < 20; seed++) {
                const random = seededRandom(seed);
                const fresh = engine.apply(blank(), generate("normal"), random).item;
                const expected =
                    rarity === "normal"
                        ? fresh
                        : engine.apply(fresh, { kind: "currency", id: currency.id }, random).item;
                const result = engine.apply(blank(), generate(rarity), seededRandom(seed));
                expect(result.item).toEqual(expected);
                expect(result.item.rarity).toBe(rarity);
                expect(result.item.mods.length).toBeGreaterThanOrEqual(
                    rarity === "normal" ? 0 : rarity === "magic" ? 1 : 4,
                );
                expect(result.cost).toEqual([
                    { id: `generated:${rarity}`, name: `Generated ${rarity} item`, amount: 1 },
                ]);
            }
        });

        it("replaces protected and destroyed states without retaining rolls or mutating the input", () => {
            const starting = engine.addStartingMod(blank(), "IncreasedLife1", seededRandom(1));
            const changed = {
                ...starting,
                rarity: "rare" as const,
                mods: starting.mods.map((entry) => ({ ...entry, fractured: true })),
                quality: 20,
                sockets: 2,
                corrupted: true,
                mirrored: true,
                ...(game === "poe1" ? { memoryStrands: 100 } : { sanctified: true as const }),
            };
            const destroyed = engine.validateItem({
                ...blank(),
                corrupted: true,
                destroyed: true,
                ...(game === "poe2" ? { twiceCorrupted: true } : {}),
            });
            for (const item of [changed, destroyed]) {
                const before = structuredClone(item);
                const result = engine.apply(item, generate("rare"), seededRandom(42)).item;
                expect(item).toEqual(before);
                expect(result).toEqual(
                    engine.apply(blank(), generate("rare"), seededRandom(42)).item,
                );
                expect(result.mods.every((entry) => !entry.fractured && !entry.crafted)).toBe(true);
                expect(result.sockets ?? 0).toBe(initialSockets(catalog, blank()));
                expect(result.memoryStrands).toBeUndefined();
                expect(result.destroyed).toBeUndefined();
                expect(result.sanctified).toBeUndefined();
            }
        });

        it("discards pending reveal choices and can replace a destroyed item inside a process", () => {
            const rare = engine.apply(blank(), generate("rare"), seededRandom(3)).item;
            const currency = catalog.crafting.currencies.find(
                (entry) =>
                    entry.action ===
                    (game === "poe1" ? "replace_rare_mod_veiled" : "abyssal_bench_ticket_armour"),
            )!;
            const hidden = engine.apply(
                rare,
                { kind: "currency", id: currency.id },
                seededRandom(11),
            ).item;
            const offered = engine.revealChoices(hidden, seededRandom(15));
            expect(offered.reveal?.choices.length).toBeGreaterThan(0);
            const fresh = engine.apply(offered, generate("normal"), seededRandom(1)).item;
            expect(fresh.reveal).toBeUndefined();
            expect(fresh.mods).toEqual([]);
            const input = project();
            input.item = engine.validateItem({
                ...blank(),
                corrupted: true,
                destroyed: true,
                ...(game === "poe2" ? { twiceCorrupted: true } : {}),
            });
            input.target.rarity = "normal";
            input.steps[0]!.condition.rarity = "normal";
            expect(calculateProcessExact(engine, input)).toMatchObject({
                probability: 1,
                totalActions: 1,
                meanCost: 12,
                errors: {},
                spending: { "generated:normal": 1 },
            });
        });

        it("rolls native implicits and base defences within the build's bounds", () => {
            const ringId = Object.entries(catalog.bases).find(
                ([, base]) =>
                    base.item_class === "Ring" &&
                    !base.corrupted &&
                    base.implicits.length === 1 &&
                    catalog.mods[base.implicits[0]!]!.stats.some((stat) => stat.max > stat.min),
            )![0];
            const ring = engine.createItem(ringId);
            const random = seededRandom(2);
            const integer = vi.spyOn(random, "integer").mockImplementation((_min, max) => max);
            const result = engine.apply(ring, generate("normal"), random).item;
            for (const entry of result.implicits) {
                expect(entry.values).toEqual(engine.mod(entry.id).stats.map((stat) => stat.max));
                for (const stat of engine.mod(entry.id).stats)
                    expect(integer).toHaveBeenCalledWith(stat.min, stat.max);
            }
            const defence = baseDefenceEntries(catalog, blank())[0]!;
            const armour = engine.apply(blank(), generate("normal"), random).item;
            expect(armour.baseDefences?.[defence.key]).toBe(defence.range.max);
            expect(integer).toHaveBeenCalledWith(defence.range.min, defence.range.max);
            const exact = calculateExact(
                engine,
                blank(),
                generate("normal"),
                engine.validateTarget({
                    groups: [],
                    baseDefences: {
                        [defence.key]: { min: defence.range.max, max: defence.range.max },
                    },
                }),
            );
            expect(exact.probability).toBeCloseTo(1 / (defence.range.max - defence.range.min + 1));
        });

        it("charges each replacement in exact and sampled processes without reusing the starting price", () => {
            const input = project();
            const exact = calculateProcessExact(engine, input);
            expect(exact).toMatchObject({
                probability: 0,
                timeouts: 1,
                totalActions: 3,
                spending: { "generated:normal": 3 },
                baseItems: 1,
                baseSpending: 10,
                meanCost: 16,
                unpriced: [],
            });
            const simulation = new CraftingSimulation(catalog, input);
            for (let trial = 0; trial < 100; trial++) simulation.runTrial();
            expect(simulation.result()).toMatchObject({
                probability: 0,
                timeouts: 100,
                totalActions: 300,
                spending: { "generated:normal": 300 },
                baseItems: 100,
                baseSpending: 1000,
                meanCost: 16,
                errors: {},
            });
            const process = new CraftingProcess(engine, input, seededRandom(input.seed));
            while (!process.done) process.advance();
            expect(process.result().spending).toEqual({ "generated:normal": 3 });
            expect(process.result().item).toEqual(simulation.result().samples[0]!.item);
            delete input.prices["generated:normal"];
            expect(calculateProcessExact(engine, input)).toMatchObject({
                meanCost: null,
                unpriced: ["generated:normal"],
            });
            input.prices["generated:normal"] = 0;
            expect(calculateProcessExact(engine, input).meanCost).toBe(10);
        });

        it("retains the method, prices and generated item through project and text interchange", () => {
            const input = project();
            input.item = engine.apply(input.item, generate("rare"), seededRandom(7)).item;
            expect(validateProject(catalog, JSON.parse(JSON.stringify(input)))).toEqual(input);
            const text = exportCraftingItemText(engine, input.item);
            const imported = importCraftingItemText(engine, text);
            expect(
                imported.map((entry) => entry.item.mods.map((mod) => mod.id).sort()),
            ).toContainEqual(input.item.mods.map((mod) => mod.id).sort());
            expect(imported.map((entry) => exportCraftingItemText(engine, entry.item))).toContain(
                text,
            );
            expect(() => engine.validateMethod({ kind: "generate", id: "unique" })).toThrow();
            const limited = Object.entries(catalog.bases).find(
                ([, base]) => !base.rarities.includes("rare"),
            )![0];
            const random = seededRandom(1);
            const pick = vi.spyOn(random, "pick");
            const integer = vi.spyOn(random, "integer");
            expect(() =>
                engine.apply(engine.createItem(limited), generate("rare"), random),
            ).toThrow("rarity");
            expect(pick).not.toHaveBeenCalled();
            expect(integer).not.toHaveBeenCalled();
        });

        it("generates ordinary Strongboxes with their native level bounds and modifier domain", () => {
            const id = Object.entries(catalog.bases).find(([, base]) => base.strongbox)![0];
            const starting = engine.createItem(id, 86);
            const result = engine.apply(starting, generate("rare"), seededRandom(42)).item;
            expect(strongboxMethod(catalog, generate("rare"))).toBe(true);
            expect(result.level).toBe(starting.level);
            expect(result.mods.length).toBeGreaterThanOrEqual(4);
            expect(
                result.mods.every(
                    (entry) => engine.mod(entry.id).domain === engine.base(result).domain,
                ),
            ).toBe(true);
        });

        if (game === "poe1") {
            it("clears assigned influences, metamods and imprints but restores native fixed influences", () => {
                const state = engine.validateItem({
                    ...blank(),
                    rarity: "magic",
                    influences: [0],
                    mods: [engine.rollMod("IncreasedLife1", seededRandom(1))],
                });
                const imprinted = engine.apply(
                    state,
                    { kind: "beast", id: "EinharMasterCraft27" },
                    seededRandom(1),
                ).item;
                const lock = catalog.crafting.bench.find(
                    (recipe) =>
                        recipe.mod &&
                        engine
                            .mod(recipe.mod)
                            .stats.some(
                                (stat) => stat.id === "item_generation_cannot_change_prefixes",
                            ) &&
                        recipe.itemClasses.includes(engine.base(state).item_class),
                )!;
                const locked = engine.apply(
                    { ...imprinted, rarity: "rare" },
                    { kind: "bench", id: lock.id },
                    seededRandom(1),
                ).item;
                const fresh = engine.apply(locked, generate("normal"), seededRandom(42)).item;
                expect(fresh.mods).toEqual([]);
                expect(fresh.influences).toEqual([]);
                expect(fresh.imprint).toBeUndefined();
                const fixed = engine.createItem("Metadata/Items/Amulets/AmuletE1");
                const restored = engine.apply(fixed, generate("rare"), seededRandom(1)).item;
                expect(engine.effectiveInfluences(restored)).toEqual([0, 1, 2, 3, 4, 5]);
                const talisman = Object.entries(catalog.bases).find(
                    ([, base]) => base.corrupted,
                )![0];
                expect(
                    engine.apply(engine.createItem(talisman), generate("normal"), seededRandom(1))
                        .item.corrupted,
                ).toBe(true);
            });

            it("generates Grasping Mail with the wiki Breach pool", () => {
                const grasping = engine.createItem(
                    "Metadata/Items/Armours/BodyArmours/BodyStrDexInt2",
                );
                expect(engine.generationRarities(grasping)).toEqual(["normal", "magic", "rare"]);
                expect(engine.apply(grasping, generate("magic"), seededRandom(1)).item.rarity).toBe(
                    "magic",
                );
                const result = engine.apply(grasping, generate("rare"), seededRandom(1)).item;
                expect(result.mods.some((mod) => mod.id.startsWith("BreachBody"))).toBe(true);
                expect(result.mods.length).toBeGreaterThanOrEqual(4);
            });
        } else {
            it("restores native sockets and removes socketed augments", () => {
                const item = engine.createItem("Metadata/Items/Amulets/FourAmuletB2");
                const socketed = engine.apply(
                    item,
                    { kind: "augment", id: "Metadata/Items/SoulCores/SoulCoreBleed" },
                    seededRandom(1),
                ).item;
                const result = engine.apply(socketed, generate("normal"), seededRandom(1)).item;
                expect(result.sockets).toBe(1);
                expect(result.augments).toBeUndefined();
                expect(result.implicits.map((entry) => entry.id)).toEqual(
                    engine.base(item).implicits,
                );
            });
        }
    });
}
