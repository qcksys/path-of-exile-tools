import type { CraftingCatalog, CraftingItem, CraftingMethod } from "../schemas/crafting";

export const allflameDucatActions = new Set([
    "reset_ghostliness_or_delete",
    "split_to_single_explicit",
    "reroll_rare_infamous",
    "add_deepwater_hazard_belt_mod",
    "add_pantheon_aspect",
    "reroll_single_attribute_modifier",
    "add_mod_and_corrupt_rare_abyss_jewel",
    "add_eldritch_implicit_amulet",
]);

export function attributeEquivalencies(catalog: CraftingCatalog) {
    if (catalog.game !== "poe1") return [];
    const attributes = ["additional_strength", "additional_dexterity", "additional_intelligence"];
    return catalog.crafting.modEquivalencies.filter((row) => {
        const mods = row.mods.map((id) => catalog.mods[id]);
        return (
            mods.length === attributes.length &&
            attributes.every((stat) =>
                mods.some((mod) => mod?.stats.length === 1 && mod.stats[0]!.id === stat),
            ) &&
            mods.every(
                (mod) =>
                    mod &&
                    ["prefix", "suffix"].includes(mod.generation_type) &&
                    mod.domain === mods[0]!.domain &&
                    mod.generation_type === mods[0]!.generation_type,
            )
        );
    });
}

export function ducatPoolOptions(catalog: CraftingCatalog, item: CraftingItem, action: string) {
    if (catalog.game !== "poe1") return;
    const itemClass = catalog.bases[item.baseId]?.item_class;
    if (!itemClass) return;
    if (action === "reroll_rare_infamous") return { domain: "mercenary" };
    if (action === "add_deepwater_hazard_belt_mod" && itemClass === "Belt")
        return { domain: "ducat_crafted", extraTags: ["deepwater_hazard_belt"] };
    if (action === "add_pantheon_aspect" && catalog.crafting.classes[itemClass]?.aspects)
        return { domain: "ducat_crafted", extraTags: ["deepwater_pantheon_aspect"] };
}

export function usesAllflame(method: CraftingMethod) {
    return "allflame" in method && method.allflame === true;
}

export function allflameBracket(catalog: CraftingCatalog, method: CraftingMethod) {
    const currency =
        method.kind === "fossils"
            ? method.resonator
            : method.kind === "currency" || method.kind === "essence"
              ? method.id
              : undefined;
    return catalog.crafting.allflame?.currencies
        .filter((entry) => entry.currency === currency)
        .sort((a, b) => b.tier - a.tier)[0];
}

export function allflameQuote(
    catalog: CraftingCatalog,
    item: CraftingItem,
    method: CraftingMethod,
) {
    const rules = catalog.crafting.allflame;
    const bracket = allflameBracket(catalog, method);
    const itemClass = catalog.bases[item.baseId]?.item_class;
    const classRule = rules?.classes.find((entry) => entry.itemClass === itemClass);
    const levelRule = rules?.levels.find((entry) => entry.level === item.level);
    if (!rules || !bracket || !classRule || !levelRule) return null;
    const amount = Math.round(
        ((bracket.sulphurCost * classRule.costPercent) / 100) *
            (classRule.levelScaling ? 1 + levelRule.costIncreasePercent / 100 : 1),
    );
    return { bracket, sulphur: rules.sulphur, amount };
}
