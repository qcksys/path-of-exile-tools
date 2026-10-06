import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { availableOmens } from "../app/lib/crafting-omens";
import {
    availableQualityInfusers,
    catalystLimit,
    qualityInfuserState,
    retainedCatalystLimit,
} from "../app/lib/crafting-quality";
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
const armour = catalog.crafting.qualityInfusers.find((entry) =>
    entry.itemClasses.includes("Body Armour"),
)!;
const jewellery = catalog.crafting.qualityInfusers.find(
    (entry) => entry.qualityType === "catalyst",
)!;
const method = { kind: "currency" as const, id: armour.id };
const base = (itemClass: string) =>
    Object.keys(catalog.bases).find(
        (id) => catalog.bases[id]!.item_class === itemClass && !catalog.bases[id]!.corrupted,
    )!;
const blank = (quality = 20) => ({ ...engine.createItem(base("Body Armour")), quality });
const catalyst = catalog.crafting.catalysts.find((entry) => entry.tags.includes("life"))!;
function force(increment: number, corrupted: boolean) {
    const random = seededRandom(42);
    vi.spyOn(random, "pick")
        .mockImplementationOnce(
            (choices) => choices.find((entry) => entry.value === increment)!.value,
        )
        .mockImplementationOnce(
            (choices) => choices.find((entry) => entry.value === corrupted)!.value,
        );
    return random;
}

describe("PoE 2 quality Infusers", () => {
    it("supports all four extracted currencies on every available eligible class", () => {
        expect(catalog.crafting.qualityInfusers).toHaveLength(4);
        for (const recipe of catalog.crafting.qualityInfusers) {
            const currency = catalog.crafting.currencies.find((entry) => entry.id === recipe.id)!;
            expect(engine.currencySupported(currency.action)).toBe(true);
            expect(availableOmens(catalog, { kind: "currency", id: recipe.id })).toEqual([]);
            for (const itemClass of recipe.itemClasses) {
                const id = base(itemClass);
                if (!id) continue;
                const item = { ...engine.createItem(id), level: 84 };
                if (recipe.qualityType === "catalyst")
                    item.catalyst = { id: catalyst.id, quality: catalystLimit(catalog, item) };
                else item.quality = 20;
                const starting = qualityInfuserState(catalog, item, recipe.id)!;
                const result = engine.apply(
                    item,
                    { kind: "currency", id: recipe.id },
                    seededRandom(1),
                );
                expect(qualityInfuserState(catalog, result.item, recipe.id)!.quality).toBe(
                    starting.quality + 2,
                );
                expect(result.item.corrupted).toBe(false);
                expect(result.item.mods).toEqual(item.mods);
                expect(result.item.implicits).toEqual(item.implicits);
                expect(result.cost).toMatchObject([{ id: recipe.id, amount: 1 }]);
            }
        }
    });

    it.each([
        "normal",
        "magic",
        "rare",
    ] as const)("uses the item-level increment and caps low-level %s items without corruption on their first use", (rarity) => {
        const item = { ...blank(), level: 1, rarity };
        expect(engine.apply(item, method, seededRandom(1)).item).toEqual({ ...item, quality: 30 });
        expect(
            calculateExact(
                engine,
                blank(),
                method,
                engine.validateTarget({ groups: [], quality: { min: 22, max: 22 } }),
            ).probability,
        ).toBeCloseTo(0.2);
    });

    it("rolls corruption using starting excess quality and preserves modifiers, sockets and rarity", () => {
        let item = engine.addStartingMod(
            blank(29),
            engine.pool({ ...blank(), rarity: "rare" })[0]!.id,
            seededRandom(1),
        );
        item = { ...item, sockets: 2 };
        const random = force(2, true);
        expect(engine.apply(item, method, random).item).toEqual({
            ...item,
            quality: 30,
            corrupted: true,
        });
        expect(vi.mocked(random.pick).mock.calls[1]![0]).toEqual([
            { value: false, weight: 55 },
            { value: true, weight: 45 },
        ]);
        for (const [corrupted, probability] of [
            [false, 0.55],
            [true, 0.45],
        ] as const) {
            const target = engine.validateTarget({
                groups: [],
                quality: { min: 30, max: 30 },
                corrupted,
            });
            expect(hasCraftingRequirements(engine.validateTarget({ groups: [], corrupted }))).toBe(
                true,
            );
            expect(calculateExact(engine, item, method, target).probability).toBeCloseTo(
                probability,
            );
        }
    });

    it("preserves catalyst identity, raises matching stat effects and retains Infuser quality in item text", () => {
        let item: CraftingItem = engine.addStartingMod(
            engine.createItem(base("Ring")),
            "IncreasedLife1",
            seededRandom(1),
        );
        item = { ...item, catalyst: { id: catalyst.id, quality: 29 } };
        const result = engine.apply(
            item,
            { kind: "currency", id: jewellery.id },
            force(2, true),
        ).item;
        expect(result).toEqual({
            ...item,
            catalyst: { id: catalyst.id, quality: 30 },
            corrupted: true,
        });
        expect(result.mods).toEqual(item.mods);
        const text = exportCraftingItemText(engine, result);
        expect(
            importCraftingItemText(engine, text).some(
                (entry) => JSON.stringify(entry.item) === JSON.stringify(result),
            ),
        ).toBe(true);
        const plain = engine.apply(blank(29), method, force(1, true)).item;
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, plain)).some(
                (entry) => JSON.stringify(entry.item) === JSON.stringify(plain),
            ),
        ).toBe(true);
    });

    it("honours Breach maximum quality and retains infused quality after its modifiers are removed", () => {
        const item = engine.addStartingMod(
            engine.createItem("Metadata/Items/Rings/FourRingBreach2"),
            "EssenceBreach",
            seededRandom(1),
            "essence",
        );
        item.catalyst = { id: catalyst.id, quality: 65 };
        const craft = { kind: "currency" as const, id: jewellery.id };
        expect(qualityInfuserState(catalog, item, craft.id)).toMatchObject({
            maximum: 65,
            limit: 75,
            corruptionChance: 0,
        });
        expect(() =>
            engine.apply(
                { ...item, catalyst: { id: catalyst.id, quality: 64 } },
                craft,
                seededRandom(1),
            ),
        ).toThrow("at least 65%");
        item.catalyst.quality = 74;
        const result = engine.apply(item, craft, force(2, false)).item;
        expect(result.catalyst?.quality).toBe(75);
        const retained = { ...result, mods: [] };
        expect(engine.validateItem(retained)).toEqual(retained);
        expect(catalystLimit(catalog, retained)).toBe(45);
        expect(() => engine.apply(retained, craft, seededRandom(1))).toThrow(
            "maximum quality of 55%",
        );
        const implicit = engine.corruptedModifiers(retained)[0]!.id;
        const corrupted = engine.addStartingMod(retained, implicit, seededRandom(1));
        expect(catalystLimit(catalog, corrupted)).toBe(20);
        expect(retainedCatalystLimit(catalog, corrupted)).toBe(75);
        expect(corrupted.catalyst?.quality).toBe(75);
        expect(engine.validateItem(JSON.parse(JSON.stringify(corrupted)))).toEqual(corrupted);
        expect(() =>
            engine.validateItem({ ...corrupted, catalyst: { id: catalyst.id, quality: 76 } }),
        ).toThrow("maximum quality");
    });

    it("routes corruption failures without attempting another Infuser and calculates process costs", () => {
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item: blank(28),
            method,
            target: { groups: [], quality: { min: 30, max: 30 }, corrupted: false },
            steps: [
                {
                    id: "infuse",
                    method,
                    condition: { groups: [], quality: { min: 30, max: 30 }, corrupted: false },
                    onSuccess: "success",
                    onFailure: "check",
                },
                {
                    id: "check",
                    condition: { groups: [], corrupted: true },
                    onSuccess: "failure",
                    onFailure: "infuse",
                },
            ],
            useProcess: true,
            prices: { [method.id]: 7 },
            seed: 42,
            iterations: 1000,
            maxActions: 4,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact).toMatchObject({
            probability: expect.closeTo(0.384),
            meanCost: expect.closeTo(10.36),
            errors: {},
            timeouts: 0,
        });
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let index = 0; index < project.iterations; index++) simulation.runTrial();
        const result = simulation.result();
        expect(result.errors).toEqual({});
        expect(result.timeouts).toBe(0);
        expect(Math.abs(result.probability - exact.probability)).toBeLessThan(0.04);
        expect(result.meanCost).toBeCloseTo(exact.meanCost!, 0);
        expect(result.spending[method.id]).toBe(result.totalActions);
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    });

    it("rejects invalid classes, insufficient quality, capped items, corruption, mirroring and omens before randomness", () => {
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        for (const item of [
            blank(19),
            blank(30),
            { ...blank(), corrupted: true },
            { ...blank(), mirrored: true },
            { ...engine.createItem(base("Wand")), quality: 20 },
        ])
            expect(() => engine.apply(item, method, random)).toThrow();
        const omen = catalog.crafting.currencies.find(
            (entry) => entry.name === "Omen of Corruption",
        )!;
        expect(() => engine.apply(blank(), { ...method, omens: [omen.id] }, random)).toThrow();
        expect(() =>
            engine.apply(
                engine.createItem(base("Ring")),
                { kind: "currency", id: jewellery.id },
                random,
            ),
        ).toThrow("at least");
        expect(
            availableQualityInfusers(catalog, engine.createItem(catalog.crafting.waystones[0]!.id)),
        ).toEqual([]);
        expect(pick).not.toHaveBeenCalled();
        const poe1 = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe1.json", "utf8")),
        );
        expect(poe1.crafting.qualityInfusers).toEqual([]);
        expect(new CraftingEngine(poe1).currencySupported("incursion_armour_quality")).toBe(false);
    });
});
