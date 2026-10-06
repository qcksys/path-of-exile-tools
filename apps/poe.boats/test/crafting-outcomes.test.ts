import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { CraftingAffixDistribution } from "~/lib/crafting-distributions";
import { CraftingEngine, seededRandom } from "~/lib/crafting-engine";
import { modifierTiers } from "~/lib/crafting-modifier-details";
import {
    CraftingSimulation,
    calculateProcessExact,
    validateProject,
} from "~/lib/crafting-simulation";
import { craftingCatalogSchema, craftingProjectSchema } from "~/schemas/crafting";
import { catalog } from "./crafting-fixtures";

const catalogs = [
    catalog,
    craftingCatalogSchema.parse(
        JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
    ),
];

describe.each(catalogs)("$game outcome retention and distributions", (data) => {
    const engine = new CraftingEngine(data);
    const base = Object.entries(data.bases).find(
        ([, entry]) => entry.item_class === "Body Armour" && !entry.implicits.length,
    )![0];
    const currency = data.crafting.currencies.find(
        (entry) => entry.action === "remove_random_mod",
    )!;
    const method = { kind: "currency", id: currency.id } as const;
    const any = engine.validateTarget({ groups: [] });
    const itemWith = (id: string) =>
        engine.addStartingMod(engine.createItem(base), id, seededRandom(1));
    function project() {
        const item = engine.addStartingMod(
            { ...itemWith("IncreasedLife1"), rarity: "rare" },
            "ColdResist1",
            seededRandom(1),
        );
        return craftingProjectSchema.parse({
            format: 1,
            game: data.game,
            patch: data.patch,
            item,
            method,
            target: { groups: [{ mods: ["IncreasedLife1"] }] },
            steps: [],
            prices: { [currency.id]: 2 },
            seed: 42,
            iterations: 40,
            maxActions: 10,
        });
    }
    function run(input = project()) {
        const simulation = new CraftingSimulation(data, input);
        while (!simulation.done) simulation.runTrial();
        return simulation.result();
    }

    it("retains the first successes up to the cap without changing any trial or cost", () => {
        const input = project();
        const baseline = run({ ...input, sampleStorage: { mode: "all", limit: 100 } });
        const result = run({
            ...input,
            sampleStorage: { mode: "successes", limit: 2 },
            successDistribution: true,
        });
        expect(result.samples).toEqual(
            baseline.samples.filter((sample) => sample.success).slice(0, 2),
        );
        expect(result.successes).toBeGreaterThan(2);
        expect(result).toMatchObject({
            probability: baseline.probability,
            trials: baseline.trials,
            successes: baseline.successes,
            spending: baseline.spending,
            meanCost: baseline.meanCost,
            affixes: baseline.affixes,
            totalActions: baseline.totalActions,
            interval: baseline.interval,
        });
        expect(result.successDistribution).toHaveLength(1);
        expect(result.successDistribution![0]).toMatchObject({
            modId: "IncreasedLife1",
            side: "prefix",
            count: result.successes,
            items: result.successes,
        });
        expect(result.affixes.ColdResist1).toBeGreaterThan(0);
    });

    it("can disable storage while keeping statistics across every success", () => {
        const input = { ...project(), successDistribution: true };
        const baseline = run(input);
        const result = run({ ...input, sampleStorage: { mode: "none", limit: 1 } });
        expect(result.samples).toEqual([]);
        expect(result.successDistribution).toEqual(baseline.successDistribution);
        expect(result.successes).toBe(baseline.successes);
        expect(result.spending).toEqual(baseline.spending);
    });

    it("retains failures in all-outcome mode and preserves legacy previews", () => {
        const input = project();
        const all = run({ ...input, sampleStorage: { mode: "all", limit: 40 } });
        const capped = run({ ...input, sampleStorage: { mode: "all", limit: 2 } });
        expect(capped.samples).toEqual(all.samples.slice(0, 2));
        expect(all.samples.some((sample) => !sample.success)).toBe(true);
        const legacy = run(input);
        expect(legacy.samples).toHaveLength(10);
        expect(legacy.samples.some((sample) => sample.success)).toBe(true);
        expect(legacy.sampleStorage).toBeUndefined();
        expect(legacy.successDistribution).toBeUndefined();
    });

    it("groups multiple tiers and uses the same build-derived tier ranks as the item card", () => {
        const distribution = new CraftingAffixDistribution(engine);
        const low = itemWith("IncreasedLife1");
        const top = itemWith(data.game === "poe1" ? "IncreasedLife12" : "IncreasedLife13");
        distribution.add(low);
        const first = distribution.result();
        distribution.add(top);
        distribution.add(top);
        const ranks = modifierTiers(engine, base);
        expect(distribution.result()).toHaveLength(1);
        expect(distribution.result()[0]).toMatchObject({
            count: 3,
            items: 3,
            ranked: 3,
            tierTotal: ranks.get("IncreasedLife1")! + 2,
        });
        expect(first[0]!.count).toBe(1);
    });

    it("keeps essence tier ranks separate and excludes destroyed outcomes", () => {
        const distribution = new CraftingAffixDistribution(engine);
        const item = itemWith("IncreasedLife1");
        distribution.add(item);
        distribution.add({ ...item, mods: item.mods.map((mod) => ({ ...mod, essence: true })) });
        distribution.add({ ...item, destroyed: true });
        const rows = distribution.result();
        expect(rows).toHaveLength(2);
        expect(rows.every((row) => row.count === 1 && row.items === 1)).toBe(true);
        const essence = rows.find((row) => row.essence)!;
        const rank = modifierTiers(engine, base, "essence").get("IncreasedLife1");
        expect(essence.ranked).toBe(rank === undefined ? 0 : 1);
        expect(essence.tierTotal).toBe(rank ?? 0);
    });

    it("counts presence once when multiple observed modifiers belong to the same family", () => {
        const distribution = new CraftingAffixDistribution(engine);
        const item = itemWith("IncreasedLife1");
        distribution.add({ ...item, mods: [...item.mods, ...item.mods] });
        expect(distribution.result()[0]).toMatchObject({ count: 2, items: 1, ranked: 2 });
    });

    it("does not retain failed or unfinished processes as successes", () => {
        const input = project();
        input.useProcess = true;
        input.sampleStorage = { mode: "successes", limit: 100 };
        input.successDistribution = true;
        input.steps = [{ id: "check", condition: any, onSuccess: "failure", onFailure: "failure" }];
        expect(run(input)).toMatchObject({ successes: 0, samples: [], successDistribution: [] });
        input.steps = [
            { id: "check", method, condition: any, onSuccess: "finish", onFailure: "failure" },
            { id: "finish", condition: any, onSuccess: "success", onFailure: "failure" },
        ];
        input.simulationLimit = { kind: "actions", count: 1 };
        const unfinished = run(input);
        expect(unfinished).toMatchObject({
            trials: 0,
            successes: 0,
            samples: [],
            successDistribution: [],
        });
        expect(unfinished.unfinished).toBeDefined();
    });

    it("keeps timeout statistics but excludes their items from successful storage", () => {
        const input = project();
        input.useProcess = true;
        input.steps = [{ id: "loop", condition: any, onSuccess: "loop", onFailure: "failure" }];
        input.maxActions = 1;
        input.sampleStorage = { mode: "successes", limit: 5 };
        input.successDistribution = true;
        expect(run(input)).toMatchObject({
            timeouts: 40,
            successes: 0,
            samples: [],
            successDistribution: [],
        });
    });

    it("roundtrips options, rejects invalid caps, and leaves exact calculations unchanged", () => {
        const input = project();
        input.useProcess = true;
        input.steps = [
            {
                id: "annul",
                method,
                condition: input.target,
                onSuccess: "success",
                onFailure: "failure",
            },
        ];
        const exact = calculateProcessExact(engine, input);
        input.sampleStorage = { mode: "successes", limit: 2 };
        input.successDistribution = true;
        expect(validateProject(data, JSON.parse(JSON.stringify(input)))).toEqual(input);
        expect(calculateProcessExact(engine, input)).toEqual(exact);
        for (const limit of [0, 1.5, 1001])
            expect(() =>
                validateProject(data, { ...input, sampleStorage: { mode: "all", limit } }),
            ).toThrow();
        expect(() =>
            validateProject(data, { ...input, sampleStorage: { mode: "invalid", limit: 1 } }),
        ).toThrow();
    });
});
