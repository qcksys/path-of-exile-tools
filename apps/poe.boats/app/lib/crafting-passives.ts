import type { CraftingCatalog, CraftingItem } from "../schemas/crafting";

export const grantedPassiveStat = "mod_granted_passive_hash_essence";
type Passive = CraftingCatalog["crafting"]["anointing"]["passives"][string];
const cachedPassives = new WeakMap<CraftingCatalog, Record<string, Passive>>();

export function extractedGrantedPassives(catalog: CraftingCatalog) {
    const cached = cachedPassives.get(catalog);
    if (cached) return cached;
    const result =
        catalog.game !== "poe2"
            ? {}
            : Object.fromEntries([
                  ...Object.entries(catalog.crafting.anointing.passives).filter(
                      ([, passive]) => passive.notable,
                  ),
                  ...Object.entries(catalog.crafting.passiveTree?.notables ?? {}).filter(
                      ([, passive]) => !passive.ascendancy && !passive.visibleForAscendancy,
                  ),
              ]);
    cachedPassives.set(catalog, result);
    return result;
}

export function grantedPassive(catalog: CraftingCatalog, id: string) {
    const passive = extractedGrantedPassives(catalog)[id];
    if (!passive) throw new Error("Unknown allocated notable passive in this build.");
    return passive;
}

export function passiveAllocationMod(catalog: CraftingCatalog, item: Pick<CraftingItem, "baseId">) {
    if (catalog.game !== "poe2") return;
    const itemClass = catalog.bases[item.baseId]?.item_class;
    return (
        catalog.crafting.poe2Essences
            .flatMap((essence) => essence.rules)
            .find(
                (rule) =>
                    rule.itemClasses.includes(itemClass!) &&
                    rule.mod &&
                    catalog.mods[rule.mod]?.stats.some((stat) => stat.id === grantedPassiveStat),
            )?.mod ?? undefined
    );
}
