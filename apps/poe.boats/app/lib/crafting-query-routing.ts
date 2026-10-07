import {
    type ItemQuery,
    type ItemRecord,
    matchItem,
    queryConditionCount,
} from "@poe-tools/item-query";

export interface CraftingQueryBranch {
    id: string;
    query: ItemQuery;
    probability?: number | null;
}

export function orderCraftingBranches<T extends CraftingQueryBranch>(
    branches: readonly T[],
    ordering: "automatic" | "manual",
): T[] {
    if (ordering === "manual") return [...branches];
    const groups = new Map<number, T[]>();
    for (const branch of branches) {
        const count = queryConditionCount(branch.query);
        const group = groups.get(count) ?? [];
        group.push(branch);
        groups.set(count, group);
    }
    return [...groups.entries()]
        .sort(([a], [b]) => b - a)
        .flatMap(([, group]) => {
            // Preserve the whole tied group until all probabilities are comparable.
            if (group.some((branch) => branch.probability == null)) return group;
            return group.sort((a, b) => a.probability! - b.probability!);
        });
}

export function routeCraftingItem(
    item: ItemRecord,
    branches: readonly CraftingQueryBranch[],
    ordering: "automatic" | "manual",
): { status: "matched" | "unmatched" | "unknown"; branchId: string | null; candidates: string[] } {
    const candidates: string[] = [];
    for (const branch of orderCraftingBranches(branches, ordering)) {
        const match = matchItem(item, branch.query);
        if (match === "no-match") continue;
        if (match === "unknown") {
            candidates.push(branch.id);
            continue;
        }
        if (candidates.length)
            return { status: "unknown", branchId: null, candidates: [...candidates, branch.id] };
        return { status: "matched", branchId: branch.id, candidates: [branch.id] };
    }
    return { status: candidates.length ? "unknown" : "unmatched", branchId: null, candidates };
}
