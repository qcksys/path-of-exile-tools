import {
    type MapDeliriumBand,
    type MapInfluence,
    type MapModBand,
    type MapQuantityBand,
    mapDeliriumBand,
    mapHasQuantityBands,
    mapInfluence,
    mapModBand,
    mapModCount,
    mapQuantityBand,
    mapVariantValue,
} from "@poe-tools/market";
import { isMapItem } from "#src/shared/capture.ts";
import { propertyNumber } from "#src/shared/mod-extractors/gem.ts";
import { explicitModLines, implicitModLines } from "#src/shared/mod-extractors/lines.ts";
import type { ModExtractor } from "#src/shared/mod-extractors/types.ts";

/** Delirium Orbs enchant a map: `Players in Area are 40% Delirious`. */
function delirious(enchantMods: readonly string[]) {
    const match = enchantMods
        .map((mod) => /^Players in Area are (\d+)% Delirious$/.exec(mod)?.[1])
        .find(Boolean);
    return match ? Number(match) : 0;
}

/**
 * Maps trade by identification, mod count band, delirium and influence, and tier 16 and
 * Nightmare maps by item quantity band, as well as corruption. Unidentified maps show neither mods
 * nor quantity.
 */
export const mapExtractor: ModExtractor = {
    kind: "map",
    value: (signature) =>
        mapVariantValue({
            identified: signature.identified === true,
            mods: signature.mods as MapModBand | undefined,
            quantity: signature.quantity as MapQuantityBand | undefined,
            delirium: signature.delirium as MapDeliriumBand,
            influence: signature.influence as MapInfluence | undefined,
        }),
    matches: isMapItem,
    extract(item) {
        const quantity =
            item.identified && mapHasQuantityBands(item.baseType)
                ? mapQuantityBand(propertyNumber(item, "Item Quantity") ?? 0)
                : undefined;
        const influence = mapInfluence(implicitModLines(item));
        return {
            kind: "map",
            identified: item.identified,
            ...(item.identified ? { mods: mapModBand(mapModCount(explicitModLines(item))) } : {}),
            ...(quantity ? { quantity } : {}),
            delirium: mapDeliriumBand(delirious(item.enchantMods ?? [])),
            ...(influence ? { influence } : {}),
        };
    },
};
