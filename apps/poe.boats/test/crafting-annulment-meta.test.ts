import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { catalog, currency, engine } from "./crafting-fixtures";

const bow = Object.entries(catalog.bases).find(
    ([, entry]) => entry.item_class === "Bow" && entry.drop_level === 1,
)![0];
const blockAttacks = catalog.crafting.bench.find(
    (entry) =>
        entry.mod &&
        engine
            .mod(entry.mod)
            .stats.some((stat) => stat.id === "item_generation_cannot_roll_attack_affixes"),
)!;

/** How many of 20 annulments of a bow with an attack prefix and "Cannot roll Attack Modifiers" remove the prefix. */
function attackRemovals(patch: string) {
    const crafter = new CraftingEngine({ ...catalog, patch });
    const blank = { ...crafter.createItem(bow, 86), rarity: "rare" as const };
    const attack = crafter
        .pool(blank, { side: "prefix" })
        .find((entry) => entry.mod.implicit_tags.includes("attack"))!.id;
    const item = crafter.apply(
        crafter.addStartingMod(blank, attack, seededRandom(1)),
        { kind: "bench", id: blockAttacks.id },
        seededRandom(2),
    ).item;
    expect(item.mods.map((entry) => entry.id)).toEqual([attack, blockAttacks.mod]);
    return Array.from(
        { length: 20 },
        (_, seed) => crafter.apply(item, currency("remove_random_mod"), seededRandom(seed)).item,
    ).filter((result) => !result.mods.some((entry) => entry.id === attack)).length;
}

describe("Orb of Annulment with the attack and caster meta-mods", () => {
    it("never removes a blocked attack modifier before 3.30.0", () => {
        expect(attackRemovals("3.29.3.3")).toBe(0);
    });

    it("can remove a blocked attack modifier from 3.30.0", () => {
        expect(attackRemovals("3.30.0.1")).toBeGreaterThan(0);
    });
});
