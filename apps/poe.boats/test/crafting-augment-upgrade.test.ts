import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { augmentRule, augmentText, availableAugments } from "../app/lib/crafting-augments";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
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
import { baseId as poe1Base, engine as poe1Engine } from "./crafting-fixtures";

const catalog = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const engine = new CraftingEngine(catalog);
const id = (suffix: string) => `Metadata/Items/SoulCores/${suffix}`;
const masterwork = catalog.crafting.augments.find((entry) =>
    entry.rules.some((rule) =>
        rule.stats.some((stat) => stat.id === "dummy_display_stat_rune_upgrade"),
    ),
)!;
const method = { kind: "upgrade_augment" as const, id: masterwork.id, socket: 0 };
const base = "Metadata/Items/Armours/BodyArmours/FourBodyStr1";
function body(augments = [id("RuneFireLesser")]): CraftingItem {
    return { ...engine.createItem(base), sockets: 2, augments };
}
const apply = (item: CraftingItem, socket = 0) =>
    engine.apply(item, { ...method, socket }, seededRandom(42));

describe("Masterwork Rune upgrades", () => {
    it("follows every extracted higher-tier link on each eligible item class", () => {
        const entries = catalog.crafting.augments.filter((entry) => entry.higherTier);
        expect(entries).toHaveLength(47);
        let checked = 0;
        for (const entry of entries) {
            const classes = new Set(
                entry.rules.flatMap((rule) => (rule.stats.length ? rule.itemClasses : [])),
            );
            for (const itemClass of classes) {
                const candidate = Object.entries(catalog.bases).find(
                    ([, value]) => value.item_class === itemClass && !value.implicits.length,
                );
                if (!candidate) continue;
                const item = {
                    ...engine.createItem(candidate[0], 1),
                    sockets: 1,
                    augments: [entry.id],
                };
                if (!availableAugments(catalog, item).some((augment) => augment.id === entry.id))
                    continue;
                const result = apply(item);
                expect(result.item).toEqual({
                    ...engine.validateItem(item),
                    augments: [entry.higherTier],
                });
                expect(result.cost).toEqual([
                    { id: masterwork.id, name: masterwork.name, amount: 1 },
                ]);
                expect(
                    augmentRule(
                        catalog,
                        item,
                        catalog.crafting.augments.find(
                            (augment) => augment.id === entry.higherTier,
                        )!,
                    ),
                ).toBeTruthy();
                checked++;
            }
        }
        expect(checked).toBeGreaterThan(400);
    });

    it("upgrades exactly the chosen occupied socket one tier at a time, without consuming another socket", () => {
        let item = body([id("RuneCold"), id("RuneFireLesser")]);
        for (const [suffix, resistance] of [
            ["RuneFire", 14],
            ["RuneFireGreater", 18],
            ["RuneFirePerfect", 22],
        ] as const) {
            const result = apply(item, 1);
            expect(result.item.augments).toEqual([id("RuneCold"), id(suffix)]);
            expect(result.item.sockets).toBe(2);
            expect(engine.statTotals(result.item).get("base_fire_damage_resistance_%")).toBe(
                resistance,
            );
            expect(engine.statTotals(result.item).get("base_cold_damage_resistance_%")).toBe(14);
            expect(engine.statTotals(result.item).get("num_socketed_runes")).toBe(2);
            expect(result.item.augments).not.toContain(masterwork.id);
            item = result.item;
        }
        expect(() => apply(item, 1)).toThrow("no higher Rune tier");
        expect(engine.methodName({ ...method, socket: 1 })).toContain("Upgrade socket 2");
    });

    it.each([
        "corrupted",
        "sanctified",
        "mirrored",
    ] as const)("preserves %s state, affixes and quality under the socketed-augment model", (flag) => {
        const item = body([id("RuneFireGreater")]);
        item[flag] = true;
        item.rarity = "rare";
        item.quality = 20;
        const mod = engine.pool(item, { side: "prefix" })[0]!;
        item.mods = [{ ...engine.rollMod(mod.id, seededRandom(1)), fractured: true }];
        const result = apply(item).item;
        expect(result).toEqual({ ...engine.validateItem(item), augments: [id("RuneFirePerfect")] });
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, result)).map(
                (match) => match.item,
            ),
        ).toContainEqual(result);
    });

    it("rejects missing sockets, non-tiered augments and false upgrader identities before randomness", () => {
        const random = seededRandom(42);
        const pick = vi.spyOn(random, "pick");
        const integer = vi.spyOn(random, "integer");
        for (const suffix of [
            "RuneFirePerfect",
            "RunePhysicalGreater",
            "TalismanRabbit",
            "SoulCoreVision",
        ]) {
            const item = body([id(suffix)]);
            if (suffix === "SoulCoreVision")
                item.baseId = Object.entries(catalog.bases).find(
                    ([, entry]) => entry.item_class === "Staff" && !entry.implicits.length,
                )![0];
            const original = structuredClone(item);
            expect(() => engine.apply(item, method, random)).toThrow("no higher Rune tier");
            expect(item).toEqual(original);
        }
        expect(() => engine.apply(body([]), method, random)).toThrow("occupied Rune socket");
        expect(() => engine.apply(body(), { ...method, socket: 1 }, random)).toThrow(
            "occupied Rune socket",
        );
        expect(() => engine.apply(body(), { ...method, socket: 7 }, random)).toThrow();
        expect(() => engine.apply(body(), { ...method, id: id("RuneFire") }, random)).toThrow(
            "does not upgrade",
        );
        expect(() =>
            engine.apply(body([]), { kind: "augment", id: masterwork.id }, random),
        ).toThrow("not supported");
        expect(() => engine.validateItem(body([masterwork.id]))).toThrow("not supported");
        expect(() =>
            engine.apply(
                { ...body(), destroyed: true, corrupted: true, twiceCorrupted: true },
                method,
                random,
            ),
        ).toThrow("Destroyed items");
        expect(() => poe1Engine.apply(poe1Engine.createItem(poe1Base), method, random)).toThrow(
            "Unknown socketable",
        );
        expect(pick).not.toHaveBeenCalled();
        expect(integer).not.toHaveBeenCalled();
    });

    it("recomputes Runeseeker scaling and calculates repeated upgrades with their exact costs", () => {
        const wand = Object.entries(catalog.bases).find(
            ([, entry]) => entry.item_class === "Wand" && !entry.implicits.length,
        )![0];
        const item: CraftingItem = {
            ...engine.createItem(wand),
            sockets: 2,
            corrupted: true,
            augments: [id("RuneFire"), id("RuneOlrothsLegacyRuneseekersCall")],
        };
        const target = engine.validateTarget({
            groups: [],
            stats: [{ id: "non_skill_base_all_damage_%_to_gain_as_fire", min: 21 }],
        });
        const greater = apply(item).item;
        expect(augmentText(catalog, greater, greater.augments![0]!)).toContain("17%");
        expect(calculateExact(engine, item, method, target).probability).toBe(0);
        expect(calculateExact(engine, greater, method, target).probability).toBe(1);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item,
            method,
            target,
            steps: [
                {
                    id: "upgrade",
                    method,
                    condition: target,
                    onSuccess: "success",
                    onFailure: "upgrade",
                },
            ],
            useProcess: true,
            prices: { [masterwork.id]: 3 },
            seed: 42,
            iterations: 1000,
            maxActions: 3,
        });
        expect(calculateProcessExact(engine, project)).toMatchObject({
            probability: 1,
            meanCost: 6,
        });
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let index = 0; index < 25; index++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            successes: 25,
            totalActions: 50,
            meanCost: 6,
            errors: {},
            spending: { [masterwork.id]: 50 },
        });
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
        const result = apply(greater).item;
        expect(result.augments).toEqual([
            id("RuneFirePerfect"),
            id("RuneOlrothsLegacyRuneseekersCall"),
        ]);
        expect(engine.statTotals(result).get("non_skill_base_all_damage_%_to_gain_as_fire")).toBe(
            21,
        );
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, result)).map(
                (match) => match.item,
            ),
        ).toContainEqual(result);
    });
});
