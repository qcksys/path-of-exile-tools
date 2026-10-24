import { expect, it } from "vite-plus/test";
import { delveMinionModifier } from "../app/lib/crafting-delve";
import { seededRandom } from "../app/lib/crafting-engine";
import { createCraftingItemQuery } from "../app/lib/crafting-item-query";
import { projectFromPreset } from "../app/lib/crafting-presets";
import { recombinationOutcomes } from "../app/lib/crafting-recombination";
import { rulesetReference } from "../app/lib/crafting-rulesets";
import { catalog, engine } from "./crafting-fixtures";
import { runGraphTrial } from "./crafting-graph-fixtures";
import { historyIndex, retainedRevision } from "./crafting-history-fixtures";
import { nnnBase } from "./crafting-nnn-fixtures";

const ruleset = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r12",
)!;

it("accepts prepared Delve minion boots without putting their modifier in ordinary rolls", () => {
    const boots = engine.addStartingMod(
        nnnBase("Leviathan Greaves"),
        delveMinionModifier,
        seededRandom(1),
    );
    expect(
        engine.pool({ ...boots, mods: [] }).some((entry) => entry.id === delveMinionModifier),
    ).toBe(false);
    expect(() =>
        engine.addStartingMod(nnnBase("Royal Burgonet"), delveMinionModifier, seededRandom(1)),
    ).toThrow("not available");
    expect(() =>
        engine.addStartingMod(
            { ...nnnBase("Leviathan Greaves"), level: 59 },
            delveMinionModifier,
            seededRandom(1),
        ),
    ).toThrow("not available");
    const outcomes = recombinationOutcomes(engine, boots, {
        ...nnnBase("Sorcerer Boots"),
        level: 1,
    });
    expect(outcomes.reduce((sum, entry) => sum + entry.weight, 0)).toBeCloseTo(1);
    expect(
        outcomes
            .filter(({ value }) => value.mods.some((mod) => mod.id === delveMinionModifier))
            .reduce((sum, entry) => sum + entry.weight, 0),
    ).toBeCloseTo(0.59);
    for (const outcome of outcomes)
        expect(engine.validateItem(outcome.value)).toEqual(outcome.value);
    expect(
        outcomes.some(
            ({ value }) =>
                value.level < 60 &&
                value.mods.some(
                    (mod) => mod.id === delveMinionModifier && mod.origin?.level === boots.level,
                ),
        ),
    ).toBe(true);
});

it("uses Pantheon fillers as non-native modifiers and keeps all five desired shield affixes", () => {
    const graph = projectFromPreset(engine, ruleset, "sushi-luminary-shield");
    const result = runGraphTrial(graph, seededRandom(42));
    expect(result.success).toBe(true);
    expect(engine.base(result.item!).name).toBe("Heat-attuned Tower Shield");
    expect(result.item!.mods.map((mod) => mod.id).sort()).toEqual(
        [
            "LocalIncreasedBlockPercentage6",
            "ShieldSpellBlockPercentage5",
            "ReducedExtraDamageFromCrits4__",
            "MaximumFireResist3",
            "RecoverLifePercentOnBlockUber1_",
        ].sort(),
    );
    const left = result.nodeItems!["receiver-aspect"]!;
    const right = result.nodeItems!["donor-aspect"]!;
    expect(
        [...left.mods, ...right.mods].filter(
            (mod) => engine.mod(mod.id).domain === "ducat_crafted",
        ),
    ).toHaveLength(2);
    const outcomes = recombinationOutcomes(engine, left, right);
    expect(outcomes.reduce((sum, entry) => sum + entry.weight, 0)).toBeCloseTo(1);
    for (const { value } of outcomes) {
        expect(value.mods.some((mod) => engine.mod(mod.id).domain === "ducat_crafted")).toBe(false);
        if (engine.base(value).name === "Heat-attuned Tower Shield") {
            expect(
                value.mods.some((mod) =>
                    ["Dexterity6", "IncreasedMana3", "LocalIncreasedEnergyShield3"].includes(
                        mod.id,
                    ),
                ),
            ).toBe(false);
        }
    }
    expect(result.spending[catalog.crafting.allflame!.sulphur]).toBeGreaterThan(0);
});

it("keeps a ready RF totem prefix instead of annulling it because of the base implicit", () => {
    const graph = projectFromPreset(engine, ruleset, "sushi-rf-totem-shield");
    const result = runGraphTrial(graph, seededRandom(42));
    expect(result.success).toBe(true);
    expect(result.visits["isolate-totem"]!.skipped).toBeGreaterThan(0);
    expect(result.item!.mods).toHaveLength(6);
    expect(result.item!.mods.map((mod) => mod.id)).toEqual(
        expect.arrayContaining([
            "MaximumTotemUber1",
            "ShieldSpellBlockPercentage6",
            "EinharMasterIncreasedLife4",
        ]),
    );
});

it("preserves the fractured mercenary suffix during fossil and Eldritch rerolls", () => {
    const graph = projectFromPreset(engine, ruleset, "sushi-mercenary-chest");
    const result = runGraphTrial(graph, seededRandom(42));
    expect(result.success).toBe(true);
    for (const item of Object.values(result.nodeItems!)) {
        expect(
            item.mods.find(
                (mod) =>
                    mod.id === "BreachBodyCriticalChanceIncreasedByUncappedLightningResistance1",
            )?.fractured,
        ).toBe(true);
    }
    expect(result.item!.mods.map((mod) => mod.id)).toEqual(
        expect.arrayContaining([
            "DelveAbyssJewelSocket1",
            "OnslaughtWhenHitNewEssence1",
            "EinharMasterIncreasedLife5_",
        ]),
    );
    expect(result.purchases).toBe(1);
    expect(result.visits.prefixes!.recovered).toBeGreaterThan(0);
});

it("requires elevated Spectre levels and T2+ resistance, not the weaker preparation mods", () => {
    const graph = projectFromPreset(engine, ruleset, "sushi-spectre-boots");
    const result = runGraphTrial(graph, seededRandom(42));
    expect(result.success).toBe(true);
    const query = createCraftingItemQuery(engine);
    const item = result.item!;
    expect(item.mods.map((mod) => mod.id)).toEqual(
        expect.arrayContaining([
            delveMinionModifier,
            "GlobalRaiseSpectreGemLevelUberMaven",
            "JunMasterVeiledMovementVelocityAndCannotBeChilled__",
        ]),
    );
    const weaker = {
        ...item,
        mods: item.mods.map((mod) =>
            mod.id === "GlobalRaiseSpectreGemLevelUberMaven"
                ? engine.rollMod("GlobalRaiseSpectreGemLevelUber1", seededRandom(1))
                : mod,
        ),
    };
    expect(query.matches(weaker, graph.outcomes[0]!.query)).toBe("no-match");
    expect(
        item.mods
            .filter((mod) => /^(Fire|Cold|Lightning)Resist/.test(mod.id))
            .every((mod) => mod.values[0]! >= 42),
    ).toBe(true);
});

it("retains r9 refusals while r10 executes the new mechanics from its immutable bundle", async () => {
    for (const id of ["sushi-spectre-boots", "sushi-luminary-shield"] as const) {
        const graph = projectFromPreset(engine, ruleset, id);
        graph.iterations = 1;
        for (const revision of ["r9", "r10"]) {
            const selected = historyIndex.revisions.find(
                (entry) => entry.game === "poe1" && entry.revision === revision,
            )!;
            const loaded = await retainedRevision(selected);
            const create = () =>
                loaded.runtime.createSimulation(
                    loaded.catalog,
                    { ...graph, ruleset: rulesetReference(selected) },
                    { estimateIterations: 1, workLimit: 10_000 },
                );
            if (revision === "r9" && id === "sushi-spectre-boots") {
                expect(create).toThrow("not available");
                continue;
            }
            const simulation = create();
            while (!simulation.done) simulation.runBatch();
            const result = simulation.result();
            if (revision === "r9") expect(Object.keys(result.errors)).toHaveLength(1);
            else {
                expect(result.errors).toEqual({});
                expect(result.probability).toBe(1);
                expect(result.trials).toBe(1);
            }
        }
    }
});
