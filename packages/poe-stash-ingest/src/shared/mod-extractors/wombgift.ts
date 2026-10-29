import type { ModExtractor } from "#src/shared/mod-extractors/types.ts";

/**
 * Item level bands, highest first. Birthed items take the Wombgift's item level. poe.ninja
 * splits at 68, 75 and 84; 83, the area level of tier 16 maps, is also split from 75–82.
 */
const BANDS = [
    { min: 84, label: "Item level 84+" },
    { min: 83, label: "Item level 83" },
    { min: 75, label: "Item level 75–82" },
    { min: 68, label: "Item level 68–74" },
    { min: 1, label: "Item level 1–67" },
];

/** Wombgifts trade by item level band. */
export const wombgiftExtractor: ModExtractor = {
    kind: "wombgift",
    value: (signature) => String(signature.level),
    matches: (item) => item.baseType.endsWith(" Wombgift"),
    extract(item) {
        const itemLevel = item.ilvl ?? item.itemLevel;
        const band = itemLevel && BANDS.find(({ min }) => itemLevel >= min);
        return band ? { kind: "wombgift", level: band.label } : null;
    },
};
