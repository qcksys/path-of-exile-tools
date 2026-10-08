import { describe, expect, it } from "vite-plus/test";
import { graphPreviewRequest } from "../app/hooks/use-graph-preview";
import { seededRandom } from "../app/lib/crafting-engine";
import {
    graphBranchChance,
    graphChanceWidth,
    graphContinueChance,
    graphPreviewItem,
    graphQueryText,
    layoutCraftingGraph,
} from "../app/lib/crafting-graph-presentation";
import { CraftingGraphSimulation } from "../app/lib/crafting-graph-simulation";
import { CraftingGraphTrial } from "../app/lib/crafting-graph-trial";
import { graphDependencies } from "../app/lib/crafting-graph-validation";
import { createCraftingItemQuery } from "../app/lib/crafting-item-query";
import { projectFromPreset } from "../app/lib/crafting-presets";
import { recombinationOutcomes } from "../app/lib/crafting-recombination";
import { craftingGraphResultSchema } from "../app/schemas/crafting-graph-result";
import { engine } from "./crafting-fixtures";
import { graphFixture } from "./crafting-graph-fixtures";
import { historyIndex } from "./crafting-history-fixtures";

const ruleset = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r6",
)!;
describe("crafting graph presentation", () => {
    it("automatically samples every helical stage with actual modifiers and branch frequencies", () => {
        const graph = {
            ...projectFromPreset(engine, ruleset, "strength-helical-ring"),
            iterations: 3,
        };
        const request = graphPreviewRequest(graph);
        const simulation = new CraftingGraphSimulation(
            engine.catalog,
            request.graph,
            request.options,
        );
        while (!simulation.done) simulation.runBatch();
        const result = simulation.result();
        expect(result.errors).toEqual({});
        expect(result.complete).toBe(true);
        for (const node of graph.nodes) {
            expect(
                result.samples.some((sample) => sample.nodeItems?.[node.id]),
                node.id,
            ).toBe(true);
            if (node.kind === "craft") {
                expect(result.visits[node.id]?.visits, node.id).toBeGreaterThan(0);
                const branches = result.visits[node.id]!.branches;
                expect(Object.values(branches).reduce((sum, count) => sum + count, 0)).toBe(
                    result.visits[node.id]!.visits,
                );
            }
        }
        const samples = result.samples[0]!.nodeItems!;
        const rage = engine.catalog.crafting.essences.find(
            (entry) => entry.name === "Deafening Essence of Rage",
        )!;
        expect(samples.strength!.mods.some((mod) => mod.id === rage.mods.Ring)).toBe(true);
        expect(samples["pre-regal-imprint"]!.mods.map((mod) => mod.id)).toContain("AllAttributes4");
        expect(samples.hunter!.mods.length).toBe(5);
    }, 30_000);
    it("places every source before its consumer, spaces measured nodes and ignores recovery cycles", () => {
        const graph = projectFromPreset(engine, ruleset, "energy-shield-chest");
        const heights = new Map(graph.nodes.map((node, index) => [node.id, 400 + index * 35]));
        const widths = new Map(graph.nodes.map((node) => [node.id, 520]));
        const positions = layoutCraftingGraph(graph, heights, widths);
        for (const node of graph.nodes) {
            for (const source of graphDependencies(node))
                expect(positions.get(source)!.x + widths.get(source)!).toBeLessThan(
                    positions.get(node.id)!.x,
                );
            for (const other of graph.nodes) {
                if (
                    node.id === other.id ||
                    positions.get(node.id)!.x !== positions.get(other.id)!.x
                )
                    continue;
                const first = positions.get(node.id)!;
                const second = positions.get(other.id)!;
                expect(
                    first.y + heights.get(node.id)! <= second.y ||
                        second.y + heights.get(other.id)! <= first.y,
                ).toBe(true);
            }
        }
        expect(layoutCraftingGraph(graph, heights, widths)).toEqual(positions);
    });
    it("distinguishes unknown chance from zero and scales lines by routed frequency", () => {
        const result = craftingGraphResultSchema.parse({
            kind: "sampled-graph",
            complete: true,
            stopReason: "complete",
            phase: "final",
            nodeId: null,
            work: 1,
            trials: 1,
            requestedTrials: 1,
            meanCost: null,
            costInterval: null,
            meanRevenue: null,
            meanProfit: null,
            meanActions: null,
            observedCost: null,
            probability: 1,
            interval: [0, 1],
            outcomes: [],
            missingPrices: [],
            unpricedSales: [],
            excludedRecovery: 0,
            truncated: 0,
            errors: {},
            acquisitions: {},
            estimates: [],
            visits: {
                pair: { visits: 10, matches: { hit: 9 }, branches: { hit: 3 }, recovered: 7 },
            },
            spending: {},
            samples: [],
            unfinished: null,
        });
        expect(graphBranchChance(undefined, "pair", "hit")).toBeNull();
        expect(graphBranchChance(result, "pair", "hit")).toBe(0.3);
        expect(graphBranchChance(result, "pair", "fallback")).toBe(0);
        expect(graphChanceWidth(0.8)).toBeGreaterThan(graphChanceWidth(0.2));
        const graph = graphFixture();
        const craft = graph.nodes.find((node) => node.kind === "craft")!;
        result.visits[craft.id] = {
            visits: 10,
            matches: {},
            branches: { both: 3, first: 7 },
            recovered: 7,
        };
        expect(graphContinueChance(undefined, craft)).toBeNull();
        expect(graphContinueChance(result, craft)).toBe(0.3);
        expect(
            graphContinueChance(result, { ...craft, branches: [], fallback: { kind: "discard" } }),
        ).toBe(0);
        expect(graphContinueChance(result, graph.nodes[0])).toBe(1);
    });
    it("keeps prepared items exact and marks required output through query text", () => {
        const graph = graphFixture();
        const preview = graphPreviewItem(engine, graph, "a")!;
        expect(preview.mods).toHaveLength(1);
        expect(graphQueryText(engine, graph.nodes[0]!.output).join(" ")).toContain(
            engine.mod(preview.mods[0]!.id).text!,
        );
    });
    it("records actual items at visited nodes only when collecting sample traces", () => {
        const graph = projectFromPreset(engine, ruleset, "life-block-shield");
        for (const trace of [true, false]) {
            const trial = new CraftingGraphTrial(engine, graph, seededRandom(42), { trace });
            while (!trial.done) trial.advance();
            const result = trial.result();
            expect(result.error).toBeNull();
            if (trace) expect(result.nodeItems?.[graph.entry]).toEqual(result.item);
            else expect(result.nodeItems).toBeUndefined();
        }
    });
    it("uses overlapping 2p + 2p with a higher final merge chance than 2p + 1p", () => {
        const graph = projectFromPreset(engine, ruleset, "physical-bow");
        const donors = graph.nodes.flatMap((node) =>
            node.kind === "acquire"
                ? node.alternatives.flatMap((option) =>
                      option.kind === "purchase" ? [option.item] : [],
                  )
                : [],
        );
        const [a, b, c] = donors;
        const left = { ...a!, mods: [...a!.mods, ...b!.mods] };
        const right = { ...a!, mods: [...a!.mods, ...c!.mods] };
        const matcher = createCraftingItemQuery(engine);
        const chance = (other: typeof left) =>
            recombinationOutcomes(engine, left, other)
                .filter(
                    (outcome) =>
                        matcher.matches(outcome.value, graph.outcomes[0]!.query) === "match",
                )
                .reduce((sum, outcome) => sum + outcome.weight, 0);
        expect(chance(right)).toBeGreaterThan(chance(c!));
        const finish = graph.nodes.find((node) => node.id === "finish")!;
        expect(finish.kind === "craft" && finish.inputs.map((input) => input.source)).toEqual([
            "pair",
            "second-pair",
        ]);
    });
    it("uses NNN prefixes to improve pair preparation without retaining them on the ES base", () => {
        const graph = projectFromPreset(engine, ruleset, "energy-shield-chest");
        const donors = graph.nodes.flatMap((node) =>
            node.kind === "acquire"
                ? node.alternatives.flatMap((option) =>
                      option.kind === "purchase" ? [option.item] : [],
                  )
                : [],
        );
        const first = donors[0]!;
        const second = donors[1]!;
        const nnn = second.mods.filter((mod) => mod.essence).map((mod) => mod.id);
        expect(nnn.length).toBeGreaterThan(0);
        const target = graph.nodes.find((node) => node.id === "pair")!.output;
        const matcher = createCraftingItemQuery(engine);
        const chance = (item: typeof second) =>
            recombinationOutcomes(engine, first, item)
                .filter((outcome) => matcher.matches(outcome.value, target) === "match")
                .reduce((sum, outcome) => sum + outcome.weight, 0);
        expect(chance(second)).toBeGreaterThan(
            chance({ ...second, mods: second.mods.filter((mod) => !mod.essence) }),
        );
        expect(
            recombinationOutcomes(engine, first, second).every(({ value }) =>
                value.mods.every((mod) => !nnn.includes(mod.id)),
            ),
        ).toBe(true);
    });
});
