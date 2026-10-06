import type { CraftingData } from "../../../../packages/poe-game-data/src/crafting-data-model";
import type { CraftingCatalog, CraftingItem, CraftingMethod } from "../schemas/crafting";
import { availableOmens } from "./crafting-omens";

export function supportedStrongbox(game: CraftingData["game"], id: string) {
    const type = id.replace(/^Metadata\/Chests\/StrongBoxes\//, "");
    // This rule selects ordinary variants; special encounter and unique behavior needs its own model.
    return game === "poe1"
        ? /^(Arcanist|Armory|Arsenal|Artisan|Cartographer(LowMaps|MidMaps|HighMaps|EndMaps|Safehouse)?|Chemist|Gemcutter|Jeweller|Large|Ornate|Strongbox(Divination|Scarab|Jewels)?)$/.test(
              type,
          )
        : /^(Martial|Caster|Armourer|Jeweller|Research|Map|Large|Basic|Ornate)Strongbox(Low|High)?$/.test(
              type,
          );
}

export function strongbox(catalog: CraftingCatalog, item: Pick<CraftingItem, "baseId">) {
    return catalog.bases[item.baseId]?.strongbox
        ? catalog.crafting.strongboxes.find((entry) => entry.id === item.baseId)
        : undefined;
}

export function strongboxMethod(catalog: CraftingCatalog, method: CraftingMethod) {
    if (method.kind === "generate") return true;
    if (method.kind !== "currency" || method.donor) return false;
    const currency = catalog.crafting.currencies.find((entry) => entry.id === method.id);
    if (method.omens?.length) {
        const omens = availableOmens(catalog, method, "Strongbox");
        if (method.omens.some((id) => !omens.some((entry) => entry.id === id))) return false;
    }
    if (currency?.action === "corrupt_item") return currency.id.endsWith("/CurrencyCorrupt");
    return (
        !!currency &&
        [
            "transmute_to_magic",
            "reroll_magic",
            "add_mod_to_magic",
            "transmute_to_rare",
            "upgrade_magic_to_rare",
            "reroll",
            "add_mod_to_rare",
            "remove_random_mod",
            "convert_to_normal",
            "reroll_mod_values",
        ].includes(currency.action)
    );
}
