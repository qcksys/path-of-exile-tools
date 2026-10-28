import type { Item } from "@poe-tools/api-client";
import {
    type GemLevelBand,
    type GemQualityBand,
    type GemTier,
    gemLevelBand,
    gemQualityBand,
    gemTier,
    gemVariantValue,
} from "@poe-tools/market";
import { isGemItem } from "#src/shared/capture.ts";
import type { ModExtractor } from "#src/shared/mod-extractors/types.ts";

/** A property's first value as a whole number: `20 (Max)` is 20, `+23%` is 23. */
function propertyNumber(item: Item, name: string) {
    const value = item.properties?.find((property) => property.name === name)?.values[0]?.[0];
    const number = Number.parseInt(value?.replace(/^\+/, "") ?? "", 10);
    return Number.isSafeInteger(number) ? number : undefined;
}

/** A gem's tags, from its first property: a valueless line such as `Exceptional, Attack, Support`. */
function gemTags(item: Item) {
    const line = item.properties?.[0];
    return line && !line.values.length ? line.name.split(", ") : [];
}

/** Skill gems trade by level band and quality band, as well as corruption. */
export const gemExtractor: ModExtractor = {
    kind: "gem",
    value: (signature) =>
        gemVariantValue(
            signature.tier as GemTier,
            signature.level as GemLevelBand,
            signature.quality as GemQualityBand,
        ),
    matches: isGemItem,
    extract(item) {
        const level = propertyNumber(item, "Level");
        if (level === undefined) return null;
        const tier = gemTier({ name: item.typeLine, tags: gemTags(item) });
        return {
            kind: "gem",
            tier,
            level: gemLevelBand(level, tier),
            quality: gemQualityBand(propertyNumber(item, "Quality") ?? 0),
        };
    },
};
