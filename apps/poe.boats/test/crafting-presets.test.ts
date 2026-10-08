import { describe, expect, it } from "vite-plus/test";
import { calculateCraftingGraph } from "../app/lib/crafting-graph-simulation";
import { createCraftingItemQuery } from "../app/lib/crafting-item-query";
import {
    craftingPresets,
    listCraftingPresets,
    projectFromPreset,
} from "../app/lib/crafting-presets";
import { catalog, engine } from "./crafting-fixtures";
import { historyIndex } from "./crafting-history-fixtures";

const ruleset = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r6",
)!;

describe("common crafting project presets", () => {
    for (const preset of craftingPresets) {
        it(
            `${preset.name} produces its specified item through the real engine`,
            () => {
                const graph = projectFromPreset(engine, ruleset, preset.id);
                graph.iterations =
                    preset.id === "tailwind-boots"
                        ? 1
                        : preset.id === "strength-helical-ring"
                          ? 2
                          : 8;
                const result = calculateCraftingGraph(catalog, graph, {
                    estimateIterations: 1,
                    workLimit: preset.id === "tailwind-boots" ? 250_000 : 100_000,
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
                const quote = {
                    amount: 1,
                    currency: "chaos",
                    source: "manual",
                    confidence: null,
                } as const;
                for (const node of graph.nodes) {
                    if (node.kind === "acquire") {
                        for (const alternative of node.alternatives)
                            if (alternative.kind === "purchase")
                                alternative.price = { ...quote, amount: 10 };
                    }
                }
                graph.prices = Object.fromEntries(
                    result.missingPrices
                        .filter((id) => !id.startsWith("purchase:"))
                        .map((id) => [id, quote]),
                );
                const priced = calculateCraftingGraph(catalog, graph, {
                    estimateIterations: 1,
                    workLimit: preset.id === "tailwind-boots" ? 250_000 : 100_000,
                });
                expect(priced.missingPrices).toEqual([]);
                expect(priced.meanCost).toBeGreaterThan(10);
                expect(priced.errors).toEqual({});
            },
            ["strength-helical-ring", "tailwind-boots"].includes(preset.id) ? 30_000 : 10_000,
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
});
