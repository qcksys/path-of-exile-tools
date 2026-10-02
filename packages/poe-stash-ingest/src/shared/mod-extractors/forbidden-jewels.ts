import type { Item } from "@poe-tools/api-client";
import { explicitModLines } from "#src/shared/mod-extractors/lines.ts";
import type { ModExtractor, ModSignature } from "#src/shared/mod-extractors/types.ts";

const NAMES = new Set(["Forbidden Flame", "Forbidden Flesh"]);
// "Allocates {Notable} if you have the matching modifier on Forbidden Flesh"
const ALLOCATES_RE = /Allocates ([A-Za-z' ]+?) if you have the matching modifier/;

export const forbiddenJewelExtractor: ModExtractor = {
    kind: "forbidden-jewel",
    value: (signature) => String(signature.allocatedNotable),
    matches(item: Item): boolean {
        return item.frameType === 3 && item.identified && NAMES.has(item.name);
    },
    extract(item: Item): ModSignature | null {
        for (const line of explicitModLines(item)) {
            const m = line.match(ALLOCATES_RE);
            if (m?.[1]) return { kind: "forbidden-jewel", allocatedNotable: m[1].trim() };
        }
        return null;
    },
};
