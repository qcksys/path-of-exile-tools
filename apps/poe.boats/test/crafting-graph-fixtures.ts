import { itemQuerySchema } from "@poe-tools/item-query";
import { type CraftingRandom, seededRandom } from "../app/lib/crafting-engine";
import { CraftingGraphTrial } from "../app/lib/crafting-graph-trial";
import { CRAFTING_GRAPH_ENGINE, validateCraftingGraph } from "../app/lib/crafting-graph-validation";
import { craftingItemSchema } from "../app/schemas/crafting";
import { type CraftingGraph, craftingGraphSchema } from "../app/schemas/crafting-graph";
import { baseId, catalog, engine } from "./crafting-fixtures";

export const anyItem = itemQuerySchema.parse({ game: "poe1" });
export const queryMods = (...ids: string[]) =>
    itemQuerySchema.parse({
        game: "poe1",
        groups: [
            {
                type: "and",
                filters: ids.map((id) => ({ kind: "mod", ids: [id] })),
            },
        ],
    });
const blank = { ...engine.createItem(baseId, 86), rarity: "rare" as const };
export const firstMod = engine
    .pool(blank)
    .find((entry) => engine.mod(entry.id).generation_type === "prefix")!.id;
export const firstItem = engine.addStartingMod(blank, firstMod, seededRandom(1));
export const secondMod = engine
    .pool(firstItem)
    .find((entry) => engine.mod(entry.id).generation_type === "prefix")!.id;
export const secondItem = engine.addStartingMod(blank, secondMod, seededRandom(2));
export const quote = (amount: number) => ({
    amount,
    currency: "chaos",
    source: "manual" as const,
    confidence: null,
});

export function graphFixture(): CraftingGraph {
    return craftingGraphSchema.parse({
        format: 1,
        id: "graph",
        name: "Two donor recovery",
        game: catalog.game,
        ruleset: {
            era: "3.29",
            revision: "r7",
            engine: CRAFTING_GRAPH_ENGINE,
            patch: catalog.patch,
            manifestSha256: catalog.manifestSha256,
            craftingSha256: catalog.craftingSha256,
        },
        nodes: [
            {
                kind: "acquire",
                id: "a",
                name: "First donor",
                output: queryMods(firstMod),
                alternatives: [
                    {
                        kind: "purchase",
                        id: "buy",
                        name: "Buy first donor",
                        item: firstItem,
                        price: quote(10),
                    },
                ],
            },
            {
                kind: "acquire",
                id: "b",
                name: "Second donor",
                output: queryMods(secondMod),
                alternatives: [
                    {
                        kind: "purchase",
                        id: "buy",
                        name: "Buy second donor",
                        item: secondItem,
                        price: quote(20),
                    },
                ],
            },
            {
                kind: "craft",
                id: "combine",
                name: "Combine donors",
                output: queryMods(firstMod, secondMod),
                inputs: [
                    { id: "left", name: "First donor", source: "a" },
                    { id: "right", name: "Second donor", source: "b" },
                ],
                method: { kind: "recombine", id: "recombine" },
                branches: [
                    {
                        id: "first",
                        name: "Recover first",
                        query: queryMods(firstMod),
                        destination: { kind: "recover", nodeId: "combine", inputId: "left" },
                    },
                    {
                        id: "second",
                        name: "Recover second",
                        query: queryMods(secondMod),
                        destination: { kind: "recover", nodeId: "combine", inputId: "right" },
                    },
                    {
                        id: "both",
                        name: "Both modifiers",
                        query: queryMods(firstMod, secondMod),
                        destination: { kind: "return" },
                    },
                ],
                fallback: { kind: "discard" },
            },
        ],
        entry: "combine",
        outcomes: [{ id: "goal", name: "Both modifiers", query: queryMods(firstMod, secondMod) }],
        prices: { "service:recombine": quote(1) },
        iterations: 10,
        maxSteps: 100,
    });
}

export function selectedOutcomes(...modifierSets: string[][]): CraftingRandom {
    return {
        integer: (min) => min,
        pick: (choices) => {
            const ids = modifierSets.shift();
            if (!ids) throw new Error("Unexpected extra random decision.");
            const choice = choices.find(({ value, weight }) => {
                const item = craftingItemSchema.safeParse(value);
                return (
                    weight > 0 &&
                    item.success &&
                    item.data.mods.length === ids.length &&
                    ids.every((id) => item.data.mods.some((mod) => mod.id === id))
                );
            });
            if (!choice)
                throw new Error("Requested outcome is not possible in the real crafting engine.");
            return choice.value;
        },
    };
}

export function runGraphTrial(graph: CraftingGraph, random: CraftingRandom) {
    const trial = new CraftingGraphTrial(engine, validateCraftingGraph(catalog, graph), random, {
        trace: true,
    });
    while (!trial.done) trial.advance();
    return trial.result();
}
