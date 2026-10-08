import { type ItemCondition, type ItemQuery, itemQuerySchema } from "@poe-tools/item-query";
import type { CraftingItem, CraftingMethod } from "../schemas/crafting";
import type { CraftingGraph, GraphCraftNode } from "../schemas/crafting-graph";
import type { CraftingGraphResult } from "../schemas/crafting-graph-result";
import type { SimpleCraftCapability, SimpleCraftGoal } from "../schemas/crafting-smart";
import { type CraftingEngine, seededRandom } from "./crafting-engine";
import { baseQualityLimit, catalystLimit } from "./crafting-quality";
import { socketLimit } from "./crafting-sockets";

const onceActions: Record<string, string> = {
    transmute_to_magic: "Upgrade a normal item to magic",
    transmute_to_rare: "Upgrade to rare",
    upgrade_magic_to_rare: "Upgrade a magic item to rare and add a modifier",
    convert_to_normal: "Remove unprotected modifiers",
};

export function simpleCraftCapability(
    engine: CraftingEngine,
    method: CraftingMethod,
    item?: CraftingItem | null,
): SimpleCraftCapability | null {
    const data = engine.catalog.crafting;
    let effect: string;
    let target: SimpleCraftCapability["target"] = null;
    if (method.kind === "currency" && !method.allflame && !method.omens?.length) {
        const action = data.currencies.find((entry) => entry.id === method.id)?.action;
        const quality = data.baseQuality.find((entry) => entry.id === method.id);
        const mapQuality = data.mapQuality.find((entry) => entry.id === method.id);
        const catalyst = data.catalysts.find((entry) => entry.id === method.id);
        if (action === "apply_zana_influence") {
            effect = "Roll 10–100 memory strands on normal equipment";
            target = { field: "memoryStrands", maximum: 100, suggested: 70 };
        } else if (quality || mapQuality) {
            const maximum =
                mapQuality?.maximumQuality ??
                (quality!.corrupted
                    ? quality!.maximumQuality
                    : item
                      ? baseQualityLimit(engine.catalog, item)
                      : quality!.maximumQuality);
            effect = quality?.corrupted ? "Reroll quality" : "Increase quality";
            target = {
                field: "quality",
                maximum: Math.max(1, maximum),
                suggested: Math.max(1, maximum),
            };
        } else if (catalyst) {
            effect = "Increase this catalyst's quality";
            const maximum = item ? catalystLimit(engine.catalog, item) : 20;
            target = { field: "catalystQuality", maximum, suggested: maximum };
        } else if (
            action === "add_equipment_socket" ||
            action === "reroll_socket_numbers_hellscape"
        ) {
            effect = action === "add_equipment_socket" ? "Add a socket" : "Add or remove a socket";
            const maximum = item
                ? socketLimit(engine.catalog, item, item.level)
                : engine.catalog.game === "poe1"
                  ? 6
                  : 7;
            target = {
                field: "sockets",
                maximum: Math.max(1, maximum),
                suggested: Math.max(1, maximum),
            };
        } else if (action && onceActions[action]) effect = onceActions[action];
        else return null;
    } else if (method.kind === "bench") {
        const recipe = data.bench.find((entry) => entry.id === method.id);
        if (!recipe?.socketCount && !recipe?.linkCount) return null;
        effect = recipe.socketCount
            ? `Set ${recipe.socketCount} sockets`
            : `Link ${recipe.linkCount} sockets`;
    } else return null;
    let available: boolean | null = null;
    let reason: string | null = null;
    if (item) {
        try {
            // These actions have deterministic eligibility; a single dry run uses the engine's guards.
            engine.apply(item, method, seededRandom(0));
            available = true;
        } catch (error) {
            available = false;
            reason = error instanceof Error ? error.message : String(error);
        }
    }
    return { effect, target, available, reason };
}

export function simpleCraftRouting(
    engine: CraftingEngine,
    node: GraphCraftNode,
    goal: SimpleCraftGoal,
) {
    const capability = simpleCraftCapability(engine, node.method);
    if (!capability) throw new Error("This method requires custom outcome rules.");
    if (node.inputs.length !== 1) throw new Error("Simple crafts consume one input item.");
    const any = itemQuerySchema.parse({ game: engine.catalog.game });
    if (goal.kind === "once")
        return {
            output: any,
            applyWhen: undefined,
            branches: [],
            ordering: "manual" as const,
            fallback: { kind: "return" as const },
        };
    if (!capability.target || capability.target.field !== goal.field)
        throw new Error("This target cannot be produced by the selected craft.");
    const filters: ItemCondition[] = [
        { kind: "range", field: goal.field, value: { min: goal.value } },
    ];
    if (node.method.kind === "currency") {
        const id = node.method.id;
        if (goal.field === "catalystQuality")
            filters.push({ kind: "base", field: "catalystId", values: [id] });
        if (
            goal.field === "quality" &&
            engine.catalog.crafting.mapQuality.some((entry) => entry.id === id)
        )
            filters.push({ kind: "base", field: "qualityType", values: [id] });
    }
    const output: ItemQuery = { ...any, groups: [{ type: "and", filters }] };
    return {
        output,
        applyWhen: {
            ...any,
            groups: [{ type: "count" as const, filters, value: { max: filters.length - 1 } }],
        },
        branches: [
            {
                id: "smart-success",
                name: `Reached minimum ${goal.field}: ${goal.value}`,
                query: output,
                destination: { kind: "return" as const },
            },
        ],
        ordering: "manual" as const,
        fallback: { kind: "recover" as const, nodeId: node.id, inputId: node.inputs[0]!.id },
    };
}

export function validateSimpleCraftInput(
    engine: CraftingEngine,
    node: GraphCraftNode,
    item: CraftingItem,
) {
    if (!node.smart) return;
    const capability = simpleCraftCapability(engine, node.method, item);
    if (!capability || capability.available === false)
        throw new Error(capability?.reason ?? "This craft has no simple outcome definition.");
    if (
        node.smart.kind === "minimum" &&
        (!capability.target || node.smart.value > capability.target.maximum)
    )
        throw new Error("The requested minimum exceeds what this craft can reach on this input.");
}

export function configureSimpleCraft(
    engine: CraftingEngine,
    node: GraphCraftNode,
    goal: SimpleCraftGoal,
): GraphCraftNode {
    return {
        ...node,
        smart: goal,
        ...simpleCraftRouting(engine, node, goal),
        inputs: node.inputs.map((port) => ({
            ...port,
            query: itemQuerySchema.parse({ game: engine.catalog.game }),
        })),
    };
}

export function graphCraftInput(
    graph: CraftingGraph,
    node: GraphCraftNode,
    result?: CraftingGraphResult,
): CraftingItem | null {
    const source = graph.nodes.find((entry) => entry.id === node.inputs[0]?.source);
    if (source?.kind === "acquire") {
        const alternatives = source.alternatives.filter(
            (entry) => source.choice.mode !== "pinned" || source.choice.alternativeId === entry.id,
        );
        if (alternatives.length === 1 && alternatives[0]?.kind === "purchase")
            return alternatives[0].item;
    }
    return source
        ? (result?.samples.find((sample) => sample.nodeItems?.[source.id])?.nodeItems?.[
              source.id
          ] ?? null)
        : null;
}
