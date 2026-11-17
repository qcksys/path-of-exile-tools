import { marketClusterBases, marketClusterValue } from "@poe-tools/market";
import { type ClusterJewelSize, ClusterJewelSizeSchema } from "~/schemas/arbitrage";

export const CLUSTER_RECIPE_INPUTS = 5;
export const CLUSTER_RECIPE_SOURCE = "https://www.poewiki.net/wiki/Cluster_jewel#Mechanics";

/**
 * Enchantments the extracted game data still lists that no longer roll, so the recipe cannot
 * produce them: Medium aura and curse effect moved to Small Cluster Jewels
 * (https://www.poewiki.net/wiki/Medium_Cluster_Jewel#Legacy_variants), and no Small Cluster Jewel
 * enchantment grants attributes (https://poedb.tw/us/Cluster_Jewel#EnchantmentModifiers).
 */
const LEGACY_SKILLS = new Set([
    "affliction_aura_effect",
    "affliction_curse_effect",
    "affliction_strength",
    "affliction_dexterity",
    "affliction_intelligence",
]);

export type ClusterRecipeOutcome = {
    /** `<skill id>:<passive count>`, unique across sizes. */
    id: string;
    baseType: ClusterJewelSize;
    label: string;
    passives: number;
};

/** Each size's possible outcomes, every rollable enchantment at every passive count. */
export const CLUSTER_RECIPE_SIZES = marketClusterBases().map((entry) => {
    const baseType = ClusterJewelSizeSchema.parse(entry.baseType);
    const outcomes: ClusterRecipeOutcome[] = entry.skills
        .filter((skill) => !LEGACY_SKILLS.has(skill.id))
        .flatMap((skill) =>
            Array.from({ length: entry.maxPassives - entry.minPassives + 1 }, (_, index) => ({
                id: `${skill.id}:${entry.minPassives + index}`,
                baseType,
                label: skill.label,
                passives: entry.minPassives + index,
            })),
        );
    return { baseType, bands: entry.bands, outcomes };
});

/** The market item level band holding `itemLevel`; every size shares the same bands. */
export function clusterRecipeBand(itemLevel: number) {
    const band = CLUSTER_RECIPE_SIZES[0]!.bands.find(
        ({ min, max }) => min <= itemLevel && itemLevel <= max,
    );
    if (!band) throw new Error(`No Cluster Jewel market band holds item level ${itemLevel}.`);
    return band;
}

/** An outcome's stash market `signatureValue` within a band. */
export function clusterRecipeMarketValue(
    outcome: ClusterRecipeOutcome,
    band: { min: number; max: number },
) {
    return marketClusterValue(outcome.label, outcome.passives, band);
}
