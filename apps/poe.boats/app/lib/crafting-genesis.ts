import { genesisEffect } from "../../../../packages/poe-game-data/src/crafting-genesis";
import type { CraftingCatalog, CraftingItem } from "../schemas/crafting";
import type { PoolEntry } from "./crafting-engine";
import { modifierFamily } from "./crafting-memory";

export function genesisSupported(catalog: CraftingCatalog, item: Pick<CraftingItem, "baseId">) {
    const base = catalog.bases[item.baseId];
    return Boolean(
        catalog.game === "poe1" &&
            catalog.crafting.genesis?.itemClasses.includes(base?.item_class ?? "") &&
            base?.rarities.includes("rare") &&
            !base.corrupted,
    );
}

export function genesisEffects(catalog: CraftingCatalog, ids: string[]) {
    const tree = catalog.crafting.genesis;
    if (catalog.game !== "poe1" || !tree)
        throw new Error("Genesis crafting is unavailable in this build.");
    if (new Set(ids).size !== ids.length) throw new Error("Choose each Genesis passive only once.");
    return ids.flatMap((id) => {
        const passive = tree.passives[id];
        if (!passive?.stats.length || passive.stats.some((stat) => !genesisEffect(stat)))
            throw new Error("Choose an extracted Genesis modifier-weight or tier-rating passive.");
        return passive.stats.map((stat) => genesisEffect(stat)!);
    });
}

export function genesisPool(pool: PoolEntry[], effects: ReturnType<typeof genesisEffects>) {
    const rating = effects.reduce(
        (sum, effect) => sum + (effect.kind === "tier" ? effect.value : 0),
        0,
    );
    const levels = new Map<string, Set<number>>();
    for (const { mod } of pool) {
        const family = modifierFamily(mod);
        const values = levels.get(family) ?? new Set<number>();
        values.add(mod.required_level);
        levels.set(family, values);
    }
    const minimums = new Map(
        [...levels].map(([family, values]) => {
            const sorted = [...values].sort((a, b) => a - b);
            return [
                family,
                sorted[Math.floor((sorted.length * rating) / (100 + rating))]!,
            ] as const;
        }),
    );
    return pool.flatMap((entry) => {
        if (entry.mod.required_level < minimums.get(modifierFamily(entry.mod))!) return [];
        const percent = effects.reduce(
            (sum, effect) =>
                sum +
                (effect.kind === "weight" && entry.mod.implicit_tags.includes(effect.tag)
                    ? effect.value
                    : 0),
            100,
        );
        const weight = Math.max(0, Math.round((entry.weight * percent) / 100));
        return weight ? [{ ...entry, weight }] : [];
    });
}
