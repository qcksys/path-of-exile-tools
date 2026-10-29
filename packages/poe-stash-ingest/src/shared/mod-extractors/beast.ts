import { isCapturedBeast, isUniqueItem } from "#src/shared/capture.ts";
import type { ModExtractor } from "#src/shared/mod-extractors/types.ts";

/**
 * Rare captured beasts trade by species (the base type) alone, like poe.ninja's beast list. The
 * signature marks them so the rollup drops their random name. Spirit beasts are uniques and keep
 * their unique market.
 */
export const beastExtractor: ModExtractor = {
    kind: "beast",
    value: () => "",
    matches: (item) => isCapturedBeast(item) && !isUniqueItem(item),
    extract: () => ({ kind: "beast" }),
};
