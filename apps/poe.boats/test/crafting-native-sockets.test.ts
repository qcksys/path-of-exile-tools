import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { augmentRule, availableAugments, socketedStats } from "../app/lib/crafting-augments";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import {
    initialSockets,
    retainedSocketLimit,
    socketableItemClass,
    socketLimit,
} from "../app/lib/crafting-sockets";
import {
    type CraftingItem,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";
import { engine as poe1, baseId as poe1Base, catalog as poe1Catalog } from "./crafting-fixtures";

const catalog = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const engine = new CraftingEngine(catalog);
const id = (suffix: string) => `Metadata/Items/SoulCores/${suffix}`;
const bases = [
    {
        name: "Corona Amulet",
        base: "Metadata/Items/Amulets/FourAmuletB2",
        itemClass: "Helmet",
        core: "SoulCoreBleed",
        corruptedSockets: 1,
    },
    {
        name: "Grasping Ring",
        base: "Metadata/Items/Rings/FourRingB6",
        itemClass: "Gloves",
        core: "SoulCoreIgnite",
        corruptedSockets: 1,
    },
    {
        name: "Stalking Belt",
        base: "Metadata/Items/Belts/FourBeltB1",
        itemClass: "Boots",
        core: "SoulCoreShock",
        corruptedSockets: 2,
    },
];
const currency = (action: string) => ({
    kind: "currency" as const,
    id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
});
const vaal = currency("corrupt_item");
const artificer = currency("add_equipment_socket");
const force = (outcome: string) => {
    const random = seededRandom(42);
    vi.spyOn(random, "pick").mockImplementationOnce(
        (choices) => choices.find((entry) => entry.value === outcome)!.value,
    );
    return random;
};

describe("build-extracted native sockets", () => {
    it.each(bases)("creates $name with its native socket and uses $itemClass augment effects", ({
        base,
        itemClass,
        core,
    }) => {
        const item = engine.createItem(base, 1);
        expect(catalog.bases[base]!.initialSockets).toBe(1);
        expect(initialSockets(catalog, item)).toBe(1);
        expect(item.sockets).toBe(1);
        expect(socketLimit(catalog, item)).toBe(1);
        expect(socketableItemClass(catalog, item)).toBe(itemClass);
        const entry = catalog.crafting.augments.find((entry) => entry.id === id(core))!;
        expect(availableAugments(catalog, item)).toContainEqual(entry);
        const rule = augmentRule(catalog, item, entry)!;
        expect(rule.scope).toBe("classes");
        expect(rule.itemClasses).toContain(itemClass);
        const result = engine.apply(item, { kind: "augment", id: entry.id }, seededRandom(1));
        expect(result.item).toEqual({ ...item, augments: [entry.id] });
        expect(result.cost).toEqual([{ id: entry.id, name: entry.name, amount: 1 }]);
        for (const stat of rule.stats)
            expect(socketedStats(catalog, result.item).get(stat.id)).toBe(stat.min);
        const replacement = engine.apply(
            result.item,
            { kind: "augment", id: id("RuneFire"), replace: 0 },
            seededRandom(1),
        ).item;
        expect(replacement.augments).toEqual([id("RuneFire")]);
        expect(engine.statTotals(replacement).get("base_fire_damage_resistance_%")).toBe(14);
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, result.item)).map(
                (entry) => entry.item,
            ),
        ).toContainEqual(result.item);
    });

    it.each(bases)("caps corruption sockets on $name at its extracted inventory area", ({
        base,
        corruptedSockets,
    }) => {
        const item = engine.createItem(base);
        expect(() => engine.apply(item, artificer, seededRandom(1))).toThrow("maximum number");
        const result = engine.apply(item, vaal, force("socket")).item;
        expect(result).toEqual({ ...item, corrupted: true, sockets: corruptedSockets });
        expect(retainedSocketLimit(catalog, result)).toBe(corruptedSockets);
        expect(() => engine.validateItem({ ...result, sockets: corruptedSockets + 1 })).toThrow(
            "Socket count",
        );
        expect(
            calculateExact(
                engine,
                item,
                vaal,
                engine.validateTarget({
                    groups: [],
                    sockets: { min: corruptedSockets + 1, max: 7 },
                }),
            ).probability,
        ).toBe(0);
    });

    it("loads three-socket bases from the initial-count field or their explicit base implicit", () => {
        const special = Object.keys(catalog.bases).filter(
            (baseId) => initialSockets(catalog, { baseId }) === 3,
        );
        expect(special).toHaveLength(6);
        for (const baseId of special) {
            const item = engine.createItem(baseId);
            expect(item.sockets).toBe(3);
            expect(socketLimit(catalog, item)).toBe(3);
            expect(() => engine.apply(item, artificer, seededRandom(1))).toThrow("maximum number");
            expect(engine.apply(item, vaal, force("socket")).item.sockets).toBe(4);
            expect(() => engine.validateItem({ ...item, sockets: 2 })).toThrow("below");
        }
        expect(initialSockets(poe1Catalog, poe1.createItem(poe1Base))).toBe(0);
    });

    it("preserves base socket identity when corruption replaces the virtual-class implicit", () => {
        for (const { base, itemClass, core } of bases) {
            let item = engine.createItem(base);
            item = engine.apply(item, { kind: "augment", id: id(core) }, seededRandom(1)).item;
            const conversion = item.implicits.find((entry) =>
                engine
                    .mod(entry.id)
                    .stats.some((stat) =>
                        stat.id.startsWith("local_item_benefit_socketable_as_if_"),
                    ),
            )!;
            const random = force("implicit");
            vi.mocked(random.pick).mockImplementationOnce(
                (choices) =>
                    choices.find(
                        (entry) =>
                            typeof entry.value === "object" &&
                            entry.value !== null &&
                            "id" in entry.value &&
                            entry.value.id === conversion.id,
                    )!.value,
            );
            const result = engine.apply(item, vaal, random).item;
            expect(result.implicits.some((entry) => entry.id === conversion.id)).toBe(false);
            expect(result.augments).toEqual(item.augments);
            expect(socketableItemClass(catalog, result)).toBe(itemClass);
            expect(socketedStats(catalog, result)).toEqual(socketedStats(catalog, item));
            expect(engine.validateItem(result)).toEqual(result);
            expect(
                importCraftingItemText(engine, exportCraftingItemText(engine, result)).map(
                    (entry) => entry.item,
                ),
            ).toContainEqual(result);
        }
    });

    it("rejects forbidden jewellery augments and socket counts before randomness", () => {
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        const integer = vi.spyOn(random, "integer");
        for (const { base } of bases) {
            const item = engine.createItem(base);
            expect(availableAugments(catalog, item).every((entry) => entry.jewellery)).toBe(true);
            for (const suffix of [
                "AugmentAnoint",
                "RuneWarpingCreateJewelSocket",
                "RuneWarpingMarksmanInfluence",
            ])
                expect(() =>
                    engine.apply(item, { kind: "augment", id: id(suffix) }, random),
                ).toThrow("no effect");
            expect(() => engine.validateItem({ ...item, sockets: 0 })).toThrow("below");
            expect(engine.validateItem({ ...item, sockets: undefined }).sockets).toBe(1);
        }
        const ordinary = engine.createItem("Metadata/Items/Rings/FourRing1");
        expect(ordinary.sockets).toBeUndefined();
        expect(availableAugments(catalog, ordinary)).toEqual([]);
        expect(() => engine.apply(ordinary, artificer, random)).toThrow(
            "cannot have augment sockets",
        );
        expect(pick).not.toHaveBeenCalled();
        expect(integer).not.toHaveBeenCalled();
    });

    it("uses Serle's Triumph on Grasping Ring to calculate and simulate a seventh affix", () => {
        let item: CraftingItem = { ...engine.createItem(bases[1]!.base), rarity: "rare" };
        for (let index = 0; index < 6; index++)
            item = engine.addStartingMod(item, engine.pool(item)[0]!.id, seededRandom(1));
        const method = { kind: "augment" as const, id: id("RuneWarpingAdditionalSuffix") };
        const open = engine.validateTarget({ groups: [], openSuffixes: 1 });
        const target = engine.validateTarget({
            groups: [],
            affixCount: { min: 7, max: 7 },
            suffixCount: { min: 4, max: 4 },
        });
        expect(calculateExact(engine, item, method, open).probability).toBe(1);
        const exalt = currency("add_mod_to_rare");
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item,
            method,
            target,
            steps: [
                { id: "socket", method, condition: open, onSuccess: "exalt", onFailure: "failure" },
                {
                    id: "exalt",
                    method: exalt,
                    condition: target,
                    onSuccess: "success",
                    onFailure: "failure",
                },
            ],
            useProcess: true,
            prices: { [method.id]: 7, [exalt.id]: 2 },
            seed: 42,
            iterations: 100,
            maxActions: 2,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.probability).toBeCloseTo(1);
        expect(exact.meanCost).toBeCloseTo(9);
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let index = 0; index < 25; index++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            successes: 25,
            totalActions: 50,
            meanCost: 9,
            errors: {},
            spending: { [method.id]: 25, [exalt.id]: 25 },
        });
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    });
});
