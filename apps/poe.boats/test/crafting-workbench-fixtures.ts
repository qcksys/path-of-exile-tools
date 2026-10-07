import { readFileSync } from "node:fs";
import { CraftingEngine } from "../app/lib/crafting-engine";
import { craftingCatalogSchema, craftingProjectSchema } from "../app/schemas/crafting";
import { baseId, catalog, engine } from "./crafting-fixtures";

const poe2 = craftingCatalogSchema.parse(
    JSON.parse(
        readFileSync(new URL("../public/game-data/crafting-poe2.json", import.meta.url), "utf8"),
    ),
);
export const workbenchCatalog = (game: "poe1" | "poe2") => (game === "poe1" ? catalog : poe2);
export function workbenchProject(game: "poe1" | "poe2") {
    const data = workbenchCatalog(game);
    const engine = new CraftingEngine(data);
    const base = Object.keys(data.bases).find(
        (id) =>
            data.bases[id]!.item_class === "Ring" && data.bases[id]!.rarities.includes("normal"),
    )!;
    const currency = data.crafting.currencies.find(
        (entry) => entry.action === "transmute_to_magic",
    )!;
    return craftingProjectSchema.parse({
        format: 1,
        game,
        patch: data.patch,
        item: engine.createItem(base, 86),
        method: { kind: "currency", id: currency.id },
        target: { groups: [], rarity: "magic" },
        steps: [
            {
                id: "transmute",
                method: { kind: "currency", id: currency.id },
                condition: { groups: [], rarity: "magic" },
            },
        ],
        prices: { [currency.id]: 2 },
        baseCost: 10,
        seed: 42,
        iterations: 3,
        maxActions: 10,
    });
}

export function fossilOptimizationFixture(allflame = false) {
    const item = { ...engine.createItem(baseId, 86), rarity: "rare" as const };
    const fossils = engine
        .availableFossils(item)
        .filter((entry) => ["Pristine Fossil", "Frigid Fossil"].includes(entry.name));
    const options = {
        fossils: fossils.map((entry) => entry.id),
        maxSockets: 2,
        trials: 100,
        logic: "additive" as const,
        ...(allflame ? { allflame: true as const } : {}),
    };
    const project = craftingProjectSchema.parse({
        ...workbenchProject("poe1"),
        item,
        method: {
            kind: "fossils",
            ids: [fossils[0]!.id],
            resonator: catalog.crafting.currencies.find(
                (entry) =>
                    entry.action === "delve_currency_reroll" &&
                    entry.id.endsWith("1") &&
                    (!allflame ||
                        catalog.crafting.allflame!.currencies.some(
                            (bracket) => bracket.currency === entry.id,
                        )),
            )!.id,
            logic: options.logic,
            ...(allflame ? { allflame: true } : {}),
        },
        target: {
            groups: [
                {
                    mods: engine
                        .pool(item)
                        .filter((entry) => entry.mod.implicit_tags.includes("cold"))
                        .map((entry) => entry.id),
                },
            ],
        },
        steps: [],
        prices: Object.fromEntries([
            ...catalog.crafting.currencies.map((entry) => [entry.id, 1]),
            ...fossils.map((entry) => [entry.id, 2]),
            [catalog.crafting.allflame!.sulphur, 0.001],
        ]),
    });
    return { project, options };
}
