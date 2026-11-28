import type { Item } from "@poe-tools/api-client";
import {
    FORBIDDEN_JEWEL_ICONS,
    FORBIDDEN_JEWEL_LEVEL_KIND,
    NORMAL_FORBIDDEN_LEVEL,
    UBER_FORBIDDEN_LEVEL,
} from "@poe-tools/market";
import { isUniqueItem } from "#src/shared/capture.ts";
import { decodeIconAsset } from "#src/shared/icon.ts";
import { explicitModLines } from "#src/shared/mod-extractors/lines.ts";
import type { ModExtractor, ModSignature } from "#src/shared/mod-extractors/types.ts";

// "Allocates {Notable} if you have the matching modifier on Forbidden Flesh"; some notables
// have commas ("Hinekora, Death's Fury").
const ALLOCATES_RE = /Allocates ([A-Za-z', ]+?) if you have the matching modifier/;

export const forbiddenJewelExtractor: ModExtractor = {
    kind: "forbidden-jewel",
    value: (signature) => String(signature.allocatedNotable),
    matches(item: Item): boolean {
        return (
            isUniqueItem(item) && item.identified && Object.hasOwn(FORBIDDEN_JEWEL_ICONS, item.name)
        );
    },
    extract(item: Item): ModSignature | null {
        for (const line of explicitModLines(item)) {
            const m = line.match(ALLOCATES_RE);
            if (m?.[1]) return { kind: "forbidden-jewel", allocatedNotable: m[1].trim() };
        }
        return null;
    },
};

export const unidentifiedForbiddenJewelExtractor: ModExtractor = {
    kind: FORBIDDEN_JEWEL_LEVEL_KIND,
    value: (signature) => String(signature.level),
    matches: (item) =>
        !item.identified &&
        isUniqueItem(item) &&
        (item.baseType === "Cobalt Jewel" || item.baseType === "Crimson Jewel"),
    extract(item) {
        const level = item.ilvl ?? item.itemLevel;
        if (!level || !Number.isSafeInteger(level) || level < 1) return null;
        const name = item.baseType === "Cobalt Jewel" ? "Forbidden Flesh" : "Forbidden Flame";
        if (decodeIconAsset(item.icon) !== FORBIDDEN_JEWEL_ICONS[name]) return null;
        return {
            kind: FORBIDDEN_JEWEL_LEVEL_KIND,
            level: level >= 87 ? UBER_FORBIDDEN_LEVEL : NORMAL_FORBIDDEN_LEVEL,
        };
    },
};
