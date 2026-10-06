import type {
    CraftingCatalog,
    CraftingItem,
    CraftingMethod,
    CraftingMod,
} from "../schemas/crafting";
import type { PoolEntry, Weighted } from "./crafting-engine";
import { cleanModText, rolledModText } from "./crafting-text";

export function supportsMemoryMap(catalog: CraftingCatalog, item: Pick<CraftingItem, "baseId">) {
    const base = catalog.bases[item.baseId];
    return Boolean(
        catalog.game === "poe1" &&
            catalog.crafting.memoryMaps &&
            base?.domain === "area" &&
            base.item_class === "Map",
    );
}

export function memoryMapModifiers(
    catalog: CraftingCatalog,
    item: Pick<CraftingItem, "memoryMap">,
) {
    const rule = catalog.crafting.memoryMaps;
    if (!rule || !item.memoryMap) return [];
    const influence = catalog.mods[rule.influenceMod]?.text;
    if (!influence) throw new Error("Memory map influence text is missing from this build.");
    const result = [{ id: rule.influenceMod, text: cleanModText(influence) }];
    if (item.memoryMap.intentions) {
        const mod = catalog.mods[rule.enchantmentMod]!;
        const text = rolledModText(catalog, {
            id: rule.enchantmentMod,
            values: mod.stats.map((stat) => stat.min * item.memoryMap!.intentions),
            crafted: false,
            fractured: false,
        });
        if (!text) throw new Error("Orb of Intention enchantment text is missing from this build.");
        result.push({ id: rule.enchantmentMod, text: cleanModText(text) });
    }
    return result;
}

// The supplied research's 2,255 Remembrance observations, grouped into five-strand buckets.
// This is an empirical probability model, not client data or an exact server distribution.
const remembranceBuckets = [
    135, 170, 196, 203, 218, 208, 202, 177, 176, 141, 116, 100, 78, 43, 40, 25, 19, 5, 3,
];
export const remembranceOutcomes = remembranceBuckets.flatMap((count, index) => {
    const first = 10 + index * 5;
    const width = Math.min(5, 101 - first);
    return Array.from({ length: width }, (_, offset) => ({
        value: first + offset,
        weight: count / width,
    }));
});

export function memoryConsumption(
    catalog: CraftingCatalog,
    item: CraftingItem,
    method: CraftingMethod,
) {
    if (catalog.game !== "poe1" || (method.kind !== "currency" && method.kind !== "essence"))
        return;
    const action = catalog.crafting.currencies.find((entry) => entry.id === method.id)?.action;
    const cost = action && catalog.crafting.memoryStrandCosts[action];
    if (!cost) return;
    let maximum = 2 * cost;
    const exalt = [
        "add_mod_to_rare",
        "add_mod_to_rare_eldritch",
        "add_influence_mod_to_rare",
        "mutated_add_mod_to_rare",
    ].includes(action);
    if (exalt) {
        // Craft of Exile's affix-count estimate is separate from the extracted action cost.
        const adjustment =
            action === "mutated_add_mod_to_rare" ? [18, 18, 24, 28, 32, 34] : [0, 0, 6, 10, 16, 18];
        maximum += adjustment[Math.min(item.mods.length, 5)]!;
    }
    return { maximum, exalt };
}

export function remainingStrandOutcomes(strands: number, maximum: number) {
    const outcomes = Array.from({ length: Math.min(strands, maximum + 1) }, (_, spent) => ({
        value: strands - spent,
        weight: 1,
    }));
    if (maximum >= strands) outcomes.push({ value: 0, weight: maximum - strands + 1 });
    return outcomes;
}

export function supportsMemoryStrands(
    catalog: CraftingCatalog,
    item: Pick<CraftingItem, "baseId">,
) {
    const base = catalog.bases[item.baseId];
    return (
        catalog.game === "poe1" &&
        base?.domain === "item" &&
        base.tags.some((tag) =>
            ["weapon", "armour", "ring", "amulet", "belt", "quiver"].includes(tag),
        )
    );
}

export function memoryTierCount(total: number, strands: number, foulborn = false) {
    if (!strands && !foulborn) return total;
    // Integer arithmetic preserves the exact boundaries in the supplied empirical model.
    const denominator = strands > 0 ? 5 * strands + 295 + (foulborn ? 150 : 0) : 350;
    return Math.floor((200 * (total - 1)) / denominator) + 1;
}

export function modifierFamily(mod: CraftingMod) {
    return JSON.stringify([mod.domain, mod.generation_type, mod.type, [...mod.groups].sort()]);
}

export function memoryTierPool(pool: PoolEntry[], strands: number, foulborn = false) {
    if (!strands && !foulborn) return pool;
    const families = new Map<string, Set<number>>();
    for (const entry of pool) {
        const key = modifierFamily(entry.mod);
        const levels = families.get(key) ?? new Set<number>();
        levels.add(entry.mod.required_level);
        families.set(key, levels);
    }
    const minimums = new Map(
        [...families].map(([key, levels]) => {
            const sorted = [...levels].sort((a, b) => b - a);
            return [key, sorted[memoryTierCount(sorted.length, strands, foulborn) - 1]!] as const;
        }),
    );
    return pool.filter(
        (entry) => entry.mod.required_level >= minimums.get(modifierFamily(entry.mod))!,
    );
}

export function unravellingOutcomes(current: PoolEntry, pool: PoolEntry[], strands: number) {
    const family = modifierFamily(current.mod);
    const higher = pool
        .filter(
            (entry) =>
                modifierFamily(entry.mod) === family &&
                entry.mod.required_level > current.mod.required_level,
        )
        .sort((a, b) => b.mod.required_level - a.mod.required_level);
    const sideWeight = pool.reduce(
        (sum, entry) =>
            sum + (entry.mod.generation_type === current.mod.generation_type ? entry.weight : 0),
        0,
    );
    const upgradeWeight = higher.reduce((sum, entry) => sum + entry.weight, 0);
    if (!upgradeWeight || !sideWeight || !strands) return [{ value: current.id, weight: 1 }];
    const probability = Math.min(1, (strands * upgradeWeight) / (2 * sideWeight));
    const destinations = higher.map((entry) => ({
        value: entry.id,
        weight: higher.reduce(
            (sum, other) =>
                sum + (other.mod.required_level >= entry.mod.required_level ? other.weight : 0),
            0,
        ),
    }));
    const total = destinations.reduce((sum, entry) => sum + entry.weight, 0);
    const outcomes: Weighted<string>[] = destinations.map((entry) => ({
        value: entry.value,
        weight: (probability * entry.weight) / total,
    }));
    if (probability < 1) outcomes.push({ value: current.id, weight: 1 - probability });
    return outcomes;
}
