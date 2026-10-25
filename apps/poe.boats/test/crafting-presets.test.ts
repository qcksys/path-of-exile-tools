import { describe, expect, it } from "vite-plus/test";
import { discoverGraphCraftingCosts } from "../app/lib/crafting-cost-inputs";
import { seededRandom } from "../app/lib/crafting-engine";
import { calculateCraftingGraph } from "../app/lib/crafting-graph-simulation";
import { createCraftingItemQuery } from "../app/lib/crafting-item-query";
import {
    craftingPresets,
    listCraftingPresets,
    projectFromPreset,
} from "../app/lib/crafting-presets";
import { craftingGraphSchema } from "../app/schemas/crafting-graph";
import { catalog, engine } from "./crafting-fixtures";
import { graphFixture, quote, runGraphTrial } from "./crafting-graph-fixtures";
import { historyIndex } from "./crafting-history-fixtures";

const ruleset = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r15",
)!;

describe("common crafting project presets", () => {
    for (const preset of craftingPresets) {
        const iterations =
            preset.id === "tailwind-boots" ? 1 : preset.id === "strength-helical-ring" ? 2 : 8;
        const workLimit = preset.id === "tailwind-boots" ? 250_000 : 100_000;
        const timeout = ["strength-helical-ring", "tailwind-boots", "sushi-rf-helmet"].includes(
            preset.id,
        )
            ? 30_000
            : 10_000;
        it(
            `${preset.name} produces its specified item through the real engine`,
            () => {
                const graph = projectFromPreset(engine, ruleset, preset.id);
                graph.iterations = iterations;
                const result = calculateCraftingGraph(catalog, graph, {
                    estimateIterations: 1,
                    workLimit,
                });
                expect(result.errors).toEqual({});
                expect(result.truncated).toBe(0);
                expect(result.trials).toBe(graph.iterations);
                expect(result.probability).toBe(1);
                expect(result.meanCost).toBeNull();
                expect(result.missingPrices.length).toBeGreaterThan(0);
                const matcher = createCraftingItemQuery(engine);
                for (const sample of result.samples) {
                    expect(sample.success).toBe(true);
                    expect(matcher.matches(sample.item!, graph.outcomes[0]!.query)).toBe("match");
                    if (preset.id === "tailwind-boots") {
                        expect(sample.item!.mods.map((mod) => mod.id)).toEqual(
                            expect.arrayContaining([
                                "TailwindOnCriticalStrikeInfluenceMaven_",
                                "OnslaughtOnKillInfluenceMaven",
                                "ElusiveOnCriticalStrikeInfluenceMaven",
                                "EinharMasterIncreasedLife4",
                            ]),
                        );
                        expect(
                            sample.item!.mods.some((mod) =>
                                mod.id.startsWith("JunMasterVeiledMovementVelocity"),
                            ),
                        ).toBe(true);
                        expect(sample.item!.mods).toHaveLength(6);
                        const annul = graph.nodes.find((node) => node.id === "suffix-annul")!;
                        if (annul.kind !== "craft") throw new Error("Expected annul step");
                        const lostSuffix = annul.branches[0]!;
                        expect(lostSuffix.destination).toMatchObject({
                            kind: "recover",
                            nodeId: "restore-awaken",
                        });
                        expect(matcher.matches(sample.item!, lostSuffix.query)).toBe("no-match");
                        for (const id of [
                            "TailwindOnCriticalStrikeInfluenceMaven_",
                            "OnslaughtOnKillInfluenceMaven",
                        ]) {
                            const damaged = {
                                ...sample.item!,
                                mods: sample.item!.mods.filter((mod) => mod.id !== id),
                            };
                            expect(matcher.matches(damaged, lostSuffix.query)).toBe("match");
                        }
                    }
                }
            },
            timeout,
        );
        it(
            `${preset.name} calculates its cost through the real engine`,
            () => {
                const graph = projectFromPreset(engine, ruleset, preset.id);
                graph.iterations = iterations;
                for (const node of graph.nodes) {
                    if (node.kind === "acquire") {
                        for (const alternative of node.alternatives)
                            if (alternative.kind === "purchase") alternative.price = quote(10);
                    }
                }
                for (const cost of discoverGraphCraftingCosts(engine, graph))
                    graph.prices[cost.id] ??= quote(1);
                const priced = calculateCraftingGraph(catalog, graph, {
                    estimateIterations: 1,
                    workLimit,
                });
                expect(priced.missingPrices).toEqual([]);
                expect(priced.meanCost).toBeGreaterThan(10);
                expect(priced.errors).toEqual({});
            },
            timeout,
        );
    }
    it("creates independent drafts and keeps PoE 1 mechanics out of PoE 2", () => {
        const first = projectFromPreset(engine, ruleset, "physical-bow");
        const second = projectFromPreset(engine, ruleset, "physical-bow");
        expect(first.id).not.toBe(second.id);
        first.nodes[0]!.name = "Edited donor";
        expect(second.nodes[0]!.name).not.toBe("Edited donor");
        expect(listCraftingPresets("poe2")).toEqual([]);
        expect(() =>
            projectFromPreset(engine, { ...ruleset, game: "poe2" }, "physical-bow"),
        ).toThrow("unavailable");
    });
    it("labels prepared energy-shield chest purchases with their NNN essence modifier", () => {
        const graph = projectFromPreset(engine, ruleset, "energy-shield-chest");
        const purchases = graph.nodes.flatMap((node) =>
            node.kind === "acquire"
                ? node.alternatives.flatMap((alternative) =>
                      alternative.kind === "purchase" ? [{ node, alternative }] : [],
                  )
                : [],
        );
        expect(purchases).toHaveLength(5);
        for (const { node, alternative } of purchases)
            expect(alternative.name).toBe(
                alternative.id === "buy-magic" ? `${node.name} (Magic)` : node.name,
            );
        const prepared = purchases.filter(({ alternative }) => alternative.item.mods.length === 2);
        expect(prepared).toHaveLength(2);
        for (const { alternative } of prepared) {
            expect(alternative.name).toContain(" + NNN ");
        }
    });
    it("defaults only the nine recombination presets to explicit zero-cost self-service", () => {
        const affected = [
            "life-block-shield",
            "es-block-shield",
            "physical-bow",
            "elemental-bow",
            "suppression-chest",
            "global-defence-chest",
            "rarity-helmet",
            "energy-shield-chest",
            "sushi-luminary-shield",
        ];
        for (const preset of craftingPresets) {
            const graph = projectFromPreset(engine, ruleset, preset.id);
            if (affected.includes(preset.id)) {
                expect(graph.prices).toEqual({ "service:recombine": quote(0) });
                expect(preset.description).toContain(
                    "Recombination assumes self-service at 0 chaos, excluding gold and dust opportunity cost.",
                );
            } else {
                expect(graph.prices).toEqual({});
                expect(preset.description).not.toContain("self-service");
            }
        }
    });
    it("charges a saved nonzero recombination override on every attempt", () => {
        const graph = projectFromPreset(engine, ruleset, "physical-bow");
        for (const node of graph.nodes)
            if (node.kind === "acquire")
                for (const alternative of node.alternatives)
                    if (alternative.kind === "purchase") alternative.price = quote(10);
        const selfService = runGraphTrial(graph, seededRandom(1));
        expect(selfService.missingPrices).toEqual([]);
        expect(selfService.cost).toBe(selfService.purchases * 10);
        graph.prices["service:recombine"] = quote(7);
        const saved = craftingGraphSchema.parse(JSON.parse(JSON.stringify(graph)));
        const paid = runGraphTrial(saved, seededRandom(1));
        expect(paid.missingPrices).toEqual([]);
        expect(paid.spending["service:recombine"]).toBeGreaterThan(1);
        expect(paid.spending).toEqual(selfService.spending);
        expect(paid.cost).toBe(selfService.cost! + paid.spending["service:recombine"]! * 7);
        expect(saved.prices["service:recombine"]).toEqual(quote(7));
        projectFromPreset(engine, ruleset, "physical-bow");
        expect(graph.prices["service:recombine"]).toEqual(quote(7));
    });
    it("keeps a custom graph's missing recombination price unknown", () => {
        const graph = graphFixture();
        delete graph.prices["service:recombine"];
        const result = runGraphTrial(graph, seededRandom(1));
        expect(result.missingPrices).toEqual(["service:recombine"]);
        expect(result.cost).toBeNull();
        expect(graph.prices).toEqual({});
    });
});
