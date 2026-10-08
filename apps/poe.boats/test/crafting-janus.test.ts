import { expect, it } from "vite-plus/test";
import { seededRandom } from "../app/lib/crafting-engine";
import { janusRarityModifier } from "../app/lib/crafting-janus";
import { recombinationOutcomes } from "../app/lib/crafting-recombination";
import { engine } from "./crafting-fixtures";
import { nnnBase } from "./crafting-nnn-fixtures";

it("accepts purchased Janus helmets but never rolls the mod from ordinary or generic unveiled pools", () => {
    const helmet = nnnBase("Hubris Circlet");
    expect(engine.addStartingMod(helmet, janusRarityModifier, seededRandom(1)).mods[0]!.id).toBe(
        janusRarityModifier,
    );
    expect(engine.pool(helmet).some((mod) => mod.id === janusRarityModifier)).toBe(false);
    expect(
        engine.pool(helmet, { domain: "unveiled" }).some((mod) => mod.id === janusRarityModifier),
    ).toBe(false);
    expect(engine.revealedModifiers(helmet).some((mod) => mod.id === janusRarityModifier)).toBe(
        true,
    );
    for (const invalid of [nnnBase("Slink Gloves"), { ...helmet, level: 59 }])
        expect(() => engine.addStartingMod(invalid, janusRarityModifier, seededRandom(1))).toThrow(
            "not available",
        );
});

it("transfers Janus to another helmet as an exclusive modifier, retaining its origin level", () => {
    const donor = engine.addStartingMod(
        nnnBase("Hubris Circlet"),
        janusRarityModifier,
        seededRandom(1),
    );
    const outcomes = recombinationOutcomes(engine, donor, { ...nnnBase("Leather Cap"), level: 1 });
    expect(outcomes.reduce((sum, outcome) => sum + outcome.weight, 0)).toBeCloseTo(1);
    expect(
        outcomes
            .filter(({ value }) => value.mods.some((mod) => mod.id === janusRarityModifier))
            .reduce((sum, outcome) => sum + outcome.weight, 0),
    ).toBeCloseTo(0.59);
    for (const { value } of outcomes) expect(engine.validateItem(value)).toEqual(value);
    const transferred = outcomes.find(({ value }) =>
        value.mods.some((mod) => mod.id === janusRarityModifier),
    )!.value;
    expect(transferred.mods.find((mod) => mod.id === janusRarityModifier)!.origin).toMatchObject({
        kind: "recombine",
        level: 86,
    });
    expect(() =>
        recombinationOutcomes(engine, transferred, nnnBase("Hubris Circlet")),
    ).not.toThrow();
});
