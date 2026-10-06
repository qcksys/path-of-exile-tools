import { describe, expect, it, vi } from "vite-plus/test";
import { seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    validateProject,
} from "../app/lib/crafting-simulation";
import { craftingProjectSchema } from "../app/schemas/crafting";
import { pickModifier, retainedRevealFixture } from "./crafting-retained-reveal-fixtures";

describe.each(["poe1", "poe2"] as const)("%s crafting after a retained reveal", (game) => {
    const { catalog, engine, currency, offered, choice, blocker } = retainedRevealFixture(game);
    const added = () => engine.apply(offered, currency("add_mod_to_rare"), pickModifier(blocker));

    it("preserves offer eligibility through manual additions and reloads older pending items", () => {
        const before = structuredClone(offered);
        const legacy = structuredClone(offered);
        delete legacy.reveal!.offeredOn;
        const loaded = engine.validateItem(JSON.parse(JSON.stringify(legacy)));
        const added = engine.addStartingMod(loaded, blocker, seededRandom(4));
        expect(added.reveal!.choices).toEqual(offered.reveal!.choices);
        expect(added.reveal!.offeredOn?.mods).toEqual(offered.mods);
        expect(engine.selectableRevealChoices(added)).not.toContain(choice);
        const removed = engine.validateItem({
            ...added,
            mods: added.mods.filter((entry) => entry.id !== blocker),
        });
        expect(engine.selectableRevealChoices(removed)).toContain(choice);
        expect(removed.reveal).toEqual(added.reveal);
        expect(engine.validateItem(loaded)).toEqual(loaded);
        expect(offered).toEqual(before);
        expect(legacy.reveal!.offeredOn).toBeUndefined();
    });

    it("retains offers and their original eligibility when a later affix blocks a choice", () => {
        const before = structuredClone(offered);
        const result = added();
        expect(result.item.mods.some((entry) => entry.id === blocker)).toBe(true);
        expect(result.item.reveal!.choices).toEqual(offered.reveal!.choices);
        expect(result.item.reveal!.offeredOn?.mods).toEqual(offered.mods);
        expect(engine.revealProbabilities(result.item).get(choice)).toBe(1);
        expect(engine.selectableRevealChoices(result.item)).not.toContain(choice);
        expect(engine.selectableRevealChoices(result.item).length).toBeGreaterThan(0);
        const random = { pick: vi.fn(), integer: vi.fn() };
        expect(() => engine.chooseRevealed(result.item, choice, random)).toThrow("conflicts");
        expect(random.integer).not.toHaveBeenCalled();
        expect(
            engine.apply(
                result.item,
                { kind: "reveal", preferred: [choice], skipOnMiss: true },
                random,
            ),
        ).toEqual({ item: result.item, cost: [] });
        const fallback = engine.apply(
            result.item,
            { kind: "reveal", preferred: [choice] },
            seededRandom(1),
        );
        expect(fallback.item.reveal).toBeUndefined();
        expect(fallback.item.mods.some((entry) => entry.id === choice)).toBe(false);
        expect(fallback.item.mods.some((entry) => entry.id === blocker)).toBe(true);
        expect(offered).toEqual(before);
    });

    it("restores blocked choices after removing their blocker and clears offers when the veil is removed", () => {
        const item = added().item;
        const freed = engine.apply(item, currency("remove_random_mod"), pickModifier(blocker)).item;
        expect(freed.reveal!.choices).toEqual(offered.reveal!.choices);
        expect(freed.reveal!.offeredOn).toEqual(item.reveal!.offeredOn);
        expect(engine.selectableRevealChoices(freed)).toContain(choice);
        expect(
            engine.chooseRevealed(freed, choice, seededRandom(1)).mods.map((entry) => entry.id),
        ).toEqual([choice]);
        const removed = engine.apply(
            item,
            currency("remove_random_mod"),
            pickModifier(item.reveal!.mod),
        ).item;
        expect(removed.reveal).toBeUndefined();
        expect(removed.mods.map((entry) => entry.id)).toEqual([blocker]);
        const generated = engine.apply(
            item,
            { kind: "generate", id: "normal" },
            seededRandom(1),
        ).item;
        expect(generated.reveal).toBeUndefined();
    });

    it("persists the offer context and rejects unrelated or fabricated historical items", () => {
        const item = added().item;
        expect(engine.validateItem(JSON.parse(JSON.stringify(item)))).toEqual(item);
        expect(() => exportCraftingItemText(engine, item)).toThrow("Use JSON export");
        const wrongBase = Object.keys(catalog.bases).find((id) => id !== item.baseId)!;
        expect(() =>
            engine.validateItem({
                ...item,
                reveal: {
                    ...item.reveal,
                    offeredOn: { ...item.reveal!.offeredOn, baseId: wrongBase },
                },
            }),
        ).toThrow("same item base");
        expect(() =>
            engine.validateItem({ ...item, reveal: { ...item.reveal, choices: [] } }),
        ).toThrow("requires choices");
        expect(() =>
            engine.validateItem({
                ...item,
                reveal: { ...item.reveal, offeredOn: { ...item.reveal!.offeredOn, mods: [] } },
            }),
        ).toThrow();
    });

    it("calculates and samples an annul-then-reveal process without regenerating offers", () => {
        const item = added().item;
        const target = engine.validateTarget({ groups: [], unrevealedCount: { min: 0, max: 0 } });
        const annul = currency("remove_random_mod");
        expect(calculateExact(engine, item, annul, target).probability).toBe(0.5);
        const project = craftingProjectSchema.parse({
            format: 1,
            game,
            patch: catalog.patch,
            item,
            method: annul,
            target,
            useProcess: true,
            steps: [
                {
                    id: "annul",
                    method: annul,
                    condition: target,
                    onSuccess: "success",
                    onFailure: "reveal",
                },
                {
                    id: "reveal",
                    method: { kind: "reveal", preferred: [choice] },
                    condition: target,
                    onSuccess: "success",
                },
            ],
            prices: { [annul.id]: 2 },
            seed: 3,
            iterations: 100,
            maxActions: 2,
        });
        expect(validateProject(catalog, JSON.parse(JSON.stringify(project)))).toEqual(project);
        const exact = calculateProcessExact(engine, project);
        expect(exact).toMatchObject({ probability: 1, errors: {}, meanCost: 2, totalActions: 1.5 });
        const simulation = new CraftingSimulation(catalog, project);
        for (let trial = 0; trial < 100; trial++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({ probability: 1, errors: {}, meanCost: 2 });
        expect(simulation.result().totalActions / 100).toBeCloseTo(1.5, 0);
    });
});

it("rerolls Echoes against the current item and discards the superseded offer context", () => {
    const { engine, currency, offered, choice, blocker, omen } = retainedRevealFixture(
        "poe2",
        true,
    );
    const item = engine.apply(offered, currency("add_mod_to_rare"), pickModifier(blocker)).item;
    expect(item.reveal!.echoes?.remaining).toBe(1);
    const rerolled = engine.rerollReveal(item, seededRandom(4));
    expect(rerolled.reveal!.offeredOn?.mods).toEqual(item.mods);
    expect(rerolled.reveal!.offeredOn).not.toEqual(item.reveal!.offeredOn);
    expect(rerolled.reveal!.echoes?.remaining).toBe(0);
    expect(rerolled.reveal!.choices).not.toContain(choice);
    expect(engine.selectableRevealChoices(rerolled)).toEqual(rerolled.reveal!.choices);
    const automatic = engine.apply(
        item,
        { kind: "reveal", preferred: [choice], skipOnMiss: true, omens: [omen!.id] },
        seededRandom(4),
    );
    expect(automatic).toEqual({ item: rerolled, cost: [] });
});
