import type { CraftingMethod } from "../schemas/crafting";
import type { CraftingCost, CraftingEngine } from "./crafting-engine";

export function discoverCraftingCosts(
    engine: CraftingEngine,
    methods: (CraftingMethod | undefined)[],
    observedIds: string[] = [],
): CraftingCost[] {
    const costs = new Map<string, CraftingCost>();
    for (const method of methods) {
        if (!method) continue;
        try {
            for (const cost of engine.costs(method)) costs.set(cost.id, cost);
            const bench =
                method.kind === "bench" &&
                engine.catalog.crafting.bench.find((entry) => entry.id === method.id);
            if (bench && (bench.mod || bench.enchantment))
                for (const removal of engine.catalog.crafting.bench.filter(
                    (entry) =>
                        entry.action === (bench.enchantment ? 1 : 0) &&
                        !entry.mod &&
                        !entry.enchantment &&
                        entry.itemClasses.some((itemClass) =>
                            bench.itemClasses.includes(itemClass),
                        ),
                ))
                    for (const cost of removal.cost) costs.set(cost.id, cost);
        } catch {
            // Incomplete method drafts still expose previously recorded spending.
        }
    }
    for (const id of observedIds)
        if (!costs.has(id)) costs.set(id, { id, name: engine.costName(id), amount: 1 });
    return [...costs.values()];
}
