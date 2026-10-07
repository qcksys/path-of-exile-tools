import { craftingCatalogSchema } from "../schemas/crafting";

export async function loadCraftingCatalog(
    game: "poe1" | "poe2",
    reload: boolean,
    read: typeof fetch = fetch,
) {
    if (game !== "poe1" && game !== "poe2") throw new Error("Unknown game.");
    const response = await read(`/game-data/crafting-${game}.json`, {
        cache: reload ? "reload" : "no-cache",
    });
    if (!response.ok) throw new Error(`Catalog request failed (${response.status}).`);
    const catalog = craftingCatalogSchema.parse(await response.json());
    if (catalog.game !== game || catalog.crafting.patch !== catalog.patch)
        throw new Error("The crafting catalog has inconsistent build information.");
    return catalog;
}
