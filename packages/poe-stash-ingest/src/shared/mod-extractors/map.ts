import type { Item } from "@poe-tools/api-client";
import {
    type MapAtlasDropsBand,
    type MapContent,
    type MapDeliriumBand,
    type MapInfluence,
    type MapModBand,
    mapAtlasDropsBand,
    mapContents,
    mapDeliriumBand,
    mapHasAtlasDropsBands,
    mapInfluences,
    mapModBand,
    mapModCount,
    mapVariantValue,
} from "@poe-tools/market";
import { isMapItem } from "#src/shared/capture.ts";
import { propertyNumber } from "#src/shared/mod-extractors/gem.ts";
import { explicitModLines, implicitModLines } from "#src/shared/mod-extractors/lines.ts";
import type { ModExtractor } from "#src/shared/mod-extractors/types.ts";

/** The property that replaced Item Quantity on maps in 3.30. */
const ATLAS_DROPS = "[AtlasDropScaling|Atlas Drops]";

/**
 * A Delirium Orb's `Players in Area are 40% Delirious`: an enchantment before 3.30, a rare map's
 * suffix since.
 */
function delirious(mods: readonly string[]) {
    const match = mods
        .map((mod) => /^Players in Area are (\d+)% Delirious$/.exec(mod)?.[1])
        .find(Boolean);
    return match ? Number(match) : 0;
}

/** The affix count the API gives identified magic and rare maps, or one read from their lines. */
function modCount(item: Item) {
    const { prefixes, suffixes } = item.extended ?? {};
    return prefixes === undefined && suffixes === undefined
        ? mapModCount(explicitModLines(item))
        : (prefixes ?? 0) + (suffixes ?? 0);
}

/**
 * Maps trade by identification, mod count band, delirium, league content and influence, and tier
 * 16 and Nightmare maps by Atlas Drops band, as well as corruption. Unidentified maps show neither
 * mods nor Atlas Drops, nor the suffixes that add content or (since 3.30) delirium.
 */
export const mapExtractor: ModExtractor = {
    kind: "map",
    value: (signature) =>
        mapVariantValue({
            identified: signature.identified === true,
            mods: signature.mods as MapModBand | undefined,
            atlasDrops: signature.atlasDrops as MapAtlasDropsBand | undefined,
            delirium: signature.delirium as MapDeliriumBand,
            contents: signature.contents as MapContent[] | undefined,
            influences: signature.influences as MapInfluence[] | undefined,
        }),
    matches: isMapItem,
    extract(item) {
        const explicit = explicitModLines(item);
        const atlasDrops =
            item.identified && mapHasAtlasDropsBands(item.baseType)
                ? mapAtlasDropsBand(propertyNumber(item, ATLAS_DROPS) ?? 0)
                : undefined;
        const contents = mapContents(explicit);
        const influences = mapInfluences(implicitModLines(item));
        return {
            kind: "map",
            identified: item.identified,
            ...(item.identified ? { mods: mapModBand(modCount(item)) } : {}),
            ...(atlasDrops ? { atlasDrops } : {}),
            delirium: mapDeliriumBand(delirious([...(item.enchantMods ?? []), ...explicit])),
            ...(contents.length ? { contents } : {}),
            ...(influences.length ? { influences } : {}),
        };
    },
};
