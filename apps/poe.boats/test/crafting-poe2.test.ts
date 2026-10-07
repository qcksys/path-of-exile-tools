import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { availableOmens } from "../app/lib/crafting-omens";
import { nonNativeEssenceSources } from "../app/lib/crafting-recombination";
import {
    type CraftingItem,
    type CraftingMethod,
    craftingCatalogSchema,
} from "../app/schemas/crafting";

const catalog = craftingCatalogSchema.parse(
    JSON.parse(
        readFileSync(new URL("../public/game-data/crafting-poe2.json", import.meta.url), "utf8"),
    ),
);
const engine = new CraftingEngine(catalog);
const base = Object.entries(catalog.bases).find(
    ([, base]) => base.item_class === "Body Armour" && base.tags.includes("str_armour"),
)![0];
const currency = (action: string): Extract<CraftingMethod, { kind: "currency" }> => ({
    kind: "currency",
    id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
});

describe("PoE 2 crafting rules", () => {
    it("does not apply PoE 1 NNN recombination rules to PoE 2 essences", () => {
        expect(nonNativeEssenceSources(engine, engine.createItem(base))).toEqual([]);
    });
    const omen = (suffix: string) =>
        catalog.crafting.currencies.find((entry) => entry.id.endsWith(`/${suffix}`))!.id;
    it("filters Homogenising rolls by existing tags and combines them with directional omens", () => {
        const empty = { ...engine.createItem(base), rarity: "rare" as const };
        const life = engine.pool(empty).find((entry) => entry.mod.implicit_tags.includes("life"))!;
        const item = engine.addStartingMod(empty, life.id, seededRandom(1));
        const tags = engine.mod(life.id).implicit_tags;
        const method = {
            ...currency("add_mod_to_rare"),
            omens: [omen("OmenOnExaltAddExistingModType"), omen("OmenOnExaltAddSuffixes")],
        };
        for (let seed = 0; seed < 20; seed++) {
            const result = engine.apply(item, method, seededRandom(seed));
            const added = engine.mod(result.item.mods[1]!.id);
            expect(added.implicit_tags.some((tag) => tags.includes(tag))).toBe(true);
            expect(added.generation_type).toBe("suffix");
            expect(result.item.mods[0]).toEqual(item.mods[0]);
            expect(result.cost.map((entry) => entry.id)).toEqual([method.id, ...method.omens]);
        }
        const regal = engine.apply(
            { ...item, rarity: "magic" },
            {
                ...currency("upgrade_magic_to_rare"),
                omens: [omen("OmenOnRegalAddExistingModType")],
            },
            seededRandom(1),
        );
        expect(regal.item.rarity).toBe("rare");
        expect(
            engine.mod(regal.item.mods[1]!.id).implicit_tags.some((tag) => tags.includes(tag)),
        ).toBe(true);
        expect(() => engine.apply(empty, method, seededRandom(1))).toThrow("No eligible");
    });

    it("uses Omen of the Blessed to reroll only the extracted base implicits", () => {
        const ringId = Object.entries(catalog.bases).find(
            ([, entry]) =>
                entry.item_class === "Ring" &&
                entry.implicits.some((id) =>
                    engine.mod(id).stats.some((stat) => stat.min !== stat.max),
                ),
        )![0];
        const item = engine.apply(
            engine.createItem(ringId),
            currency("transmute_to_rare"),
            seededRandom(5),
        ).item;
        const original = structuredClone(item);
        const method = {
            ...currency("reroll_mod_values"),
            omens: [omen("OmenOnDivineRerollImplicits")],
        };
        const result = engine.apply(item, method, {
            ...seededRandom(1),
            integer: (_min, max) => max,
        });
        expect(item).toEqual(original);
        expect(result.item.mods).toEqual(item.mods);
        for (const implicit of result.item.implicits)
            expect(implicit.values).toEqual(engine.mod(implicit.id).stats.map((stat) => stat.max));
        expect(result.cost.map((entry) => entry.id)).toEqual([method.id, ...method.omens]);
        expect(() => engine.apply({ ...item, implicits: [] }, method, seededRandom(1))).toThrow(
            "implicit",
        );
    });

    it("combines compatible exalt omens and charges each consumed item", () => {
        const item = { ...engine.createItem(base), rarity: "rare" as const };
        const method = {
            ...currency("add_mod_to_rare"),
            omens: [omen("OmenOnExaltAddPrefixes"), omen("OmenOnExaltAddTwoMods")],
        };
        const result = engine.apply(item, method, seededRandom(51));
        expect(engine.counts(result.item)).toEqual({ prefixes: 2, suffixes: 0 });
        expect(result.cost).toHaveLength(3);
        expect(result.cost.map((entry) => entry.id)).toEqual([method.id, ...method.omens]);
        expect(() =>
            engine.apply(
                item,
                { ...method, omens: [...method.omens, omen("OmenOnExaltAddSuffixes")] },
                seededRandom(1),
            ),
        ).toThrow("conflicting");
        expect(() =>
            engine.apply(
                item,
                { ...method, omens: [omen("OmenOnChaosLowestLevelMod")] },
                seededRandom(1),
            ),
        ).toThrow("does not apply");
        expect(availableOmens(catalog, method).map((entry) => entry.id)).toContain(method.omens[0]);
    });

    it("Greater Annulment stops when only fractured or directionally excluded affixes remain", () => {
        const empty = { ...engine.createItem(base), rarity: "rare" as const };
        const prefix = engine.pool(empty, { side: "prefix" })[0]!;
        const first = engine.addStartingMod(empty, prefix.id, seededRandom(1));
        const suffix = engine.pool(first, { side: "suffix" })[0]!;
        const input = engine.addStartingMod(first, suffix.id, seededRandom(1));
        const method = {
            ...currency("remove_random_mod"),
            omens: [omen("OmenOnAnnulRemoveTwoMods")],
        };
        for (const direction of [false, true]) {
            const item = direction
                ? input
                : { ...input, mods: [input.mods[0]!, { ...input.mods[1]!, fractured: true }] };
            const selected = direction
                ? { ...method, omens: [...method.omens, omen("OmenOnAnnulRemovePrefixes")] }
                : method;
            const before = structuredClone(item);
            const result = engine.apply(item, selected, seededRandom(1));
            expect(result.item.mods).toEqual([item.mods[1]]);
            expect(result.cost.map((entry) => entry.id)).toEqual([selected.id, ...selected.omens]);
            expect(() => engine.apply(result.item, selected, seededRandom(1))).toThrow(
                "No eligible",
            );
            expect(item).toEqual(before);
        }
    });

    it("Whittling removes the lowest-level eligible modifier and leaves the rest unchanged", () => {
        const random = seededRandom(91);
        const rare = engine.apply(
            engine.createItem(base),
            currency("transmute_to_rare"),
            random,
        ).item;
        const levels = rare.mods.map((entry) => engine.mod(entry.id).required_level);
        const lowest = Math.min(...levels);
        const result = engine.apply(
            rare,
            { ...currency("reroll"), omens: [omen("OmenOnChaosLowestLevelMod")] },
            random,
        ).item;
        for (const entry of rare.mods.filter(
            (entry) => engine.mod(entry.id).required_level > lowest,
        ))
            expect(result.mods).toContainEqual(entry);
        expect(result.mods).toHaveLength(4);
    });

    it("directional annulment cannot remove an affix on the other side", () => {
        const random = seededRandom(2);
        const rare = engine.apply(
            engine.createItem(base),
            currency("transmute_to_rare"),
            random,
        ).item;
        const method = {
            ...currency("remove_random_mod"),
            omens: [omen("OmenOnAnnulRemovePrefixes")],
        };
        const result = engine.apply(rare, method, random).item;
        expect(result.mods).toHaveLength(3);
        expect(
            result.mods.filter((entry) => engine.mod(entry.id).generation_type === "suffix"),
        ).toEqual(rare.mods.filter((entry) => engine.mod(entry.id).generation_type === "suffix"));
        const suffixOnly = {
            ...rare,
            mods: rare.mods.filter((entry) => engine.mod(entry.id).generation_type === "suffix"),
        };
        expect(() => engine.apply(suffixOnly, method, random)).toThrow("No eligible");
    });

    it("alchemy omens fill the chosen affix side while retaining the four-mod total", () => {
        const method = {
            ...currency("transmute_to_rare"),
            omens: [omen("OmenOnAlchemyMaximumSuffixes")],
        };
        const result = engine.apply(engine.createItem(base), method, seededRandom(5)).item;
        expect(engine.counts(result)).toEqual({ prefixes: 1, suffixes: 3 });
    });
    it("transmutes exactly one modifier and alchemises exactly four", () => {
        const random = seededRandom(3);
        const normal = engine.createItem(base);
        const magic = engine.apply(normal, currency("transmute_to_magic"), random).item;
        expect(magic.mods).toHaveLength(1);
        const augmented = engine.apply(magic, currency("add_mod_to_magic"), random).item;
        expect(augmented.mods).toHaveLength(2);
        expect(engine.apply(normal, currency("transmute_to_rare"), random).item.mods).toHaveLength(
            4,
        );
        expect(
            engine.apply(augmented, currency("transmute_to_rare"), random).item.mods,
        ).toHaveLength(4);
    });

    it("chaos removes and adds one modifier while preserving the other three", () => {
        const random = seededRandom(4);
        const rare = engine.apply(
            engine.createItem(base),
            currency("transmute_to_rare"),
            random,
        ).item;
        const next = engine.apply(rare, currency("reroll"), random).item;
        expect(next.mods).toHaveLength(4);
        expect(
            next.mods.filter((entry) => rare.mods.some((mod) => mod.id === entry.id)),
        ).toHaveLength(3);
    });

    it("uses the extracted tiered-currency floor, retaining top available tiers below it", () => {
        const item = { ...engine.createItem(base), rarity: "rare" as const };
        const tier = catalog.crafting.tieredCurrency.find((entry) =>
            entry.id.endsWith("CurrencyAddModToRare3"),
        )!;
        const pool = engine.pool(item, { minimumLevel: tier.minimumModLevel });
        const original = engine.pool(item);
        expect(pool.length).toBeLessThan(original.length);
        for (const entry of pool.filter(
            (entry) => entry.mod.required_level < tier.minimumModLevel,
        )) {
            expect(
                original.some(
                    (other) =>
                        other.mod.type === entry.mod.type &&
                        other.mod.groups.join("|") === entry.mod.groups.join("|") &&
                        other.mod.required_level > entry.mod.required_level,
                ),
            ).toBe(false);
        }
        const result = engine.apply(item, { kind: "currency", id: tier.id }, seededRandom(9));
        expect(pool.some((entry) => entry.id === result.item.mods[0]!.id)).toBe(true);
    });

    it("upgrades magic items with an extracted essence guarantee without rerolling existing mods", () => {
        const essence = catalog.crafting.poe2Essences.find(
            (entry) => entry.name === "Greater Essence of the Body",
        )!;
        const normal = engine.createItem(base);
        const suffix = engine
            .pool({ ...normal, rarity: "magic" })
            .find((entry) => entry.mod.generation_type === "suffix")!;
        const magic = {
            ...normal,
            rarity: "magic" as const,
            mods: [engine.rollMod(suffix.id, seededRandom(0))],
        };
        const result = engine.apply(magic, { kind: "essence", id: essence.id }, seededRandom(1));
        expect(result.item.rarity).toBe("rare");
        expect(result.item.mods).toHaveLength(2);
        expect(result.item.mods.filter((mod) => mod.crafted)).toHaveLength(1);
        expect(result.item.mods).toContainEqual(magic.mods[0]);
        expect(
            result.item.mods.some(
                (mod) =>
                    mod.id ===
                    essence.rules.find((rule) => rule.itemClasses.includes("Body Armour"))!.mod,
            ),
        ).toBe(true);
        expect(() =>
            engine.apply(normal, { kind: "essence", id: essence.id }, seededRandom(1)),
        ).toThrow("magic item");
        const perfect = catalog.crafting.poe2Essences.find(
            (entry) =>
                entry.perfect &&
                !entry.replacement.length &&
                entry.rules.some((rule) => rule.itemClasses.includes("Body Armour")),
        )!;
        expect(() =>
            engine.apply(result.item, { kind: "essence", id: perfect.id }, seededRandom(1)),
        ).toThrow("existing crafted modifier");
    });

    it("preserves the distinction between missing and explicit essence outcome weights", () => {
        const essence = catalog.crafting.poe2Essences.find(
            (entry) => entry.name === "Greater Essence of Enhancement",
        )!;
        expect(essence.rules[0]!.outcomes.every((entry) => entry.weight === null)).toBe(true);
        const magic = { ...engine.createItem(base), rarity: "magic" as const };
        const result = engine.apply(magic, { kind: "essence", id: essence.id }, seededRandom(1));
        expect(result.item.mods).toHaveLength(1);
        expect(
            essence.rules[0]!.outcomes.some((entry) => entry.mod === result.item.mods[0]!.id),
        ).toBe(true);
    });

    it("marks manually added essence guarantees as crafted without changing natural rolls", () => {
        const item = engine.createItem(base);
        const guarantee = engine
            .recipePool(item, "essence")
            .find((entry) => entry.id === "IncreasedLife8")!;
        const natural = engine.addStartingMod(item, guarantee.id, seededRandom(8));
        const crafted = engine.addStartingMod(item, guarantee.id, seededRandom(8), "essence");
        expect(natural.mods[0]!.crafted).toBe(false);
        expect(crafted.mods[0]!.crafted).toBe(true);
        expect(() =>
            engine.addStartingMod(crafted, "ChaosResist4", seededRandom(8), "essence"),
        ).toThrow("too many crafted");
    });

    it("excludes conflicting outcomes when an essence has several guarantees", () => {
        const essence = catalog.crafting.poe2Essences.find(
            (entry) => entry.name === "Greater Essence of the Infinite",
        )!;
        const hybridBase = Object.entries(catalog.bases).find(
            ([, entry]) =>
                entry.item_class === "Body Armour" && entry.tags.includes("str_dex_armour"),
        )![0];
        const item = {
            ...engine.createItem(hybridBase),
            rarity: "magic" as const,
            mods: [engine.rollMod("Strength2", seededRandom(1))],
        };
        for (let seed = 0; seed < 20; seed++) {
            const result = engine.apply(
                item,
                { kind: "essence", id: essence.id },
                seededRandom(seed),
            );
            expect(result.item.mods).toHaveLength(2);
            expect(result.item.mods[1]!.id).not.toBe("Strength6");
        }
    });

    it.each([
        "Expansive Alloy",
        "Essence of Hysteria",
    ])("%s removes a modifier from a rare item using its extracted instructions", (name) => {
        const essence = catalog.crafting.poe2Essences.find((entry) => entry.name === name)!;
        const item = {
            ...engine.createItem(base),
            rarity: "rare" as const,
            mods: [
                engine.rollMod("Strength2", seededRandom(1)),
                engine.rollMod("IncreasedLife3", seededRandom(1)),
            ],
        };
        const method = { kind: "essence" as const, id: essence.id };
        const result = engine.apply(item, method, seededRandom(17));
        expect(result.item.mods).toHaveLength(2);
        expect(result.item.mods.filter((entry) => entry.crafted)).toHaveLength(1);
        expect(result.cost[0]!.id).toBe(essence.id);
        expect(() => engine.apply({ ...item, rarity: "magic" }, method, seededRandom(17))).toThrow(
            "rare item",
        );
        expect(availableOmens(catalog, method).length).toBe(name.includes("Alloy") ? 0 : 2);
    });

    it("automatically removes a prefix when the essence guarantee needs a full prefix side", () => {
        let item: CraftingItem = { ...engine.createItem(base), rarity: "rare" };
        for (let count = 0; count < 3; count++) {
            const next = engine.pool(item, { side: "prefix" })[0]!;
            item = engine.addStartingMod(item, next.id, seededRandom(count));
        }
        const suffix = engine.pool(item, { side: "suffix" })[0]!;
        item = engine.addStartingMod(item, suffix.id, seededRandom(1));
        const essence = catalog.crafting.poe2Essences.find(
            (entry) => entry.name === "Perfect Essence of the Body",
        )!;
        const method = { kind: "essence" as const, id: essence.id };
        const automatic = engine.apply(item, method, seededRandom(1));
        const result = engine.apply(
            item,
            { ...method, omens: [omen("OmenOnPerfectEssencePrefix")] },
            seededRandom(1),
        );
        expect(engine.counts(result.item)).toEqual({ prefixes: 3, suffixes: 1 });
        expect(result.item.mods.some((entry) => entry.id === "EssenceIncreasedLifePercent1")).toBe(
            true,
        );
        expect(result.item.mods).toContainEqual(item.mods[3]);
        expect(automatic.item).toEqual(result.item);
        expect(automatic.cost.map((entry) => entry.id)).toEqual([method.id]);
    });

    it("rejects recipes with unresolved random passive payloads", () => {
        const essence = catalog.crafting.poe2Essences.find(
            (entry) => entry.name === "Essence of Delirium",
        )!;
        expect(engine.essenceSupported(essence.id)).toBe(false);
        expect(() => engine.validateMethod({ kind: "essence", id: essence.id })).toThrow(
            "outcome rule",
        );
    });
});
