import type { ItemCondition, ItemQuery, NumericRange } from "@poe-tools/item-query";
import type { CraftingItem } from "../schemas/crafting";
import type { CraftingGraph, GraphDestination, GraphNode } from "../schemas/crafting-graph";
import type { CraftingGraphResult } from "../schemas/crafting-graph-result";
import type { CraftingEngine } from "./crafting-engine";
import { graphDependencies, graphProductionOrder } from "./crafting-graph-validation";
import { cleanModText } from "./crafting-text";

const rangeText = ({ min, max }: NumericRange) =>
    min === max ? String(min) : `${min ?? "any"}–${max ?? "any"}`;
export function graphConditionText(engine: CraftingEngine, filter: ItemCondition): string {
    switch (filter.kind) {
        case "base":
            return `${filter.field}: ${filter.values.map((id) => engine.catalog.bases[id]?.name ?? id).join(" or ")}`;
        case "rarity":
            return `Rarity: ${filter.values.join(" or ")}`;
        case "influence":
            return `Influence: ${filter.values.join(" or ")}`;
        case "range":
            return `${filter.field}: ${rangeText(filter.value)}`;
        case "flag":
            return `${filter.field}: ${filter.value ? "yes" : "no"}`;
        case "stat":
            return `${filter.id} (${filter.scope}): ${rangeText(filter.value)}`;
        case "mod":
            return [
                filter.ids
                    ?.map((id) => cleanModText(engine.catalog.mods[id]?.text ?? id))
                    .join(" OR "),
                filter.names?.join(" OR "),
                filter.side,
                filter.tier && `tier ${rangeText(filter.tier)}`,
                filter.fractured === undefined
                    ? null
                    : `fractured: ${filter.fractured ? "yes" : "no"}`,
                filter.crafted === undefined ? null : `crafted: ${filter.crafted ? "yes" : "no"}`,
                `count ${rangeText(filter.count)}`,
            ]
                .filter(Boolean)
                .join(" · ");
    }
}
export function graphQueryText(engine: CraftingEngine, query: ItemQuery): string[] {
    return query.groups.map(
        (group) =>
            `${group.type.toUpperCase()}${group.value ? ` ${rangeText(group.value)}` : ""}: ${group.filters.map((filter) => graphConditionText(engine, filter)).join("; ")}`,
    );
}
export function graphDestinationText(graph: CraftingGraph, destination: GraphDestination): string {
    switch (destination.kind) {
        case "return":
            return "Continue with this item";
        case "discard":
            return "Discard; recreate consumed inputs";
        case "sell":
            return `Sell (${destination.price ? `${destination.price.amount} ${destination.price.currency}` : "price unknown"}); recreate inputs`;
        case "recover": {
            const node = graph.nodes.find((node) => node.id === destination.nodeId);
            const port =
                node?.kind === "craft"
                    ? node.inputs.find((port) => port.id === destination.inputId)?.name
                    : destination.inputId;
            return `Recover → ${node?.name ?? destination.nodeId} / ${port}`;
        }
        case "terminal":
            return `Finish → ${graph.outcomes.find((outcome) => outcome.id === destination.outcomeId)?.name ?? destination.outcomeId}`;
    }
}
export function graphBranchChance(
    result: CraftingGraphResult | undefined,
    nodeId: string,
    branchId: string,
) {
    const visits = result?.visits[nodeId];
    return visits?.visits ? (visits.branches[branchId] ?? 0) / visits.visits : null;
}
export const graphChanceWidth = (chance: number | null) => (chance === null ? 1.5 : 1 + 7 * chance);

export function graphContinueChance(result: CraftingGraphResult | undefined, node?: GraphNode) {
    if (!node) return null;
    if (node.kind === "acquire") return 1;
    if (!result?.visits[node.id]?.visits) return null;
    return [...node.branches, { id: "fallback", destination: node.fallback }]
        .filter((branch) => branch.destination.kind === "return")
        .reduce((total, branch) => total + (graphBranchChance(result, node.id, branch.id) ?? 0), 0);
}

export function layoutCraftingGraph(
    graph: CraftingGraph,
    heights: ReadonlyMap<string, number> = new Map(),
    widths: ReadonlyMap<string, number> = new Map(),
    spacing = { column: 240, row: 100 },
) {
    const levels = new Map<string, number>();
    const positions = new Map<string, { x: number; y: number }>();
    const rows = new Map<number, GraphNode[]>();
    for (const node of graphProductionOrder(graph)) {
        const rank = Math.max(-1, ...graphDependencies(node).map((id) => levels.get(id) ?? -1)) + 1;
        levels.set(node.id, rank);
        rows.set(rank, [...(rows.get(rank) ?? []), node]);
    }
    let x = 30;
    for (const [, nodes] of rows) {
        const centre = (node: GraphNode) => {
            const inputs = graphDependencies(node).map(
                (id) => positions.get(id)!.y + (heights.get(id) ?? 360) / 2,
            );
            return inputs.length ? inputs.reduce((a, b) => a + b, 0) / inputs.length : 0;
        };
        nodes.sort((a, b) => centre(a) - centre(b));
        let bottom = 30;
        for (const node of nodes) {
            const height = heights.get(node.id) ?? 360;
            const y = Math.max(bottom, centre(node) - height / 2);
            positions.set(node.id, { x, y });
            bottom = y + height + spacing.row;
        }
        x += Math.max(...nodes.map((node) => widths.get(node.id) ?? 320)) + spacing.column;
    }
    return positions;
}

function graphPreviewSource(graph: CraftingGraph, nodeId: string): CraftingItem | null {
    const seen = new Set<string>();
    const findBase = (id: string): CraftingItem | null => {
        if (seen.has(id)) return null;
        seen.add(id);
        const node = graph.nodes.find((node) => node.id === id);
        if (!node) return null;
        if (node.kind === "acquire") {
            const purchase = node.alternatives.find(
                (option) =>
                    option.kind === "purchase" &&
                    (node.choice.mode !== "pinned" || option.id === node.choice.alternativeId),
            );
            if (purchase?.kind === "purchase") return purchase.item;
        }
        for (const id of graphDependencies(node)) {
            const item = findBase(id);
            if (item) return item;
        }
        return null;
    };
    return findBase(nodeId);
}

export function graphPreviewBaseId(graph: CraftingGraph, nodeId: string, query?: ItemQuery) {
    const node = graph.nodes.find((node) => node.id === nodeId);
    if (!query && node?.kind === "acquire") return graphPreviewSource(graph, nodeId)?.baseId;
    const output = query ?? node?.output;
    const base = output?.groups
        .filter((group) => group.type === "and")
        .flatMap((group) => group.filters)
        .find((filter) => filter.kind === "base" && filter.field === "baseId");
    return base?.kind === "base" ? base.values[0] : graphPreviewSource(graph, nodeId)?.baseId;
}

export function graphPreviewItem(
    engine: CraftingEngine,
    graph: CraftingGraph,
    nodeId: string,
): CraftingItem | null {
    const node = graph.nodes.find((node) => node.id === nodeId)!;
    const source = graphPreviewSource(graph, nodeId);
    if (node.kind === "acquire" || !source) return source;
    const required = node.output.groups
        .filter((group) => group.type === "and")
        .flatMap((group) => group.filters);
    const base = required.find((filter) => filter.kind === "base" && filter.field === "baseId");
    const item = engine.createItem(
        base?.kind === "base" ? base.values[0]! : source.baseId,
        source.level,
    );
    const mods = required.flatMap((filter) =>
        filter.kind === "mod" && filter.ids?.length === 1 && (filter.count.min ?? 0) > 0
            ? filter.ids
            : [],
    );
    if (!mods.length) return null;
    return {
        ...item,
        rarity: mods.length ? "rare" : "normal",
        influences: source.influences,
        mods: [...new Set(mods)].map((id) => ({
            id,
            values: engine.mod(id).stats.map((stat) => stat.min),
            fractured: false,
            crafted: false,
        })),
    };
}
