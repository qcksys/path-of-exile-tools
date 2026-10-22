import type { CraftingItem } from "../schemas/crafting";
import type { CraftingEngine } from "./crafting-engine";

const cached = new WeakMap<CraftingEngine, Map<string, boolean>>();

export function craftingBaseTypeAmbiguous(engine: CraftingEngine, item: CraftingItem) {
    const results = cached.get(engine) ?? new Map<string, boolean>();
    cached.set(engine, results);
    const key = `${item.baseId}:${item.rarity}`;
    const previous = results.get(key);
    if (previous !== undefined) return previous;
    const base = engine.base(item);
    const ambiguous = Object.entries(engine.catalog.bases).some(
        ([id, candidate]) =>
            !id.includes("Royale") &&
            candidate.corrupted === base.corrupted &&
            candidate.rarities.includes(item.rarity) &&
            candidate.name === base.name &&
            JSON.stringify(candidate) !== JSON.stringify(base),
    );
    results.set(key, ambiguous);
    return ambiguous;
}
