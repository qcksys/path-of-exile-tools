import { readFileSync } from "node:fs";
import { CraftingEngine, type CraftingRandom, seededRandom } from "../app/lib/crafting-engine";
import { craftingCatalogSchema } from "../app/schemas/crafting";

export const pickModifier = (id: string): CraftingRandom => ({
    pick: (choices) =>
        choices.find(
            ({ value }) =>
                value === id ||
                (typeof value === "object" && value !== null && "id" in value && value.id === id),
        )?.value ?? choices[0]!.value,
    integer: (min) => min,
});

export function retainedRevealFixture(game: "poe1" | "poe2", echoes = false) {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const engine = new CraftingEngine(catalog);
    const baseId = Object.entries(catalog.bases).find(
        ([, base]) => base.item_class === "Body Armour" && base.tags.includes("str_armour"),
    )![0];
    const currency = (action: string) => ({
        kind: "currency" as const,
        id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
    });
    const rare = engine.apply(
        engine.createItem(baseId),
        currency("transmute_to_rare"),
        seededRandom(3),
    ).item;
    const hidden = engine.apply(
        rare,
        currency(game === "poe1" ? "replace_rare_mod_veiled" : "abyssal_bench_ticket_armour"),
        seededRandom(11),
    ).item;
    hidden.mods = hidden.mods.filter((entry) => entry.id === hidden.reveal!.mod);
    const omen = catalog.crafting.currencies.find((entry) =>
        entry.id.endsWith("/OmenOnAbyssRerollOptions"),
    );
    for (let seed = 0; seed < 50; seed++) {
        const offered = engine.prepareReveal(
            hidden,
            { kind: "reveal", preferred: [], ...(echoes ? { omens: [omen!.id] } : {}) },
            seededRandom(seed),
        ).item;
        for (const choice of offered.reveal!.choices) {
            const blocker = engine
                .pool(offered)
                .find(({ mod }) =>
                    mod.groups.some((group) => engine.mod(choice).groups.includes(group)),
                );
            if (blocker)
                return {
                    game,
                    catalog,
                    engine,
                    currency,
                    offered,
                    choice,
                    blocker: blocker.id,
                    omen,
                };
        }
    }
    throw new Error("No extracted reveal offer with an ordinary conflicting modifier.");
}
