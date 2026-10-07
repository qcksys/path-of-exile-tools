import { z } from "zod";
import { CraftingEngine } from "~/lib/crafting-engine";
import { projectFromItem } from "~/lib/crafting-graph-authoring";
import { exportCraftingItemText } from "~/lib/crafting-item-text";
import { materializeRecombinatorInput } from "~/lib/recombinator-crafting";
import { projectFromRecombinatorPlan } from "~/lib/recombinator-crafting-plan";
import {
    recombinatorCraftingInputSchema,
    recombinatorCraftingPlanSchema,
} from "~/schemas/recombinator-crafting";
import { CraftingGraphContract } from "./crafting-contracts";
import { OperationError } from "./errors";
import { defineOperation } from "./operation";

export const recombinatorCraftingOperations = [
    defineOperation({
        family: "crafting",
        ui: "/1/recombinator",
        access: "public",
        readOnly: true,
        method: "post",
        path: "/graph/from-recombinator",
        name: "create_crafting_graph_from_recombinator_plan",
        description:
            "Convert connected catalog recombination steps and bench preparation into an editable crafting graph with distinct acquisition inputs. Requires concrete bases and roll assumptions. Preserves final-step targets and conditional crafted-mod removal; prices remain unknown. Idealized essence preparation and manual probability flags are refused rather than silently changing their semantics. Returns a draft without saving.",
        input: recombinatorCraftingPlanSchema,
        output: z.object({ graph: CraftingGraphContract }),
        execute: async (input, context) => {
            const [catalog, crafting, index] = await Promise.all([
                context.loadCatalog(),
                context.loadWorkbenchCatalog("poe1"),
                context.loadCraftingRulesets(),
            ]);
            try {
                const ruleset = index.revisions.find(
                    (entry) =>
                        entry.game === "poe1" &&
                        entry.manifestSha256 === crafting.manifestSha256 &&
                        entry.craftingSha256 === crafting.craftingSha256 &&
                        index.latest.some(
                            (latest) =>
                                latest.game === entry.game &&
                                latest.era === entry.era &&
                                latest.revision === entry.revision,
                        ),
                );
                if (!ruleset) throw new Error("This catalog has no published crafting revision.");
                const graph = projectFromRecombinatorPlan(
                    new CraftingEngine(crafting),
                    catalog,
                    ruleset,
                    input,
                );
                const loaded = await context.loadCraftingRevision(ruleset);
                loaded.runtime.createSimulation(loaded.catalog, graph, { workLimit: 1 });
                return { graph };
            } catch (error) {
                throw new OperationError(
                    error instanceof Error ? error.message : "Cannot transfer this plan.",
                    400,
                );
            }
        },
    }),
    defineOperation({
        family: "crafting",
        ui: "/1/recombinator",
        access: "public",
        readOnly: true,
        method: "post",
        path: "/items/from-recombinator",
        name: "create_crafting_graph_from_recombinator_input",
        description:
            "Prepare one catalog-selected recombinator input as a crafting graph acquisition. Requires an explicit concrete base, rarity and minimum/maximum roll assumption. Preserves canonical modifiers and item level, refuses unresolved custom text or probability flags, and leaves purchase price unknown. Returns a preview without saving; recombination steps and conditional preparation recipes are not imported.",
        input: recombinatorCraftingInputSchema,
        output: z.object({ graph: CraftingGraphContract, itemText: z.string() }),
        execute: async (input, context) => {
            const [catalog, crafting, index] = await Promise.all([
                context.loadCatalog(),
                context.loadWorkbenchCatalog("poe1"),
                context.loadCraftingRulesets(),
            ]);
            try {
                const engine = new CraftingEngine(crafting);
                const item = materializeRecombinatorInput(engine, catalog, input);
                const ruleset = index.revisions.find(
                    (entry) =>
                        entry.game === "poe1" &&
                        entry.manifestSha256 === crafting.manifestSha256 &&
                        entry.craftingSha256 === crafting.craftingSha256 &&
                        index.latest.some(
                            (latest) =>
                                latest.game === entry.game &&
                                latest.era === entry.era &&
                                latest.revision === entry.revision,
                        ),
                );
                if (!ruleset) throw new Error("This catalog has no published crafting revision.");
                const graph = projectFromItem(ruleset, item, `${input.selection.name} preparation`);
                const node = graph.nodes[0]!;
                if (node.kind !== "acquire") throw new Error("Expected an acquisition.");
                node.name = `Prepared input · ${input.rolls} rolls`;
                node.choice = { mode: "pinned", alternativeId: "buy" };
                const loaded = await context.loadCraftingRevision(ruleset);
                loaded.runtime.createSimulation(loaded.catalog, graph, { workLimit: 1 });
                return { graph, itemText: exportCraftingItemText(engine, item) };
            } catch (error) {
                if (error instanceof OperationError) throw error;
                throw new OperationError(
                    error instanceof Error ? error.message : "Cannot prepare this input.",
                    400,
                );
            }
        },
    }),
];
