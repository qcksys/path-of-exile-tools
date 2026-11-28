import type { Item } from "@poe-tools/api-client";
import { collectorItems } from "@poe-tools/market/collector-items";
import { isUniqueItem } from "#src/shared/capture.ts";
import { decodeIconAsset } from "#src/shared/icon.ts";

const byAsset = new Map(
    collectorItems.flatMap((item) =>
        item.artworks.map(({ asset }) => [asset, { asset, item }] as const),
    ),
);
const baseTypes = new Set(
    collectorItems.filter((item) => item.group === "base").map((item) => item.baseType),
);

export function collectorArt(item: Item) {
    if (
        item.replica ||
        item.foilVariation != null ||
        item.frameType === 9 ||
        item.lockedToAccount ||
        item.lockedToCharacter
    )
        return;
    const unique = isUniqueItem(item);
    if (!unique && !baseTypes.has(item.baseType)) return;
    const asset = decodeIconAsset(item.icon);
    const match = asset && byAsset.get(asset);
    if (!match) return;
    if (match.item.group === "base") {
        if (unique || item.baseType !== match.item.baseType) return;
        if (
            !(item.rarity
                ? ["Normal", "Magic", "Rare"].includes(item.rarity)
                : [0, 1, 2].includes(item.frameType ?? -1))
        )
            return;
    } else if (!unique || (item.identified && item.name !== match.item.name)) return;
    return match;
}

export function collectStandardAlongsideLeague(realm: string, league?: string | null) {
    return (
        realm === "pc" &&
        Boolean(league && league !== "Standard") &&
        process.env.PS_COLLECT_STANDARD === "true"
    );
}
