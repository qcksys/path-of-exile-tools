import { itemQuerySchema } from "@poe-tools/item-query";
import { describe, expect, it } from "vite-plus/test";
import { seededRandom } from "../app/lib/crafting-engine";
import { CraftingGraphTrial } from "../app/lib/crafting-graph-trial";
import { createCraftingItemQuery } from "../app/lib/crafting-item-query";
import { projectFromPreset } from "../app/lib/crafting-presets";
import { currency, engine } from "./crafting-fixtures";
import { historyIndex, retainedRevision } from "./crafting-history-fixtures";

const ring = () =>
    engine.createItem(
        Object.entries(engine.catalog.bases).find(([, base]) => base.name === "Helical Ring")![0],
        86,
    );
const current = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r7",
)!;
describe("memory-strand graph crafting", () => {
    it("matches strand thresholds and measures spending from the imprint, without inventing a missing checkpoint", () => {
        const matcher = createCraftingItemQuery(engine);
        const query = itemQuerySchema.parse({
            game: "poe1",
            groups: [
                {
                    type: "and",
                    filters: [{ kind: "range", field: "memoryStrandsSpent", value: { max: 10 } }],
                },
            ],
        });
        const item = { ...ring(), memoryStrands: 80 };
        expect(matcher.matches(item, query)).toBe("unknown");
        expect(matcher.matches({ ...item, memoryStrands: 70, imprint: item }, query)).toBe("match");
        expect(matcher.matches({ ...item, memoryStrands: 69, imprint: item }, query)).toBe(
            "no-match",
        );
        expect(matcher.record(ring()).facts.memoryStrands).toBe(0);
    });
    it("preserves essence Strength while Unravelling eligible natural tiers", () => {
        const essence = engine.catalog.crafting.essences.find(
            (entry) => entry.name === "Deafening Essence of Rage",
        )!;
        let item = engine.addStartingMod(ring(), essence.mods.Ring!, seededRandom(1), "essence");
        item = engine.addStartingMod(item, "ChaosResist4", seededRandom(2));
        item.memoryStrands = 80;
        const result = engine.apply(
            item,
            currency("consume_zana_influence_upgrade_mods"),
            seededRandom(1),
        );
        expect(result.item.mods.find((mod) => mod.id === essence.mods.Ring)).toEqual(item.mods[0]);
        expect(result.item.memoryStrands).toBeUndefined();
        expect(
            result.item.mods.some((mod) =>
                ["ChaosResist4", "ChaosResist5", "ChaosResist6"].includes(mod.id),
            ),
        ).toBe(true);
    });
    it("restores consumed imprints, preserves the base and returns complete rings across misses", () => {
        const graph = projectFromPreset(engine, current, "strength-helical-ring");
        const visited = new Set<string>();
        for (const seed of [0, 1, 3]) {
            const trial = new CraftingGraphTrial(engine, graph, seededRandom(seed), {
                trace: true,
            });
            while (!trial.done) trial.advance();
            const result = trial.result();
            expect(result.error).toBeNull();
            expect(result.success).toBe(true);
            expect(result.purchases).toBe(1);
            expect(engine.counts(result.item!)).toMatchObject({ prefixes: 1, suffixes: 4 });
            expect(result.nodeItems?.["base-imprint"]?.memoryStrands).toBeGreaterThanOrEqual(70);
            for (const trace of result.trace)
                if (trace.destination?.kind === "recover") visited.add(trace.nodeId);
        }
        for (const node of [
            "restore-strands",
            "restore-strength",
            "augment-annul",
            "restore-augment",
            "restore-regal",
            "restore-chaos",
        ])
            expect(visited.has(node)).toBe(true);
    }, 10_000);
    it("keeps r5 executable and refuses new strand conditions in its old query schema", async () => {
        const old = historyIndex.revisions.find(
            (entry) => entry.game === "poe1" && entry.revision === "r5",
        )!;
        const loaded = await retainedRevision(old);
        const graph = projectFromPreset(engine, current, "strength-helical-ring");
        expect(() =>
            loaded.runtime.createSimulation(loaded.catalog, { ...graph, ruleset: old }),
        ).toThrow();
    });
});
