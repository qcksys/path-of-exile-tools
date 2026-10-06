import { describe, expect, it, vi } from "vite-plus/test";
import { seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { type CraftingMethod, craftingProjectSchema } from "../app/schemas/crafting";
import { catalog, currency, engine } from "./crafting-fixtures";

const baseId = "Metadata/Items/Amulets/AmuletE1";
const allInfluences = [0, 1, 2, 3, 4, 5];
const prepared = () => engine.validateItem({ ...engine.createItem(baseId), rarity: "rare" });

describe("innate influences from extracted implicits", () => {
    it("uses all six class tags and their extracted weights without assigning editable influences", () => {
        const item = prepared();
        expect(item.influences).toEqual([]);
        expect(engine.effectiveInfluences(item)).toEqual(allInfluences);
        const pool = engine.pool(item, { influence: "any" });
        expect(
            new Set(pool.map((entry) => catalog.crafting.modRules[entry.id]!.influence)),
        ).toEqual(new Set(allInfluences));
        const tags = new Set([
            ...engine.base(item).tags,
            ...catalog.crafting.influences
                .filter((rule) => rule.itemClass === "Amulet")
                .map((rule) => rule.tag),
        ]);
        for (const entry of pool) {
            expect(entry.weight).toBe(
                ((entry.mod.spawn_weights.find((rule) => tags.has(rule.tag))?.weight ?? 0) *
                    (entry.mod.generation_weights.find((rule) => tags.has(rule.tag))?.weight ??
                        100)) /
                    100,
            );
        }
        for (const influence of allInfluences) {
            const selected = engine.pool(item, { influence })[0]!;
            const result = engine.addStartingMod(item, selected.id, seededRandom(1));
            expect(result.mods[0]!.id).toBe(selected.id);
            expect(result.influences).toEqual([]);
            expect(engine.pool(result).some((entry) => entry.id === selected.id)).toBe(false);
        }
        const ordinary = engine.createItem("Metadata/Items/Amulets/Amulet1");
        expect(engine.effectiveInfluences(ordinary)).toEqual([]);
        expect(engine.pool({ ...ordinary, rarity: "rare" }, { influence: "any" })).toEqual([]);
    });

    it("accepts compatible modifiers from more than two influences and preserves them in item text", () => {
        let item = prepared();
        for (const influence of [0, 2, 4]) {
            const next = engine.pool(item, { influence })[0]!;
            item = engine.addStartingMod(item, next.id, seededRandom(1));
        }
        expect(
            new Set(item.mods.map((entry) => catalog.crafting.modRules[entry.id]!.influence)).size,
        ).toBe(3);
        const text = exportCraftingItemText(engine, item);
        expect(text).toContain("Has Elder, Shaper and all Conqueror Influences");
        expect(text).not.toContain("Shaper Item");
        expect(
            importCraftingItemText(engine, text).some(
                (entry) => JSON.stringify(entry.item) === JSON.stringify(item),
            ),
        ).toBe(true);
        expect(() => engine.validateItem({ ...item, influences: [0] })).toThrow("fixed influences");
        expect(() => engine.validateItem({ ...item, influences: allInfluences })).toThrow();
        expect(() => engine.validateItem({ ...item, implicits: [] })).toThrow();
        expect(() =>
            engine.validateItem({
                ...item,
                mods: [{ ...item.mods[0]!, fractured: true }],
            }),
        ).toThrow("cannot be fractured");
    });

    it("guarantees an influenced Harvest modifier from the combined pool and preserves fixed implicits", () => {
        const item = prepared();
        const random = seededRandom(42);
        const pick = vi.spyOn(random, "pick");
        const method = { kind: "harvest" as const, id: "BossInfluence1" };
        const result = engine.apply(item, method, random);
        expect(pick.mock.calls[1]![0]).toEqual(
            engine
                .pool(item, { influence: "any" })
                .map((entry) => ({ value: entry.id, weight: entry.weight })),
        );
        expect(
            result.item.mods.some(
                (entry) => catalog.crafting.modRules[entry.id]?.influence != null,
            ),
        ).toBe(true);
        expect(result.item.implicits).toEqual(item.implicits);
        expect(result.item.influences).toEqual([]);
        expect(engine.effectiveInfluences(result.item)).toEqual(allInfluences);
        expect(result.cost).toEqual(engine.costs(method));
    });

    it("rejects influence changes, non-influenced-only crafts and implicit rerolls before randomness", () => {
        let item = prepared();
        while (item.mods.length < 4)
            item = engine.addStartingMod(item, engine.pool(item)[0]!.id, seededRandom(1));
        const before = structuredClone(item);
        const augment = catalog.crafting.harvest.find(
            (recipe) =>
                recipe.command === "remove_type_and_add_type_mod" &&
                /^ANY FOR ([a-z_]+) noinfluence$/.test(recipe.parameters),
        )!;
        const methods: CraftingMethod[] = [
            currency("fracture_random_mod"),
            currency("add_influence_mod_to_rare"),
            currency("reroll_implicit_mod"),
            { kind: "harvest", id: "RerollInfluenceType" },
            { kind: "harvest", id: augment.id },
        ];
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        const integer = vi.spyOn(random, "integer");
        for (const method of methods) expect(() => engine.apply(item, method, random)).toThrow();
        expect(pick).not.toHaveBeenCalled();
        expect(integer).not.toHaveBeenCalled();
        expect(item).toEqual(before);
        const ordinary = engine.validateItem({
            ...engine.createItem("Metadata/Items/Amulets/Amulet1"),
            influences: [0],
        });
        const awakener = currency("transfer_item_influence");
        if (awakener.kind !== "currency") throw new Error("Missing Awakener fixture.");
        for (const [target, donor] of [
            [item, ordinary],
            [ordinary, item],
        ] as const)
            expect(() =>
                engine.apply(
                    target,
                    {
                        ...awakener,
                        donor: { id: "donor", name: "Donor", item: donor },
                    },
                    random,
                ),
            ).toThrow("one influence each");
        expect(pick).not.toHaveBeenCalled();
    });

    it("retains innate influences through ordinary crafts and imprint restoration", () => {
        const normal = engine.createItem(baseId);
        let item = engine.apply(normal, currency("transmute_to_magic"), seededRandom(1)).item;
        const snapshot = structuredClone(item);
        item = engine.apply(
            item,
            { kind: "beast", id: "EinharMasterCraft27" },
            seededRandom(1),
        ).item;
        item = engine.apply(item, currency("upgrade_magic_to_rare"), seededRandom(1)).item;
        item = engine.apply(item, currency("restore_imprint"), seededRandom(1)).item;
        expect(item).toEqual(snapshot);
        expect(engine.effectiveInfluences(item)).toEqual(allInfluences);
        item = engine.apply(item, currency("convert_to_normal"), seededRandom(1)).item;
        expect(item.rarity).toBe("normal");
        expect(item.implicits).toEqual(normal.implicits);
        expect(engine.effectiveInfluences(item)).toEqual(allInfluences);
    });

    it("matches six-influence targets in exact, conditional and sampled calculations and saved projects", () => {
        const item = engine.addStartingMod(prepared(), "IncreasedLife1", seededRandom(1));
        const target = engine.validateTarget({
            groups: [],
            influences: allInfluences,
            stats: [{ id: "base_maximum_life", scope: "explicit", min: 24 }],
        });
        const method = currency("reroll_mod_values");
        const cost = engine.costs(method)[0]!;
        expect(calculateExact(engine, item, method, target).probability).toBeCloseTo(1 / 15);
        const ordinary = engine.validateItem({
            ...engine.createItem("Metadata/Items/Amulets/Amulet1"),
            rarity: "rare",
            influences: [0, 1],
            mods: [{ ...item.mods[0]!, values: [24] }],
        });
        expect(engine.matches(ordinary, target)).toBe(false);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method,
            target,
            steps: [{ id: "divine", method, condition: target, onFailure: "divine" }],
            useProcess: true,
            prices: { [cost.id]: 2 },
            seed: 42,
            iterations: 1000,
            maxActions: 2,
        });
        const result = calculateProcessExact(engine, project);
        expect(result.probability).toBeCloseTo(29 / 225);
        expect(result.meanCost).toBeCloseTo(58 / 15);
        expect(result.errors).toEqual({});
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let trial = 0; trial < project.iterations; trial++) simulation.runTrial();
        expect(simulation.result().probability).toBeCloseTo(29 / 225, 1);
        expect(simulation.result().errors).toEqual({});
        expect(
            simulation
                .result()
                .samples.every((sample) => engine.effectiveInfluences(sample.item).length === 6),
        ).toBe(true);
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    });
});
