/** biome-ignore-all lint/style/useNamingConvention: Fixtures retain canonical extracted field names. */
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, eldritchTier, seededRandom } from "../app/lib/crafting-engine";
import type { CraftingItem, CraftingMethod } from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const blank = (rarity: CraftingItem["rarity"] = "normal") => ({
    ...engine.createItem(baseId),
    rarity,
});
const roll = (id: string) => engine.rollMod(id, seededRandom(4));
const bench = (mod: string): CraftingMethod => ({
    kind: "bench",
    id: catalog.crafting.bench.find(
        (entry) => entry.mod === mod && entry.itemClasses.includes("Body Armour"),
    )!.id,
});

describe("build-backed crafting engine", () => {
    it("adds an influence and only rolls modifiers from the corresponding extracted influence pool", () => {
        const method = {
            kind: "currency" as const,
            id: catalog.crafting.currencies.find(
                (entry) =>
                    entry.action === "add_influence_mod_to_rare" && entry.id.endsWith("Hunter"),
            )!.id,
        };
        const result = engine.apply(blank("rare"), method, seededRandom(7)).item;
        expect(result.influences).toEqual([4]);
        expect(catalog.crafting.modRules[result.mods[0]!.id]!.influence).toBe(4);
        expect(() => engine.apply(result, method, seededRandom(8))).toThrow("no influence");
        expect(() =>
            engine.apply({ ...blank("rare"), level: 67 }, method, seededRandom(8)),
        ).toThrow("68+");
        expect(() => engine.validateItem({ ...result, influences: [] })).toThrow(
            "matching influence",
        );
    });

    it("uses extracted influence upgrade links for Dominance", () => {
        let item = { ...blank("rare"), influences: [0] };
        for (let i = 0; i < 2; i++) {
            const next = engine
                .pool(item, { influence: 0 })
                .find((entry) =>
                    catalog.crafting.influenceUpgrades.some((rule) => rule.mod === entry.id),
                )!;
            item = { ...item, mods: [...item.mods, roll(next.id)] };
        }
        const result = engine.apply(item, currency("upgrade_influence_mod"), seededRandom(11)).item;
        expect(result.mods).toHaveLength(1);
        expect(
            item.mods.some((entry) =>
                catalog.crafting.influenceUpgrades.some(
                    (rule) => rule.mod === entry.id && rule.upgraded === result.mods[0]!.id,
                ),
            ),
        ).toBe(true);
    });

    it("rolls Eldritch implicits by extracted tier and directs exalt/annul by dominance", () => {
        const random = seededRandom(41);
        let item = engine.apply(
            blank("rare"),
            currency("add_cleansing_fire_implicit_2"),
            random,
        ).item;
        item = engine.apply(item, currency("add_great_tangle_implicit_1"), random).item;
        expect(item.implicits.map((entry) => eldritchTier(engine.mod(entry.id)))).toEqual([2, 1]);
        item = engine.apply(item, currency("add_mod_to_rare_eldritch"), random).item;
        expect(engine.counts(item)).toEqual({ prefixes: 1, suffixes: 0 });
        const result = engine.apply(item, currency("remove_random_mod_eldritch"), random).item;
        expect(result.mods).toHaveLength(0);
        expect(result.implicits).toEqual(item.implicits);
        expect(
            engine.matches(result, {
                groups: [{ mods: [item.implicits[0]!.id], minimum: 1 }],
                minimumGroups: 0,
                openPrefixes: 0,
                openSuffixes: 0,
            }),
        ).toBe(true);
        const tied = engine.apply(result, currency("add_great_tangle_implicit_2"), random).item;
        expect(() => engine.apply(tied, currency("add_mod_to_rare_eldritch"), random)).toThrow(
            "dominant",
        );
        expect(() => engine.validateItem({ ...item, influences: [0] })).toThrow(
            "incompatible Eldritch",
        );
    });

    it("preserves the other side and fractures when Eldritch chaos reforges", () => {
        const random = seededRandom(15);
        let item = engine.apply(blank(), currency("transmute_to_rare"), random).item;
        item = engine.apply(item, currency("add_cleansing_fire_implicit_1"), random).item;
        const suffixes = item.mods.filter(
            (entry) => engine.mod(entry.id).generation_type === "suffix",
        );
        const result = engine.apply(item, currency("reroll_rare_eldritch"), random).item;
        expect(
            result.mods.filter((entry) => engine.mod(entry.id).generation_type === "suffix"),
        ).toEqual(suffixes);
    });

    it("rejects imported natural modifiers for a different base instead of allowing impossible items", () => {
        const weapon = Object.entries(catalog.bases).find(
            ([, base]) => base.item_class === "One Hand Sword",
        )![0];
        const mod = engine
            .pool({ ...engine.createItem(weapon), rarity: "rare" })
            .find((entry) => entry.id.startsWith("LocalIncreasedPhysicalDamage"))!;
        expect(() => engine.addStartingMod(blank(), mod.id, seededRandom(0))).toThrow(
            "not available",
        );
        const crafted = engine
            .recipePool(blank(), "bench")
            .find((entry) =>
                engine.mod(entry.id).stats.some((stat) => stat.id === "base_maximum_life"),
            )!;
        expect(engine.addStartingMod(blank(), crafted.id, seededRandom(0)).mods[0]!.crafted).toBe(
            true,
        );
    });
    it("has actual build provenance and builds an item using the extracted base", () => {
        expect(engine.base(blank()).name).toBe("Plate Vest");
        expect(catalog.patch).toBe(catalog.crafting.patch);
        expect(catalog.crafting.rarities.Rare).toEqual({
            min: 4,
            max: 6,
            prefixes: 3,
            suffixes: 3,
        });
    });

    it("uses ordered spawn weights, generation weights, maximum levels and mod groups", () => {
        const item = blank("rare");
        const mod = engine.pool(item)[0]!;
        const testMod = {
            ...mod.mod,
            spawn_weights: [
                { tag: "str_armour", weight: 0 },
                { tag: "default", weight: 500 },
            ],
        };
        let changed = new CraftingEngine({ ...catalog, mods: { probe: testMod } });
        expect(changed.pool(item)).toEqual([]);
        testMod.spawn_weights[0]!.weight = 400;
        testMod.generation_weights = [{ tag: "default", weight: 25 }];
        changed = new CraftingEngine({ ...catalog, mods: { probe: testMod } });
        expect(changed.pool(item)[0]?.weight).toBe(100);
        testMod.maximum_level = 85;
        changed = new CraftingEngine({ ...catalog, mods: { probe: testMod } });
        expect(changed.pool(item)).toEqual([]);
        testMod.maximum_level = 100;
        changed = new CraftingEngine({ ...catalog, mods: { probe: testMod } });
        expect(changed.pool(item)[0]?.weight).toBe(100);
        const existing = { ...item, mods: [changed.rollMod("probe", seededRandom(0))] };
        expect(changed.pool(existing)).toEqual([]);
    });

    it("filters item level and exposes influence mods only for selected influences", () => {
        const low = { ...blank("rare"), level: 1 };
        expect(engine.pool(low).every((entry) => entry.mod.required_level <= 1)).toBe(true);
        const influenced = { ...blank("rare"), influences: [0] };
        expect(
            engine
                .pool(influenced)
                .some((entry) => catalog.crafting.modRules[entry.id]?.influence === 0),
        ).toBe(true);
        expect(
            engine
                .pool(blank("rare"))
                .some((entry) => catalog.crafting.modRules[entry.id]?.influence === 0),
        ).toBe(false);
    });

    it("transmutes, augments, regals, and exalts with legal affix limits", () => {
        const random = seededRandom(1);
        let item = engine.apply(blank(), currency("transmute_to_magic"), random).item;
        expect(item.rarity).toBe("magic");
        if (item.mods.length === 1)
            item = engine.apply(item, currency("add_mod_to_magic"), random).item;
        expect(engine.counts(item)).toEqual({ prefixes: 1, suffixes: 1 });
        expect(() => engine.apply(item, currency("add_mod_to_magic"), random)).toThrow(
            "No eligible",
        );
        item = engine.apply(item, currency("upgrade_magic_to_rare"), random).item;
        expect(item.mods).toHaveLength(3);
        while (item.mods.length < 6)
            item = engine.apply(item, currency("add_mod_to_rare"), random).item;
        expect(engine.counts(item)).toEqual({ prefixes: 3, suffixes: 3 });
        expect(() => engine.apply(item, currency("add_mod_to_rare"), random)).toThrow(
            "No eligible",
        );
    });

    it("does not mutate the supplied item and rejects the wrong currency rarity", () => {
        const item = blank();
        engine.apply(item, currency("transmute_to_rare"), seededRandom(1));
        expect(item.mods).toEqual([]);
        expect(item.rarity).toBe("normal");
        expect(() => engine.apply(item, currency("reroll"), seededRandom(1))).toThrow("rare item");
    });

    it("keeps fractures through chaos, scouring, annulment and divine rolls", () => {
        const chosen = engine
            .pool(blank("rare"))
            .find((entry) => entry.mod.generation_type === "prefix")!;
        const fractured = { ...roll(chosen.id), fractured: true };
        const item = { ...blank("rare"), mods: [fractured] };
        const rerolled = engine.apply(item, currency("reroll"), seededRandom(2)).item;
        expect(rerolled.mods).toContainEqual(fractured);
        const scoured = engine.apply(rerolled, currency("convert_to_normal"), seededRandom(3)).item;
        expect(scoured.rarity).toBe("magic");
        expect(scoured.mods).toEqual([fractured]);
        expect(() => engine.apply(scoured, currency("remove_random_mod"), seededRandom(4))).toThrow(
            "No eligible",
        );
        expect(
            engine.apply(scoured, currency("reroll_mod_values"), seededRandom(5)).item.mods,
        ).toEqual([fractured]);
    });

    it("honors prefix protection while removing the suffix metamod on scour", () => {
        const prefix = engine
            .pool(blank("rare"))
            .find((entry) => entry.mod.generation_type === "prefix")!;
        const lock = Object.entries(catalog.mods).find(
            ([, mod]) =>
                mod.domain === "crafted" &&
                mod.stats.some((stat) => stat.id === "item_generation_cannot_change_prefixes"),
        )![0];
        const item = { ...blank("rare"), mods: [roll(prefix.id)] };
        const locked = engine.apply(item, bench(lock), seededRandom(1)).item;
        const scoured = engine.apply(locked, currency("convert_to_normal"), seededRandom(2)).item;
        expect(scoured.mods).toEqual(item.mods);
    });

    it("can fracture a PoE 1 bench modifier without allowing the bench to remove it", () => {
        const item = blank("rare");
        for (let i = 0; i < 3; i++) {
            const candidate = engine.pool(item, { side: i < 2 ? "prefix" : "suffix" })[0]!;
            item.mods.push(roll(candidate.id));
        }
        const crafted = engine
            .recipePool(item, "bench")
            .find(
                (entry) =>
                    entry.mod.generation_type === "suffix" &&
                    !entry.mod.groups.some((group) =>
                        item.mods.some((mod) => engine.mod(mod.id).groups.includes(group)),
                    ),
            )!;
        const withCraft = engine.apply(item, bench(crafted.id), seededRandom(1)).item;
        const fractured = engine.apply(withCraft, currency("fracture_random_mod"), {
            pick: (choices) => choices.at(-1)!.value,
            integer: (min) => min,
        }).item;
        expect(fractured.mods.find((entry) => entry.id === crafted.id)?.fractured).toBe(true);
        const removeCraft = catalog.crafting.bench.find(
            (entry) => !entry.mod && entry.action === 0,
        )!;
        expect(() =>
            engine.apply(fractured, { kind: "bench", id: removeCraft.id }, seededRandom(1)),
        ).toThrow("no crafted modifiers");
        expect(
            engine.apply(fractured, currency("convert_to_normal"), seededRandom(1)).item.mods,
        ).toEqual([fractured.mods.at(-1)]);
    });

    it("applies essence guarantees using extracted class mapping and level restrictions", () => {
        const essence = catalog.crafting.essences.find(
            (entry) => entry.name === "Whispering Essence of Greed",
        )!;
        const result = engine.apply(blank(), { kind: "essence", id: essence.id }, seededRandom(2));
        expect(result.item.mods.some((mod) => mod.id === essence.mods["Body Armour"])).toBe(true);
        expect(
            result.item.mods
                .filter((mod) => mod.id !== essence.mods["Body Armour"])
                .every((mod) => engine.mod(mod.id).required_level <= essence.itemLevelLimit),
        ).toBe(true);
        expect(() =>
            engine.apply(result.item, { kind: "essence", id: essence.id }, seededRandom(2)),
        ).toThrow("normal item");
    });

    it("blocks cold with Scorched Fossils and boosts fire by extracted factors", () => {
        const fossil = catalog.crafting.fossils.find((entry) => entry.name === "Scorched Fossil")!;
        const natural = engine.pool(blank("rare"));
        const changed = engine.pool(blank("rare"), { fossils: [fossil.id] });
        expect(changed.every((entry) => !entry.mod.implicit_tags.includes("cold"))).toBe(true);
        const fire = changed.find((entry) => entry.mod.implicit_tags.includes("fire"))!;
        expect(fire.weight).toBe(natural.find((entry) => entry.id === fire.id)!.weight * 10);
    });

    it("applies a fossil resonator, charges both ingredients and rejects duplicate fossils", () => {
        const fossil = catalog.crafting.fossils.find((entry) => entry.name === "Pristine Fossil")!;
        const resonator = catalog.crafting.currencies.find(
            (entry) => entry.action === "delve_currency_reroll" && entry.id.endsWith("1"),
        )!;
        const method: CraftingMethod = {
            kind: "fossils",
            ids: [fossil.id],
            resonator: resonator.id,
            logic: "additive",
        };
        const result = engine.apply(blank("rare"), method, seededRandom(3));
        expect(result.cost).toHaveLength(2);
        expect(
            result.item.mods.every(
                (entry) => !engine.mod(entry.id).implicit_tags.includes("defences"),
            ),
        ).toBe(true);
        expect(() =>
            engine.apply(
                blank("rare"),
                { ...method, ids: [fossil.id, fossil.id] },
                seededRandom(3),
            ),
        ).toThrow("once");
    });

    it("guarantees a Harvest reforge tag and charges extracted lifeforce", () => {
        const recipe = catalog.crafting.harvest.find((entry) => entry.id === "ReforgeLife")!;
        const result = engine.apply(
            blank("rare"),
            { kind: "harvest", id: recipe.id },
            seededRandom(3),
        );
        expect(
            result.item.mods.some((entry) => engine.mod(entry.id).implicit_tags.includes("life")),
        ).toBe(true);
        expect(result.cost[0]?.amount).toBe(recipe.lifeforce);
        expect(result.cost[0]?.name).toBe("Wild Crystallised Lifeforce");
    });

    it("requires the revealed Tangled Fossil effects before rolling", () => {
        const fossil = catalog.crafting.fossils.find((entry) => entry.name === "Tangled Fossil")!;
        const resonator = catalog.crafting.currencies.find(
            (entry) => entry.action === "delve_currency_reroll" && entry.id.endsWith("1"),
        )!;
        expect(engine.availableFossils(blank("rare"))).toContainEqual(fossil);
        expect(() =>
            engine.apply(
                blank("rare"),
                {
                    kind: "fossils",
                    ids: [fossil.id],
                    resonator: resonator.id,
                    logic: "additive",
                },
                seededRandom(3),
            ),
        ).toThrow("revealed Tangled Fossil effect pair");
    });

    it("preserves intrinsic corruption when importing an item", () => {
        const id = Object.entries(catalog.bases).find(([, base]) => base.corrupted)![0];
        const item = engine.createItem(id);
        expect(item.corrupted).toBe(true);
        expect(() => engine.validateItem({ ...item, corrupted: false })).toThrow(
            "intrinsically corrupted",
        );
    });

    it("matches grouped alternatives, minimum groups and open affix requirements", () => {
        const result = engine.apply(blank(), currency("transmute_to_rare"), seededRandom(9)).item;
        const first = result.mods[0]!.id;
        const second = result.mods[1]!.id;
        const target = engine.validateTarget({ groups: [{ mods: [first, second] }] });
        expect(engine.matches(result, target)).toBe(true);
        expect(engine.matches(blank("rare"), target)).toBe(false);
        expect(engine.matches(result, { ...target, openPrefixes: 3 })).toBe(false);
        expect(() => engine.validateTarget({ groups: [{ mods: [first], minimum: 2 }] })).toThrow();
    });

    it("reproduces complete outcomes from a seed", () => {
        expect(engine.apply(blank(), currency("transmute_to_rare"), seededRandom(43))).toEqual(
            engine.apply(blank(), currency("transmute_to_rare"), seededRandom(43)),
        );
        expect(engine.apply(blank(), currency("transmute_to_rare"), seededRandom(43))).not.toEqual(
            engine.apply(blank(), currency("transmute_to_rare"), seededRandom(44)),
        );
    });

    it("rejects tampered rolls, duplicate modifiers and incompatible fractures", () => {
        const mod = engine.pool(blank("rare"))[0]!;
        const rolled = roll(mod.id);
        expect(() => engine.validateItem({ ...blank("rare"), mods: [rolled, rolled] })).toThrow();
        expect(() =>
            engine.validateItem({ ...blank("rare"), mods: [{ ...rolled, values: [999999] }] }),
        ).toThrow("ranges");
        expect(() =>
            engine.validateItem({
                ...blank("rare"),
                influences: [0],
                mods: [{ ...rolled, fractured: true }],
            }),
        ).toThrow("fractured");
    });
});
