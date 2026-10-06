// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { LastChanges } from "../app/components/crafting/last-changes";
import { modifierChanges } from "../app/lib/crafting-changes";
import { CraftingEngine, type CraftingRandom, seededRandom } from "../app/lib/crafting-engine";
import { modifierTiers } from "../app/lib/crafting-modifier-details";
import { rolledModText } from "../app/lib/crafting-text";
import { craftingCatalogSchema, craftingItemSchema } from "../app/schemas/crafting";

afterEach(cleanup);

const minimum: CraftingRandom = { pick: (choices) => choices[0]!.value, integer: (min) => min };
const maximum: CraftingRandom = {
    pick: (choices) => choices.at(-1)!.value,
    integer: (_, max) => max,
};

for (const game of ["poe1", "poe2"] as const) {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const engine = new CraftingEngine(catalog);
    const base = Object.entries(catalog.bases).find(
        ([, base]) =>
            ["Ring", "Amulet"].includes(base.item_class) &&
            base.implicits.some((id) =>
                catalog.mods[id]!.stats.some((stat) => stat.id === "base_maximum_life"),
            ),
    )![0];
    const empty = engine.createItem(base);
    const life = engine.addStartingMod(empty, "IncreasedLife1", minimum);
    const cold = engine.addStartingMod(life, "ColdResist1", minimum);
    const details = () => within(screen.getByRole("region", { name: "Last changes" }));

    describe(`${game} modifier changes`, () => {
        it("reports additions and removals without mutating snapshots or counting reordered modifiers", () => {
            const original = structuredClone(cold);
            expect(modifierChanges(engine, life, cold)).toEqual([
                { key: "mods:after:1", kind: "mods", before: undefined, after: cold.mods[1] },
            ]);
            expect(modifierChanges(engine, cold, life)).toEqual([
                { key: "mods:before:1", kind: "mods", before: cold.mods[1] },
            ]);
            expect(
                modifierChanges(engine, cold, { ...cold, mods: [...cold.mods].reverse() }),
            ).toEqual([]);
            expect(modifierChanges(engine, cold, craftingItemSchema.parse(cold))).toEqual([]);
            expect(cold).toEqual(original);
        });

        it("shows the prior and current values for rerolls, including build tiers and tags", () => {
            const rerolled = engine.apply(
                life,
                {
                    kind: "currency",
                    id: catalog.crafting.currencies.find(
                        (entry) => entry.action === "reroll_mod_values",
                    )!.id,
                },
                maximum,
            ).item;
            const changes = modifierChanges(engine, life, rerolled);
            expect(changes).toHaveLength(1);
            expect(changes[0]).toMatchObject({ before: life.mods[0], after: rerolled.mods[0] });
            render(<LastChanges engine={engine} before={life} after={rerolled} />);
            expect(details().getByText("Changed")).toBeDefined();
            expect(details().getByText("Before")).toBeDefined();
            expect(details().getByText("After")).toBeDefined();
            expect(details().getByText(rolledModText(catalog, life.mods[0]!, life)!)).toBeDefined();
            expect(
                details().getByText(rolledModText(catalog, rerolled.mods[0]!, rerolled)!),
            ).toBeDefined();
            const tier = modifierTiers(engine, base).get("IncreasedLife1");
            expect(screen.getByRole("region", { name: "Last changes" }).textContent).toContain(
                `Tier ${tier}`,
            );
            expect(screen.getByRole("region", { name: "Last changes" }).textContent).toContain(
                `Tags: ${catalog.mods.IncreasedLife1!.implicit_tags.join(", ")}`,
            );
        });

        it("shows contextual catalyst changes even when raw explicit and implicit rolls are unchanged", () => {
            const catalyst = catalog.crafting.catalysts.find((entry) =>
                entry.tags.includes(game === "poe1" ? "resource" : "life"),
            )!;
            const before = engine.addStartingMod(empty, "IncreasedLife1", maximum);
            const after = engine.validateItem({
                ...before,
                catalyst: { id: catalyst.id, quality: 20 },
            });
            const changes = modifierChanges(engine, before, after);
            expect(changes.map((change) => change.kind)).toEqual(["mods", "implicits"]);
            expect(changes.every((change) => change.before && change.after)).toBe(true);
            expect(after.mods).toEqual(before.mods);
            expect(after.implicits).toEqual(before.implicits);
            render(<LastChanges engine={engine} before={before} after={after} />);
            expect(details().getAllByText("Changed")).toHaveLength(2);
            expect(
                details().getByText(rolledModText(catalog, before.mods[0]!, before)!),
            ).toBeDefined();
            expect(
                details().getByText(rolledModText(catalog, after.mods[0]!, after)!),
            ).toBeDefined();
        });

        it("pairs identical duplicate occurrences before comparing changed occurrences", () => {
            const first = empty.implicits[0]!;
            const second = { ...first, values: first.values.map((value) => value + 1) };
            const third = { ...first, values: first.values.map((value) => value + 2) };
            const before = { ...empty, implicits: [first, second] };
            const reordered = { ...empty, implicits: [second, first] };
            expect(modifierChanges(engine, before, reordered)).toEqual([]);
            const changed = modifierChanges(engine, before, {
                ...empty,
                implicits: [second, third],
            });
            expect(changed).toHaveLength(1);
            expect(changed[0]).toMatchObject({ before: first, after: third, kind: "implicits" });
            expect(modifierChanges(engine, before, { ...empty, implicits: [second] })).toEqual([
                { key: "implicits:before:0", kind: "implicits", before: first },
            ]);
        });

        it("reports different tiers as a removed modifier and an added modifier", () => {
            const upgraded = engine.addStartingMod(empty, "IncreasedLife2", seededRandom(1));
            const changes = modifierChanges(engine, life, upgraded);
            expect(changes).toHaveLength(2);
            expect(changes[0]).toMatchObject({ before: undefined, after: upgraded.mods[0] });
            expect(changes[1]).toMatchObject({ before: life.mods[0] });
            render(<LastChanges engine={engine} before={life} after={upgraded} />);
            expect(details().getByText("Added")).toBeDefined();
            expect(details().getByText("Removed")).toBeDefined();
            expect(details().queryByText("Changed")).toBeNull();
        });

        it("does not invent modifier changes for item-level edits or a pending Allflame choice", () => {
            const after = { ...life, level: 85 };
            expect(modifierChanges(engine, life, after)).toEqual([]);
            expect(modifierChanges(engine, life, { ...life, allflameCopies: [cold] })).toEqual([]);
            render(<LastChanges engine={engine} before={life} after={after} />);
            expect(details().getByText("No modifier changes.")).toBeDefined();
        });

        it("identifies modifier-status changes independently of their displayed numeric values", () => {
            const changed = {
                ...life,
                mods: life.mods.map((mod) =>
                    game === "poe1" ? { ...mod, fractured: true } : { ...mod, sanctification: 100 },
                ),
            };
            expect(modifierChanges(engine, life, changed)).toHaveLength(1);
            render(<LastChanges engine={engine} before={life} after={changed} />);
            expect(details().getByText("Changed")).toBeDefined();
            expect(screen.getByRole("region", { name: "Last changes" }).textContent).toContain(
                game === "poe1" ? " · fractured" : " · Sanctification 100%",
            );
        });

        it("labels destruction without inventing removed modifiers for a retained snapshot", () => {
            render(
                <LastChanges engine={engine} before={life} after={{ ...life, destroyed: true }} />,
            );
            expect(details().getByText("Item destroyed.")).toBeDefined();
            expect(details().getByText("No modifier changes.")).toBeDefined();
            expect(details().queryByText("Removed")).toBeNull();
        });
    });

    if (game === "poe1")
        it("separates extracted Harvest enchantments from explicit modifiers", () => {
            const armour = engine.createItem("Metadata/Items/Armours/BodyArmours/BodyStr1");
            const enchanted = engine.apply(
                armour,
                { kind: "harvest", id: "LifeBodyEnchant" },
                seededRandom(1),
            ).item;
            expect(modifierChanges(engine, armour, enchanted)).toEqual([
                {
                    key: "enchantments:after:0",
                    kind: "enchantments",
                    before: undefined,
                    after: enchanted.enchantments![0],
                },
            ]);
            render(<LastChanges engine={engine} before={armour} after={enchanted} />);
            expect(details().getByText("Added")).toBeDefined();
            expect(screen.getByRole("region", { name: "Last changes" }).textContent).toContain(
                "Enchantment",
            );
        });
}
