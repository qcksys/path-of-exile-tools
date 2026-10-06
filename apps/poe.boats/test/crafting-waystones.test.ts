import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { availableOmens, omenEffects } from "../app/lib/crafting-omens";
import { CraftingSimulation, calculateExact } from "../app/lib/crafting-simulation";
import {
    type CraftingItem,
    craftingCatalogSchema,
    craftingProjectSchema,
    craftingTargetSchema,
} from "../app/schemas/crafting";

const catalog = craftingCatalogSchema.parse(
    JSON.parse(
        readFileSync(new URL("../public/game-data/crafting-poe2.json", import.meta.url), "utf8"),
    ),
);
const engine = new CraftingEngine(catalog);
const base = Object.entries(catalog.bases).find(
    ([, value]) => value.name === "Waystone (Tier 15)",
)![0];
const chaos = {
    kind: "currency" as const,
    id: catalog.crafting.currencies.find((entry) => entry.action === "reroll")!.id,
};
const cases = [
    { name: "Omen of Chaotic Rarity", tag: "map_item_rarity", maximum: 6 },
    { name: "Omen of Chaotic Quantity", tag: "map_pack_size", maximum: 6 },
    { name: "Omen of Chaotic Monsters", tag: "map_monster_rarity", maximum: 5 },
    { name: "Omen of Chaotic Effectiveness", tag: "map_monster_potency", maximum: 6 },
].map((entry) => ({
    ...entry,
    id: catalog.crafting.currencies.find((value) => value.name === entry.name)!.id,
}));

function waystone(count = 6): CraftingItem {
    let item: CraftingItem = { ...engine.createItem(base), rarity: "rare" };
    for (let index = 0; index < count; index++)
        item = engine.addStartingMod(item, engine.pool(item)[0]!.id, seededRandom(index));
    return item;
}

describe("PoE 2 Waystone reroll omens", () => {
    it.each(cases)("$name excludes its extracted reward tag and replaces every mutable modifier", ({
        id,
        tag,
    }) => {
        const item = waystone();
        const before = structuredClone(item);
        expect(catalog.crafting.currencies.find((entry) => entry.id === id)!.description).toContain(
            "do not grant",
        );
        expect(
            engine
                .pool({ ...item, mods: [] })
                .some((entry) => entry.mod.implicit_tags.includes(tag)),
        ).toBe(true);
        const method = { ...chaos, omens: [id] };
        for (let seed = 0; seed < 10; seed++) {
            const random = seededRandom(seed);
            const pick = vi.spyOn(random, "pick");
            const result = engine.apply(item, method, random);
            expect(result.item.mods).toHaveLength(6);
            expect(pick).toHaveBeenCalledTimes(6);
            expect(
                result.item.mods.every(
                    (entry) => !engine.mod(entry.id).implicit_tags.includes(tag),
                ),
            ).toBe(true);
            expect(result.cost.map((entry) => [entry.id, entry.amount])).toEqual([
                [chaos.id, 1],
                [id, 1],
            ]);
            expect(result.item.baseId).toBe(item.baseId);
            expect(result.item.level).toBe(item.level);
        }
        expect(item).toEqual(before);
    });

    it.each(cases)("combines three exclusions to leave $tag and respects available affix groups", ({
        id,
        tag,
        maximum,
    }) => {
        const method = {
            ...chaos,
            omens: cases.filter((entry) => entry.id !== id).map((entry) => entry.id),
        };
        expect(omenEffects(catalog, method).excludedWaystoneTags).toHaveLength(3);
        for (let seed = 0; seed < 10; seed++) {
            const result = engine.apply(waystone(), method, seededRandom(seed)).item;
            expect(result.mods).toHaveLength(maximum);
            expect(
                result.mods.every((entry) => engine.mod(entry.id).implicit_tags.includes(tag)),
            ).toBe(true);
            expect(engine.counts(result).prefixes).toBeLessThanOrEqual(3);
            expect(engine.counts(result).suffixes).toBeLessThanOrEqual(3);
        }
    });

    it.each([
        1, 3, 4, 5,
    ])("replaces %i starting modifiers without adding extra modifiers", (count) => {
        const result = engine.apply(
            waystone(count),
            { ...chaos, omens: [cases[0]!.id] },
            seededRandom(1),
        ).item;
        expect(result.mods).toHaveLength(count);
    });

    it("retains fractures and clears replaced unrevealed modifiers", () => {
        const item = waystone();
        const kept = item.mods.find((entry) =>
            engine.mod(entry.id).implicit_tags.includes(cases[0]!.tag),
        )!;
        kept.fractured = true;
        const method = { ...chaos, omens: [cases[0]!.id] };
        const result = engine.apply(item, method, seededRandom(8)).item;
        expect(result.mods).toHaveLength(6);
        expect(result.mods[0]).toEqual(kept);
        expect(
            result.mods
                .slice(1)
                .every((entry) => !engine.mod(entry.id).implicit_tags.includes(cases[0]!.tag)),
        ).toBe(true);
        const bone = catalog.crafting.desecration.find((entry) =>
            entry.itemClasses.includes("Map"),
        )!;
        const hidden = engine.apply(
            waystone(5),
            { kind: "currency", id: bone.id },
            seededRandom(2),
        ).item;
        expect(hidden.reveal).toBeDefined();
        const replaced = engine.apply(hidden, method, seededRandom(3)).item;
        expect(replaced.reveal).toBeUndefined();
        expect(replaced.mods).toHaveLength(6);
        expect(replaced.mods.every((entry) => engine.mod(entry.id).domain === "area")).toBe(true);
    });

    it("keeps ordinary Chaos behavior and pool caches independent of exclusions", () => {
        const item = waystone();
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        const ordinary = engine.apply(item, chaos, random).item;
        expect(pick).toHaveBeenCalledTimes(2);
        expect(
            ordinary.mods.filter((entry) => item.mods.some((old) => old.id === entry.id)).length,
        ).toBeGreaterThanOrEqual(5);
        const empty = { ...item, mods: [] };
        const pool = engine.pool(empty);
        const filtered = engine.pool(empty, { excludedTags: [cases[0]!.tag] });
        expect(filtered.length).toBeLessThan(pool.length);
        expect(filtered.every((entry) => !entry.mod.implicit_tags.includes(cases[0]!.tag))).toBe(
            true,
        );
        expect(engine.pool(empty)).toEqual(pool);
    });

    it("applies tiered currency floors to every replacement", () => {
        const perfect = catalog.crafting.tieredCurrency.find(
            (entry) =>
                entry.tier === 3 &&
                catalog.crafting.currencies.some(
                    (currency) => currency.id === entry.id && currency.action === "reroll",
                ),
        )!;
        const item = waystone();
        const method = { ...chaos, id: perfect.id, omens: [cases[0]!.id] };
        const allowed = engine.pool(
            { ...item, mods: [] },
            { excludedTags: [cases[0]!.tag], minimumLevel: perfect.minimumModLevel },
        );
        const result = engine.apply(item, method, seededRandom(2)).item;
        expect(
            result.mods.every((entry) => allowed.some((candidate) => candidate.id === entry.id)),
        ).toBe(true);
    });

    it("rejects invalid bases, states and omen combinations before randomness", () => {
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        const method = { ...chaos, omens: [cases[0]!.id] };
        const armour = Object.entries(catalog.bases).find(
            ([, value]) => value.item_class === "Body Armour",
        )![0];
        expect(
            availableOmens(catalog, chaos, "Map").filter((entry) =>
                cases.some((value) => value.id === entry.id),
            ),
        ).toHaveLength(4);
        expect(
            availableOmens(catalog, chaos, "Body Armour").some((entry) =>
                cases.some((value) => value.id === entry.id),
            ),
        ).toBe(false);
        expect(() =>
            engine.apply({ ...engine.createItem(armour), rarity: "rare" }, method, random),
        ).toThrow("require a Waystone");
        expect(() => engine.apply(waystone(0), method, random)).toThrow("no modifiers");
        expect(() => engine.apply({ ...waystone(), corrupted: true }, method, random)).toThrow(
            "uncorrupted",
        );
        expect(() => engine.apply(engine.createItem(base), method, random)).toThrow("rare");
        expect(() =>
            engine.apply(waystone(), { ...chaos, omens: cases.map((entry) => entry.id) }, random),
        ).toThrow("At most three");
        const whittling = catalog.crafting.currencies.find(
            (entry) => entry.name === "Omen of Whittling",
        )!.id;
        expect(() =>
            engine.apply(waystone(), { ...chaos, omens: [cases[0]!.id, whittling] }, random),
        ).toThrow("not supported");
        expect(() =>
            engine.apply(waystone(), { ...chaos, omens: [cases[0]!.id, cases[0]!.id] }, random),
        ).toThrow("only be used once");
        expect(pick).not.toHaveBeenCalled();
    });

    it("calculates excluded targets as impossible and charges all omens in process simulations", () => {
        const item = waystone(1);
        const method = { ...chaos, omens: cases.slice(1).map((entry) => entry.id) };
        const allowed = engine
            .pool({ ...item, mods: [] })
            .filter((entry) => entry.mod.implicit_tags.includes(cases[0]!.tag));
        const target = craftingTargetSchema.parse({
            groups: [{ mods: allowed.map((entry) => entry.id) }],
        });
        expect(calculateExact(engine, item, method, target).probability).toBeCloseTo(1);
        expect(
            calculateExact(
                engine,
                item,
                method,
                craftingTargetSchema.parse({ groups: [{ mods: [item.mods[0]!.id] }] }),
            ).probability,
        ).toBe(0);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: catalog.game,
            patch: catalog.patch,
            item,
            method,
            target,
            steps: [{ id: "reroll", method, condition: target }],
            prices: Object.fromEntries([method.id, ...method.omens].map((id) => [id, 2])),
            seed: 1,
            iterations: 10,
            maxActions: 1,
        });
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let index = 0; index < 10; index++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            successes: 10,
            totalActions: 10,
            meanCost: 8,
            errors: {},
            spending: Object.fromEntries([method.id, ...method.omens].map((id) => [id, 10])),
        });
    });
});
