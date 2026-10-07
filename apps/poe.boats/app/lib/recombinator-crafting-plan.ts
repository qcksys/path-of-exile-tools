import { type ItemCondition, itemQuerySchema } from "@poe-tools/item-query";
import type { z } from "zod";
import type { CraftingMethod } from "../schemas/crafting";
import { craftingGraphSchema, type GraphCraftNode } from "../schemas/crafting-graph";
import type { CraftingRuleset } from "../schemas/crafting-rulesets";
import type { RecombinatorCatalog } from "../schemas/recombinator-catalog";
import type { recombinatorCraftingPlanSchema } from "../schemas/recombinator-crafting";
import type { CraftingEngine } from "./crafting-engine";
import { projectFromItem } from "./crafting-graph-authoring";
import { materializeRecombinatorInput } from "./recombinator-crafting";
import { parseRecombinatorDraft } from "./recombinator-plan";

export function projectFromRecombinatorPlan(
    engine: CraftingEngine,
    catalog: RecombinatorCatalog,
    ruleset: CraftingRuleset,
    input: z.infer<typeof recombinatorCraftingPlanSchema>,
) {
    const plan = parseRecombinatorDraft(input.draft, catalog);
    if (!plan.steps.some((step) => step.id === input.finalStep))
        throw new Error("Choose an existing recombination as the final step.");
    const ids = new Set(input.draft.items.map((entry) => entry.id));
    if (Object.keys(input.inputs).some((id) => !ids.has(id)))
        throw new Error("A prepared input refers to an item outside this plan.");
    const prepared = input.draft.items.map((selection) => {
        const choice = input.inputs[selection.id];
        if (!choice)
            throw new Error(`Choose a concrete base, rarity and rolls for ${selection.name}.`);
        return materializeRecombinatorInput(engine, catalog, {
            source: input.source,
            selection,
            ...choice,
        });
    });
    const graph = projectFromItem(ruleset, prepared[0]!, "Recombination plan");
    graph.nodes = input.draft.items.map((selection, index) => ({
        kind: "acquire",
        id: `item-${index}`,
        name: selection.name,
        output: itemQuerySchema.parse({ game: "poe1" }),
        choice: { mode: "pinned", alternativeId: "buy" },
        alternatives: [
            {
                kind: "purchase",
                id: "buy",
                name: `${selection.name} · ${input.inputs[selection.id]!.rolls} rolls`,
                item: prepared[index]!,
                price: null,
            },
        ],
    }));
    const sources = new Map(input.draft.items.map((entry, index) => [entry.id, `item-${index}`]));
    const any = itemQuerySchema.parse({ game: "poe1" });
    function craft(
        id: string,
        name: string,
        method: CraftingMethod,
        inputs: GraphCraftNode["inputs"],
        applyWhen?: GraphCraftNode["applyWhen"],
    ) {
        graph.nodes.push({
            kind: "craft",
            id,
            name,
            method,
            inputs,
            output: any,
            applyWhen,
            branches: [],
            ordering: "manual",
            fallback: { kind: "return" },
        });
        return id;
    }
    for (const [index, step] of input.draft.steps.entries()) {
        const ports = (["left", "right"] as const).map((side) => {
            let source = sources.get(step[side])!;
            const recipeId = step[`${side}Preparation`];
            if (recipeId) {
                const recipe = catalog.recipes?.find((entry) => entry.id === recipeId);
                if (!recipe) throw new Error(`${step.name}: preparation recipe is unavailable.`);
                if (recipe.kind === "essence")
                    throw new Error(
                        `${step.name}: idealized essence preparation cannot be transferred as an actual reroll. Prepare this donor in the crafting graph with explicit outcomes and costs.`,
                    );
                source = craft(
                    `step-${index}-${side}-bench`,
                    `${step.name} · ${side} bench`,
                    engine.validateMethod({ kind: "bench", id: recipe.id }),
                    [{ id: "item", name: "Item", source }],
                );
            }
            return { id: side, name: side === "left" ? "Left item" : "Right item", source };
        });
        let source = craft(
            `step-${index}`,
            step.name,
            { kind: "recombine", id: "recombine" },
            ports,
        );
        if (step.removeCrafted) {
            const remove = engine.catalog.crafting.bench.find(
                (recipe) =>
                    recipe.action === 0 &&
                    !recipe.mod &&
                    !recipe.enchantment &&
                    !recipe.socketCount &&
                    !recipe.linkCount,
            );
            if (!remove) throw new Error("This catalog does not provide crafted modifier removal.");
            source = craft(
                `step-${index}-remove`,
                `${step.name} · remove crafted modifiers`,
                { kind: "bench", id: remove.id },
                [{ id: "item", name: "Item", source }],
                itemQuerySchema.parse({
                    game: "poe1",
                    groups: [
                        {
                            type: "and",
                            filters: [{ kind: "mod", crafted: true, count: { min: 1 } }],
                        },
                    ],
                }),
            );
        }
        sources.set(step.id, source);
    }
    graph.entry = sources.get(input.finalStep)!;
    const modifiers = [...new Set(input.required)].map((id) => {
        const mod = catalog.mods.find((entry) => `poe1:${entry.id}` === id);
        if (!mod) throw new Error("Resolve custom target modifiers before transferring the plan.");
        return mod;
    });
    const filters: ItemCondition[] = modifiers.map((mod) => ({
        kind: "mod",
        ids: [mod.id],
        count: { min: 1 },
    }));
    if (input.exact)
        for (const side of ["prefixes", "suffixes"] as const) {
            const count = modifiers.filter((mod) => mod.side === side).length;
            filters.push({ kind: "range", field: side, value: { min: count, max: count } });
        }
    if (input.requiredBase !== "any") {
        const bases = input.draft.items.flatMap((entry, index) =>
            entry.catalog?.base.id === input.requiredBase ? [prepared[index]!.baseId] : [],
        );
        if (!bases.length) throw new Error("Choose a target base represented by a prepared input.");
        filters.push({ kind: "base", field: "baseId", values: [...new Set(bases)] });
    }
    graph.outcomes[0]!.name = "Recombination target";
    graph.outcomes[0]!.query = itemQuerySchema.parse({
        game: "poe1",
        groups: filters.length ? [{ type: "and", filters }] : [],
    });
    return craftingGraphSchema.parse(graph);
}
