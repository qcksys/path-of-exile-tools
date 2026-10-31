import { normalizeApiItem } from "@poe-tools/item-query";
import { isMarketBaseType, marketBaseItemValue } from "@poe-tools/market";
import { isUniqueItem } from "#src/shared/capture.ts";
import type { ModExtractor } from "#src/shared/mod-extractors/types.ts";

/** Clean equipment of a listed crafting base trades by item level, links and quality bands. */
export const marketBaseExtractor: ModExtractor = {
    kind: "base",
    value: (signature) => String(signature.value),
    matches: (item) => !isUniqueItem(item) && isMarketBaseType(item.baseType),
    extract(item) {
        const value = marketBaseItemValue(normalizeApiItem("poe1", "stash", item));
        return value ? { kind: "base", value } : null;
    },
};
