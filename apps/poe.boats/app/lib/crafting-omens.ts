/** biome-ignore-all lint/style/useNamingConvention: Keys are extracted currency identifiers. */
import type { CraftingCatalog, CraftingMethod } from "../schemas/crafting";

type OmenRule = {
    action: string;
    addSide?: "prefix" | "suffix";
    removeSide?: "prefix" | "suffix";
    maximumSide?: "prefix" | "suffix";
    lowestLevel?: boolean;
    addCount?: number;
    removeCount?: number;
    removeDesecrated?: boolean;
    existingTags?: boolean;
    catalysing?: boolean;
    corruption?: boolean;
    implicitsOnly?: boolean;
    sanctify?: boolean;
    revealReroll?: boolean;
    revealTag?: string;
    putrefy?: boolean;
    waystoneTag?: string;
};

// These are currency action semantics. Names, descriptions, availability and costs use the build catalog.
const rules: Record<string, OmenRule> = {
    OmenOnVaalRemoveDoNothingOutcome: { action: "corrupt_item", corruption: true },
    OmenOnChaosLowestLevelMod: { action: "reroll", lowestLevel: true },
    OmenOnChaosPrefix: { action: "reroll", removeSide: "prefix" },
    OmenOnChaosSuffix: { action: "reroll", removeSide: "suffix" },
    OmenOnAlchemyMaximumPrefixes: { action: "transmute_to_rare", maximumSide: "prefix" },
    OmenOnAlchemyMaximumSuffixes: { action: "transmute_to_rare", maximumSide: "suffix" },
    OmenOnRegalPrefix: { action: "upgrade_magic_to_rare", addSide: "prefix" },
    OmenOnRegalSuffix: { action: "upgrade_magic_to_rare", addSide: "suffix" },
    OmenOnExaltAddPrefixes: { action: "add_mod_to_rare", addSide: "prefix" },
    OmenOnExaltAddSuffixes: { action: "add_mod_to_rare", addSide: "suffix" },
    OmenOnExaltAddTwoMods: { action: "add_mod_to_rare", addCount: 2 },
    OmenOnAnnulRemovePrefixes: { action: "remove_random_mod", removeSide: "prefix" },
    OmenOnAnnulRemoveSuffixes: { action: "remove_random_mod", removeSide: "suffix" },
    OmenOnAnnulRemoveTwoMods: { action: "remove_random_mod", removeCount: 2 },
    OmenOnPerfectEssencePrefix: { action: "perfect_essence", removeSide: "prefix" },
    OmenOnPerfectEssenceSuffix: { action: "perfect_essence", removeSide: "suffix" },
    OmenOnAbyssAddPrefixes: { action: "desecrate", addSide: "prefix" },
    OmenOnAbyssAddSuffixes: { action: "desecrate", addSide: "suffix" },
    OmenOnAbyssVeilAllAndCorrupt: { action: "desecrate", putrefy: true },
    OmenOnAnnulRemoveAbyssMod: { action: "remove_random_mod", removeDesecrated: true },
    OmenOnRegalAddExistingModType: { action: "upgrade_magic_to_rare", existingTags: true },
    OmenOnExaltAddExistingModType: { action: "add_mod_to_rare", existingTags: true },
    OmenOnExaltConsumeQuality: { action: "add_mod_to_rare", catalysing: true },
    OmenOnDivineRerollImplicits: { action: "reroll_mod_values", implicitsOnly: true },
    OmenOnDivineSanctify: { action: "reroll_mod_values", sanctify: true },
    OmenOnAbyssRerollOptions: { action: "reveal", revealReroll: true },
    OmenOnAbyssGuarenteeLichTypeMod1: { action: "desecrate", revealTag: "ulaman_mod" },
    OmenOnAbyssGuarenteeLichTypeMod2: { action: "desecrate", revealTag: "amanamu_mod" },
    OmenOnAbyssGuarenteeLichTypeMod3: { action: "desecrate", revealTag: "kurgal_mod" },
    OmenOnChaosMapItemRarity: { action: "reroll", waystoneTag: "map_item_rarity" },
    OmenOnChaosMapPackSize: { action: "reroll", waystoneTag: "map_pack_size" },
    OmenOnChaosMapMonsterRarity: { action: "reroll", waystoneTag: "map_monster_rarity" },
    OmenOnChaosMapMonsterEffectiveness: { action: "reroll", waystoneTag: "map_monster_potency" },
};

const omenCandidates = new WeakMap<CraftingCatalog, CraftingCatalog["crafting"]["currencies"]>();

function actionFor(catalog: CraftingCatalog, method: CraftingMethod) {
    if (catalog.game !== "poe2") return;
    if (method.kind === "reveal") return "reveal";
    if (method.kind === "currency") {
        const action = catalog.crafting.currencies.find((entry) => entry.id === method.id)?.action;
        return action?.startsWith("abyssal_bench_ticket_") ? "desecrate" : action;
    }
    if (
        method.kind === "essence" &&
        catalog.crafting.poe2Essences.some(
            (entry) =>
                entry.id === method.id &&
                (entry.perfect || entry.id.includes("/CurrencyCorruptedEssence")),
        )
    )
        return "perfect_essence";
}

export function availableOmens(
    catalog: CraftingCatalog,
    method: CraftingMethod,
    itemClass?: string,
) {
    const action = actionFor(catalog, method);
    if (!action) return [];
    let candidates = omenCandidates.get(catalog);
    if (!candidates) {
        candidates = catalog.crafting.currencies.filter(
            (entry) => rules[entry.id.split("/").at(-1)!],
        );
        omenCandidates.set(catalog, candidates);
    }
    const currencyAction =
        method.kind === "currency"
            ? catalog.crafting.currencies.find((entry) => entry.id === method.id)?.action
            : undefined;
    return candidates.filter((entry) => {
        const rule = rules[entry.id.split("/").at(-1)!];
        return (
            rule &&
            rule.action === action &&
            (!rule.sanctify || catalog.crafting.sanctification !== null) &&
            (!rule.waystoneTag || !itemClass || itemClass === "Map") &&
            (!rule.catalysing ||
                !itemClass ||
                catalog.crafting.catalysts.some((entry) =>
                    entry.itemClasses.includes(itemClass),
                )) &&
            (!rule.revealTag ||
                /^abyssal_bench_ticket_(weapon|jewellery|breach)(_|$)/.test(currencyAction ?? ""))
        );
    });
}

export function omenEffects(catalog: CraftingCatalog, method: CraftingMethod) {
    const ids = "omens" in method ? (method.omens ?? []) : [];
    const result: Omit<OmenRule, "action" | "waystoneTag"> & { excludedWaystoneTags?: string[] } =
        {};
    if (!ids.length) return result;
    if (new Set(ids).size !== ids.length)
        throw new Error("An omen can only be used once per craft.");
    const available = availableOmens(catalog, method);
    for (const id of ids) {
        if (!available.some((entry) => entry.id === id))
            throw new Error("This omen does not apply to the selected craft.");
        const { action: _action, waystoneTag, ...effects } = rules[id.split("/").at(-1)!]!;
        if (waystoneTag) {
            result.excludedWaystoneTags ??= [];
            result.excludedWaystoneTags.push(waystoneTag);
        }
        for (const [key, value] of Object.entries(effects)) {
            if (Object.hasOwn(result, key))
                throw new Error("The selected omens have conflicting effects.");
            Object.assign(result, { [key]: value });
        }
    }
    if (result.sanctify && result.implicitsOnly)
        throw new Error(
            "Sanctification and Blessed Divine omens cannot be combined in this model.",
        );
    if (result.putrefy && Object.keys(result).length > 1)
        throw new Error("Putrefaction cannot be combined with directional or Lich omens.");
    if (result.excludedWaystoneTags) {
        if (result.excludedWaystoneTags.length > 3)
            throw new Error("At most three Waystone reroll omens can be combined.");
        if (Object.keys(result).some((key) => key !== "excludedWaystoneTags"))
            throw new Error(
                "Combining Waystone reroll omens with other Chaos omens is not supported.",
            );
    }
    return result;
}
