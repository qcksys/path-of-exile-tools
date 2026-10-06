import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { augmentText, availableAugments } from "../app/lib/crafting-augments";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { availableOmens } from "../app/lib/crafting-omens";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
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
const method = (suffix: string) => ({
    kind: "augment" as const,
    id: `Metadata/Items/SoulCores/${suffix}`,
});
const fox = method("TalismanFox");
const rabbit = method("TalismanRabbit");
const runeseeker = method("RuneOlrothsLegacyRuneseekersCall");
const vaal = {
    kind: "currency" as const,
    id: catalog.crafting.currencies.find((entry) => entry.action === "corrupt_item")!.id,
};
function blank(itemClass = "Body Armour"): CraftingItem {
    const base = Object.entries(catalog.bases).find(
        ([, base]) => base.item_class === itemClass && !base.implicits.length,
    )![0];
    return { ...engine.createItem(base), sockets: itemClass === "Body Armour" ? 2 : 1 };
}
const apply = (item: CraftingItem, craft: Parameters<CraftingEngine["apply"]>[1]) =>
    engine.apply(item, craft, seededRandom(42)).item;

describe("PoE 2 augment effect interactions", () => {
    it.each([
        ["SoulCoreSpecial29", "Helmet"],
        ["SoulCoreSpecial30", "Body Armour"],
        ["SoulCoreSpecial31", "Gloves"],
        ["SoulCoreSpecial32", "Boots"],
    ])("uses %s to remove the explicit no-change corruption branch", (suffix, itemClass) => {
        const core = method(suffix!);
        const item = apply(blank(itemClass), core);
        expect(availableAugments(catalog, blank(itemClass)).map((entry) => entry.id)).toContain(
            core.id,
        );
        const random = seededRandom(42);
        const pick = vi.spyOn(random, "pick");
        const result = engine.apply(item, vaal, random);
        expect(pick.mock.calls[0]![0]).toEqual([
            { value: "reroll", weight: 1 },
            { value: "implicit", weight: 1 },
            { value: "socket", weight: 1 },
        ]);
        expect(result.item.corrupted).toBe(true);
        expect(result.item.augments).toEqual([core.id]);
        expect(result.cost.map((entry) => entry.id)).toEqual([vaal.id]);
        expect(() => apply(item, { ...method("RuneFire"), replace: 0 })).toThrow("socket-bound");
        expect(() => apply(blank("Wand"), core)).toThrow("no effect");
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, result.item)).map(
                (match) => match.item,
            ),
        ).toContainEqual(result.item);
    });

    it("does not stack Atziri with Omen of Corruption and calculates the changed socket odds", () => {
        const core = method("SoulCoreSpecial30");
        const item = apply(blank(), core);
        const omen = availableOmens(catalog, vaal).find(
            (entry) => entry.name === "Omen of Corruption",
        )!.id;
        const target = engine.validateTarget({ groups: [], sockets: { min: 3, max: 3 } });
        expect(calculateExact(engine, blank(), vaal, target).probability).toBeCloseTo(1 / 4);
        for (const craft of [vaal, { ...vaal, omens: [omen] }]) {
            expect(calculateExact(engine, item, craft, target).probability).toBeCloseTo(1 / 3);
            const withCore = apply(item, craft);
            expect(withCore).toEqual(apply(item, vaal));
            expect(engine.costs(craft).map((entry) => entry.id)).toEqual(
                craft === vaal ? [vaal.id] : [vaal.id, omen],
            );
        }
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item: blank(),
            method: core,
            target,
            steps: [
                {
                    id: "socket",
                    method: core,
                    onSuccess: "corrupt",
                    onFailure: "corrupt",
                    condition: { groups: [] },
                },
                {
                    id: "corrupt",
                    method: vaal,
                    condition: target,
                    onSuccess: "success",
                    onFailure: "failure",
                },
            ],
            useProcess: true,
            prices: { [core.id]: 5, [vaal.id]: 2 },
            seed: 42,
            iterations: 1000,
            maxActions: 2,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.probability).toBeCloseTo(1 / 3);
        expect(exact.meanCost).toBeCloseTo(7);
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let index = 0; index < 1000; index++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            errors: {},
            totalActions: 2000,
            meanCost: 7,
            spending: { [core.id]: 1000, [vaal.id]: 1000 },
        });
        expect(simulation.result().probability).toBeGreaterThan(0.28);
        expect(simulation.result().probability).toBeLessThan(0.38);
    });

    it("activates Fox Idol's own and other idols' bonded stats in either socketing order", () => {
        for (const order of [
            [fox, rabbit],
            [rabbit, fox],
        ]) {
            const item = order.reduce(apply, blank());
            const totals = engine.statTotals(item);
            expect(totals.get("all_skill_gem_quality_+")).toBe(5);
            expect(totals.get("base_item_found_rarity_+%")).toBe(12);
            expect(totals.get("gold_+%_from_enemies")).toBe(10);
            expect(totals.get("num_socketed_idols")).toBe(2);
            expect(engine.statTotals(item, "explicit").size).toBe(0);
            expect(augmentText(catalog, item, fox.id)).toContain("Bonded: +5%");
            expect(augmentText(catalog, item, rabbit.id)).toContain("Bonded: 10%");
            expect(
                importCraftingItemText(engine, exportCraftingItemText(engine, item)).map(
                    (match) => match.item,
                ),
            ).toContainEqual(item);
            const replaced = apply(item, {
                ...method("RuneFire"),
                replace: item.augments!.indexOf(fox.id),
            });
            expect(engine.statTotals(replaced).get("gold_+%_from_enemies")).toBeUndefined();
            expect(engine.statTotals(replaced).get("all_skill_gem_quality_+")).toBeUndefined();
            expect(engine.statTotals(replaced).get("base_item_found_rarity_+%")).toBe(12);
            expect(augmentText(catalog, replaced, rabbit.id)).not.toContain("Bonded:");
        }
    });

    it("does not grant rune bonded bonuses or activate the Fox Idol effect on a sceptre", () => {
        let item = apply({ ...blank(), sockets: 3, corrupted: true }, fox);
        item = apply(apply(item, rabbit), method("RuneFire"));
        expect(engine.statTotals(item).get("base_fire_damage_resistance_%")).toBe(14);
        expect(engine.statTotals(item).get("base_maximum_life")).toBeUndefined();
        expect(augmentText(catalog, item, method("RuneFire").id)).not.toContain("Bonded:");
        const sceptre = apply(blank("Sceptre"), fox);
        expect(engine.statTotals(sceptre).get("presence_area_+%")).toBe(50);
        expect(engine.statTotals(sceptre).get("minion_skill_area_of_effect_+%")).toBeUndefined();
        expect(augmentText(catalog, sceptre, fox.id)).not.toContain("Bonded:");
        expect(() => apply(apply(blank(), fox), fox)).toThrow("limit of 1");
    });

    it("calculates and simulates a process targeting a bonded stat and retains projects", () => {
        const target = engine.validateTarget({
            groups: [],
            stats: [
                { id: "gold_+%_from_enemies", min: 10 },
                { id: "all_skill_gem_quality_+", min: 5 },
            ],
        });
        expect(calculateExact(engine, apply(blank(), rabbit), fox, target).probability).toBe(1);
        expect(calculateExact(engine, blank(), rabbit, target).probability).toBe(0);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item: blank(),
            method: fox,
            target,
            steps: [
                {
                    id: "fox",
                    method: fox,
                    condition: { groups: [] },
                    onSuccess: "rabbit",
                    onFailure: "rabbit",
                },
                {
                    id: "rabbit",
                    method: rabbit,
                    condition: target,
                    onSuccess: "success",
                    onFailure: "failure",
                },
            ],
            useProcess: true,
            prices: { [fox.id]: 2, [rabbit.id]: 3 },
            seed: 42,
            iterations: 1000,
            maxActions: 2,
        });
        expect(calculateProcessExact(engine, project)).toMatchObject({
            probability: 1,
            meanCost: 5,
        });
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let index = 0; index < 25; index++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            successes: 25,
            totalActions: 50,
            errors: {},
            meanCost: 5,
        });
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    });

    it("scales other runes by Runeseeker's extracted bonus without affecting soul cores or scaling itself", () => {
        const fire = method("RuneFire");
        const cold = method("RuneCold");
        const soul = method("SoulCoreVision");
        let item = apply(
            apply({ ...blank("Wand"), corrupted: true, sockets: 2 }, fire),
            runeseeker,
        );
        expect(catalog.crafting.scalableStats).not.toContain("local_rune_effect_+%");
        expect(engine.statTotals(item).get("local_rune_effect_+%")).toBe(75);
        expect(engine.statTotals(item).get("non_skill_base_all_damage_%_to_gain_as_fire")).toBe(14);
        expect(augmentText(catalog, item, fire.id)).toContain("14%");
        expect(augmentText(catalog, item, runeseeker.id)).toContain("75%");
        const target = engine.validateTarget({
            groups: [],
            stats: [{ id: "non_skill_base_all_damage_%_to_gain_as_fire", min: 14 }],
        });
        expect(
            calculateExact(engine, { ...item, augments: [fire.id] }, runeseeker, target)
                .probability,
        ).toBe(1);
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, item)).map(
                (match) => match.item,
            ),
        ).toContainEqual(item);
        item = apply(item, { ...soul, replace: 0 });
        expect(engine.statTotals(item).get("spell_critical_strike_chance_+%")).toBe(30);
        item = apply(item, { ...cold, replace: 0 });
        expect(engine.statTotals(item).get("non_skill_base_all_damage_%_to_gain_as_cold")).toBe(14);
        item = apply(item, { ...soul, replace: 1 });
        expect(engine.statTotals(item).get("non_skill_base_all_damage_%_to_gain_as_cold")).toBe(8);
        expect(engine.statTotals(item).get("local_rune_effect_+%")).toBeUndefined();
    });
});
