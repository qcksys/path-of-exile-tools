export const FORBIDDEN_JEWEL_ICONS = {
    "Forbidden Flesh": "2DItems/Jewels/PuzzlePieceJewel_GreatTangle",
    "Forbidden Flame": "2DItems/Jewels/PuzzlePieceJewel_CleansingFire",
} as const;

export const FORBIDDEN_JEWEL_LEVEL_KIND = "forbidden-jewel-level";
export const NORMAL_FORBIDDEN_LEVEL = "ilvl 86-";
export const UBER_FORBIDDEN_LEVEL = "ilvl 87+";

export function isForbiddenJewelLevel(value: unknown) {
    return value === NORMAL_FORBIDDEN_LEVEL || value === UBER_FORBIDDEN_LEVEL;
}
