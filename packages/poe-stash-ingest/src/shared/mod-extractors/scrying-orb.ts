import { propertyText } from "#src/shared/capture.ts";
import type { ModExtractor } from "#src/shared/mod-extractors/types.ts";

const BASE_TYPE = "Scrying Orb";

/** Each Scrying Orb scries one map, named by its `Map Area` property, and trades per map. */
export const scryingOrbExtractor: ModExtractor = {
    kind: "scrying-orb",
    value: (signature) => String(signature.map),
    matches: (item) => item.baseType === BASE_TYPE,
    extract(item) {
        const map = propertyText(item, "Map Area");
        return map ? { kind: "scrying-orb", map } : null;
    },
};
