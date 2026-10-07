import { craftingGraphSchema } from "../schemas/crafting-graph";
import { loadCraftingRevision } from "./crafting-ruleset-loader";
import {
    CRAFTING_RULESET_INDEX_URL,
    craftingImplementationUrl,
    resolveRuleset,
    validateRulesetGraph,
    validateRulesetIndex,
    verifyCraftingArtifact,
} from "./crafting-rulesets";
import type { HistoricalCraftingRuntime } from "./crafting-runtime";

const worker = self as unknown as {
    onmessage: ((event: MessageEvent) => void) | null;
    postMessage(message: unknown): void;
};
let job = 0;

worker.onmessage = async (event: MessageEvent) => {
    const current = ++job;
    const requestId = String(event.data.requestId ?? current);
    if (event.data.type === "cancel") return;
    try {
        const graph = craftingGraphSchema.parse(event.data.graph);
        const response = await fetch(CRAFTING_RULESET_INDEX_URL, { cache: "no-cache" });
        if (!response.ok) throw new Error("Crafting revisions are unavailable.");
        const index = validateRulesetIndex(await response.json());
        const ruleset = resolveRuleset(index, graph.game, graph.ruleset);
        validateRulesetGraph(ruleset, graph);
        const read = async (path: string) => {
            const response = await fetch(path, { cache: "force-cache" });
            if (!response.ok) throw new Error("The retained crafting artifact is unavailable.");
            return new Uint8Array(await response.arrayBuffer());
        };
        const { catalog, runtime } = await loadCraftingRevision(ruleset, read, async (entry) => {
            const path = craftingImplementationUrl(entry);
            await verifyCraftingArtifact(await read(path), entry.implementation);
            const url = new URL(path, self.location.origin).href;
            const implementation: HistoricalCraftingRuntime = await import(/* @vite-ignore */ url);
            return implementation;
        });
        if (current !== job) return;
        if (event.data.type === "catalog") {
            worker.postMessage({ requestId, type: "catalog", catalog });
            return;
        }
        const simulation = runtime.createSimulation(catalog, graph, event.data.options);
        let lastUpdate = 0;
        while (current === job) {
            const done = simulation.runBatch();
            if (done || Date.now() - lastUpdate >= 100) {
                worker.postMessage({
                    requestId,
                    type: done ? "done" : "progress",
                    result: simulation.result(),
                });
                lastUpdate = Date.now();
            }
            if (done) return;
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    } catch (error) {
        if (current === job)
            worker.postMessage({
                requestId,
                type: "error",
                error: error instanceof Error ? error.message : String(error),
            });
    }
};
