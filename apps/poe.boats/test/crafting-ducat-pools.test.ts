import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { allflameBracket, allflameQuote } from "../app/lib/crafting-allflame";
import { CraftingEngine, type CraftingRandom, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    validateProject,
} from "../app/lib/crafting-simulation";
import {
    type CraftingItem,
    craftingCatalogSchema,
    craftingModSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const cyaxan = "reroll_rare_infamous";
const rotmother = "add_deepwater_hazard_belt_mod";
const brinehook = "add_pantheon_aspect";
const actions = [cyaxan, rotmother, brinehook];
const ducat = (action: string) => ({
    kind: "currency" as const,
    id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
    allflame: true as const,
});
const sulphur = catalog.crafting.allflame!.sulphur;
const belt = "Metadata/Items/Belts/Belt3";
const start = (base = baseId, level = 86): CraftingItem => ({
    ...engine.createItem(base, level),
    rarity: "rare",
    intangibility: 100,
});
const target = (mod: string) => engine.validateTarget({ groups: [{ mods: [mod] }] });
const first: CraftingRandom = {
    pick: (choices) => choices.find((entry) => entry.weight > 0)!.value,
    integer: (min) => min,
};
const project = (item: CraftingItem, action: string, mod: string, patch = {}) =>
    craftingProjectSchema.parse({
        format: 1,
        game: "poe1",
        patch: catalog.patch,
        item,
        method: ducat(action),
        target: target(mod),
        steps: [],
        prices: { [ducat(action).id]: 2, [sulphur]: 0.001 },
        seed: 42,
        iterations: 500,
        maxActions: 1,
        ...patch,
    });

describe("extracted Ducat modifier pools", () => {
    it("exports all build Infamous and Ducat affixes with their original records and keeps ordinary pools isolated", () => {
        const raw = JSON.parse(readFileSync("../../packages/poe-1-data/data/mods.json", "utf8"));
        const records = Object.entries(catalog.mods).filter(([, mod]) =>
            ["mercenary", "ducat_crafted"].includes(mod.domain),
        );
        expect(records).toHaveLength(43);
        expect(records.filter(([, mod]) => mod.domain === "mercenary")).toHaveLength(28);
        for (const [id, mod] of records) {
            expect(mod).toEqual(craftingModSchema.parse({ ...raw[id], text: mod.text }));
            expect(mod.text).toBeTruthy();
        }
        for (const item of [start(), start(belt)]) {
            expect(engine.pool(item).some((entry) => records.some(([id]) => id === entry.id))).toBe(
                false,
            );
            for (const method of [currency("reroll"), currency("add_mod_to_rare")]) {
                const result = engine.apply(item, method, seededRandom(1)).item;
                expect(result.mods.every((entry) => engine.mod(entry.id).domain === "item")).toBe(
                    true,
                );
            }
        }
    });

    it("uses extracted weights, level thresholds, class eligibility and Allflame brackets", () => {
        expect(engine.ducatPool(start(baseId, 67), cyaxan)).toEqual([]);
        const infamous = engine.ducatPool(start(baseId, 68), cyaxan);
        expect(infamous).toHaveLength(4);
        expect(
            infamous.every((entry) => entry.weight === 100 && entry.mod.domain === "mercenary"),
        ).toBe(true);
        expect(engine.ducatPool(start(belt, 1), rotmother).map((entry) => entry.id)).toEqual([
            "DeepwaterHazardModMineCrit",
        ]);
        const hazards = engine.ducatPool(start(belt, 40), rotmother);
        expect(hazards).toHaveLength(11);
        expect(hazards.reduce((sum, entry) => sum + entry.weight, 0)).toBe(4550);
        expect(engine.ducatPool(start(), rotmother)).toEqual([]);
        expect(engine.ducatPool(start(baseId, 19), brinehook)).toEqual([]);
        expect(engine.ducatPool(start(baseId, 20), brinehook)).toHaveLength(4);
        expect(engine.ducatPool(start("Metadata/Items/Jewels/JewelStr"), brinehook)).toEqual([]);
        for (const action of actions) {
            const method = ducat(action);
            expect(engine.validateMethod(method)).toEqual(method);
            expect(() => engine.validateMethod({ ...method, allflame: undefined })).toThrow(
                "requires Allflame",
            );
            expect(allflameBracket(catalog, method)?.outcomes.max).toBe(
                action === brinehook ? 4 : 3,
            );
            expect(
                allflameQuote(catalog, start(action === rotmother ? belt : baseId), method)?.amount,
            ).toBeGreaterThan(0);
        }
    });

    it("rejects rarity, level, class, occupied slots and conflicting Aspects before randomness", () => {
        const invalid: [CraftingItem, string][] = [
            [start(baseId, 67), cyaxan],
            [start(baseId, 19), brinehook],
            [start(), rotmother],
            [{ ...start(), rarity: "normal" }, brinehook],
            [{ ...start(), rarity: "magic" }, cyaxan],
            [{ ...start(belt), rarity: "magic" }, rotmother],
        ];
        let full = start();
        for (const id of ["FireResist1", "ColdResist1", "LightningResist1"])
            full = engine.addStartingMod(full, id, first);
        invalid.push([full, brinehook]);
        const spider = engine.apply(
            start(),
            { kind: "beast", id: "EinharMasterCraftMorrigan3" },
            first,
        ).item;
        invalid.push([spider, brinehook]);
        const hazard = engine.apply(start(belt), ducat(rotmother), first).item;
        invalid.push([hazard, rotmother]);
        for (const [item, action] of invalid) {
            const random = seededRandom(1);
            vi.spyOn(random, "pick");
            vi.spyOn(random, "integer");
            expect(() => engine.prepareAllflame(item, ducat(action), random)).toThrow();
            expect(random.pick).not.toHaveBeenCalled();
            expect(random.integer).not.toHaveBeenCalled();
        }
    });

    it.each([
        rotmother,
        brinehook,
    ])("adds exactly one %s modifier without spending a bench slot or changing existing rolls", (action) => {
        let item = start(action === rotmother ? belt : baseId);
        item = engine.addStartingMod(item, "IncreasedLife1", first);
        item.mods[0]!.fractured = true;
        const bench = catalog.crafting.bench.find(
            (entry) =>
                entry.mod &&
                entry.itemClasses.includes(engine.base(item).item_class) &&
                engine
                    .mod(entry.mod)
                    .stats.some((stat) => stat.id === "base_fire_damage_resistance_%"),
        )!;
        item = engine.apply(item, { kind: "bench", id: bench.id }, first).item;
        const before = structuredClone(item);
        const result = engine.apply(item, ducat(action), first);
        expect(item).toEqual(before);
        expect(result.item.mods.slice(0, 2)).toEqual(item.mods);
        expect(result.item.mods).toHaveLength(3);
        expect(result.item.mods[2]).toMatchObject({ crafted: false, fractured: false });
        expect(result.cost).toEqual(engine.costs(ducat(action), item));
        expect(result.item.implicits).toEqual(item.implicits);
        expect(engine.validateItem(result.item)).toEqual(result.item);
        expect(() => engine.apply(result.item, ducat(action), first)).toThrow(
            "no eligible modifier",
        );
        if (action === brinehook)
            expect(() =>
                engine.apply(
                    result.item,
                    { kind: "beast", id: "EinharMasterCraftMorrigan3" },
                    first,
                ),
            ).toThrow();
    });

    it("reforges Cyaxan copies with one Infamous modifier, ordinary remaining rolls and retained fractures, locks and strands", () => {
        const item = start();
        item.memoryStrands = 82;
        item.mods = [engine.rollMod("IncreasedLife1", first, { fractured: true })];
        item.mods.push(engine.rollMod(engine.pool(item, { side: "prefix" })[0]!.id, first));
        const lock = catalog.crafting.bench.find(
            (entry) =>
                entry.mod &&
                engine
                    .mod(entry.mod)
                    .stats.some((stat) => stat.id === "item_generation_cannot_change_prefixes"),
        )!;
        const locked = engine.apply(item, { kind: "bench", id: lock.id }, first).item;
        const before = structuredClone(locked);
        for (let seed = 0; seed < 30; seed++) {
            const result = engine.apply(locked, ducat(cyaxan), seededRandom(seed)).item;
            expect(result.mods.slice(0, 2)).toEqual(locked.mods.slice(0, 2));
            expect(result.mods.some((entry) => entry.id === lock.mod)).toBe(false);
            expect(
                result.mods.filter((entry) => engine.mod(entry.id).domain === "mercenary"),
            ).toHaveLength(1);
            expect(result.mods.length).toBeGreaterThanOrEqual(4);
            expect(result.mods.length).toBeLessThanOrEqual(6);
            expect(result.memoryStrands).toBe(82);
            expect(result.intangibility).toBe(100);
        }
        expect(locked).toEqual(before);
        const fractured = start();
        while (fractured.mods.length < 6) {
            const mod = engine.pool(fractured)[0]!;
            fractured.mods.push(engine.rollMod(mod.id, first, { fractured: true }));
        }
        expect(engine.apply(fractured, ducat(cyaxan), first).item.mods).toEqual(fractured.mods);
    });

    it("uses exact weighted probabilities and Allflame target-aware selection for Pantheon and hazard modifiers", () => {
        const aspect = "GrantsBrineKingAspectCrafted";
        expect(calculateExact(engine, start(), ducat(brinehook), target(aspect)).probability).toBe(
            0.25,
        );
        expect(() =>
            calculateExact(
                engine,
                { ...start(), intangibility: 0 },
                ducat(brinehook),
                target(aspect),
            ),
        ).toThrow("state limit");
        const aspects = new CraftingSimulation(
            catalog,
            project({ ...start(), intangibility: 0 }, brinehook, aspect),
        );
        for (let i = 0; i < 500; i++) aspects.runTrial();
        expect(aspects.result().probability).toBeCloseTo(1 - 0.75 ** 4, 1);
        expect(aspects.result().errors).toEqual({});
        const hazard = "DeepwaterHazardModDualWieldTrap";
        expect(
            calculateExact(engine, start(belt), ducat(rotmother), target(hazard)).probability,
        ).toBeCloseTo(50 / 4550, 12);
        const trial = project(
            { ...start(belt), intangibility: 0 },
            rotmother,
            "DeepwaterHazardModTrapTriggerRadius",
        );
        const simulation = new CraftingSimulation(catalog, trial);
        for (let i = 0; i < 500; i++) simulation.runTrial();
        const result = simulation.result();
        expect(result.errors).toEqual({});
        expect(result.probability).toBeCloseTo(1 - (1 - 1000 / 4550) ** 3, 1);
        expect(result.spending[ducat(rotmother).id]).toBe(500);
        expect(result.spending[sulphur]).toBe(
            500 * allflameQuote(catalog, trial.item, trial.method)!.amount,
        );
        const process = project(start(), brinehook, aspect, {
            useProcess: true,
            steps: [
                {
                    id: "aspect",
                    method: ducat(brinehook),
                    condition: target(aspect),
                    onSuccess: "success",
                    onFailure: "failure",
                },
            ],
        });
        expect(calculateProcessExact(engine, process).probability).toBe(0.25);
    });

    it("retains Cyaxan's attack/caster blockers for new rolls and guarantees an Infamous modifier on influenced items", () => {
        const helmet = Object.entries(catalog.bases).find(
            ([, base]) => base.item_class === "Helmet",
        )![0];
        const item = start(helmet);
        const blocker = catalog.crafting.bench.find(
            (entry) =>
                entry.mod &&
                engine
                    .mod(entry.mod)
                    .stats.some((stat) => stat.id === "item_generation_cannot_roll_caster_affixes"),
        )!;
        const blocked = engine.apply(item, { kind: "bench", id: blocker.id }, first).item;
        expect(
            engine
                .ducatPool(item, cyaxan)
                .some((entry) => entry.id === "MercenaryModSpellslingerReservation"),
        ).toBe(true);
        expect(
            engine
                .ducatPool(blocked, cyaxan)
                .some((entry) => entry.id === "MercenaryModSpellslingerReservation"),
        ).toBe(false);
        const influenced = start();
        influenced.influences = [
            catalog.crafting.influences.find((entry) => entry.itemClass === "Body Armour")!
                .influence,
        ];
        for (let seed = 0; seed < 20; seed++) {
            const result = engine.apply(blocked, ducat(cyaxan), seededRandom(seed)).item;
            expect(
                result.mods.every(
                    (entry) => !engine.mod(entry.id).implicit_tags.includes("caster"),
                ),
            ).toBe(true);
            const other = engine.apply(influenced, ducat(cyaxan), seededRandom(seed)).item;
            expect(other.influences).toEqual(influenced.influences);
            expect(
                other.mods.filter((entry) => engine.mod(entry.id).domain === "mercenary"),
            ).toHaveLength(1);
        }
    });

    it("adds Pantheon Aspects to magic items and preserves valid modifiers after scouring a fracture", () => {
        const item = { ...start(), rarity: "magic" as const };
        const result = engine.apply(item, ducat(brinehook), first).item;
        expect(result.rarity).toBe("magic");
        expect(result.mods).toHaveLength(1);
        result.mods[0]!.fractured = true;
        const scoured = engine.apply(result, currency("convert_to_normal"), first).item;
        expect(scoured.mods).toEqual(result.mods);
        expect(scoured.rarity).toBe("magic");
    });

    it.each(
        actions,
    )("supports %s starting modifiers, targets and text/JSON while rejecting off-base and low-level states", (action) => {
        const item = start(action === rotmother ? belt : baseId);
        const id = engine.ducatPool(item, action)[0]!.id;
        const added = engine.addStartingMod(item, id, first);
        expect(engine.matches(added, target(id))).toBe(true);
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, added))[0]!.item,
        ).toEqual(added);
        const saved = project(added, action, id);
        expect(validateProject(catalog, JSON.parse(JSON.stringify(saved))).item).toEqual(added);
        const result = engine.apply(item, ducat(action), first).item;
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, result))[0]!.item,
        ).toEqual(result);
        if (engine.mod(id).required_level > 1)
            expect(() =>
                engine.validateItem({ ...added, level: engine.mod(id).required_level - 1 }),
            ).toThrow();
        if (action === rotmother)
            expect(() => engine.addStartingMod(start(), id, first)).toThrow("not available");
    });

    it("does not enable Ducat methods or pools in PoE 2", () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const other = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(([, entry]) =>
            entry.rarities.includes("rare"),
        )![0];
        for (const action of actions) {
            expect(other.ducatPool(other.createItem(base), action)).toEqual([]);
            expect(() => other.validateMethod(ducat(action))).toThrow();
        }
    });
});
