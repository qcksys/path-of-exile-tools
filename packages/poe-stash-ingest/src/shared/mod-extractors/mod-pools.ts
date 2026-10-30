// biome-ignore-all lint/style/useNamingConvention: Keys are in-game unique names.
import { createHash } from "node:crypto";
import type { Item } from "@poe-tools/api-client";
import { isUniqueItem } from "#src/shared/capture.ts";
import { explicitModLines } from "#src/shared/mod-extractors/lines.ts";
import type { ModExtractor, ModSignature } from "#src/shared/mod-extractors/types.ts";

const AURAS = [
    "Anger",
    "Clarity",
    "Determination",
    "Discipline",
    "Grace",
    "Haste",
    "Hatred",
    "Malevolence",
    "Precision",
    "Pride",
    "Purity of Elements",
    "Purity of Fire",
    "Purity of Ice",
    "Purity of Lightning",
    "Vitality",
    "Wrath",
    "Zealotry",
] as const;

// The remote summary table stores `signature_value` as varchar(255).
const MAX_VALUE_LENGTH = 255;

/** Collapses whitespace, keeps the text of `[Tag|Text]` markup and masks rolls. */
function normalise(line: string) {
    return line
        .replace(/\[(?:[^\]|]*\|)?([^\]]*)\]/g, "$1")
        .replace(/\s+/g, " ")
        .replace(/\d+(?:\.\d+)?/g, "#")
        .trim();
}

const AURA_CONDITION = new RegExp(
    `^(.*?)\\s*\\bwhile (?:you are )?(?:affected by|using) (${AURAS.join("|")})\\b,?\\s*(.*)$`,
    "i",
);

/**
 * The aura condition can open, close or sit inside the stat ("#% of Damage taken while affected by
 * Clarity Recouped as Mana"), sometimes across a newline; Pride's mods say "while using Pride".
 */
function auraMod(line: string): string | null {
    const match = normalise(line).match(AURA_CONDITION);
    if (!match) return null;
    const stat = `${match[1]} ${match[3]}`.trim();
    return stat ? `${match[2]}: ${stat}` : null;
}

/**
 * Uniques whose mods are drawn from a pool, so their price depends on which mods they rolled.
 * Each gets its own signature kind; a market is one combination of masked mods, so every roll
 * of the same mods trades together. The app reads these kinds as `MOD_POOL_KINDS`.
 */
export const MOD_POOLS: Record<
    string,
    { kind: string; mods: (lines: string[]) => string[]; bases?: string[] }
> = {
    "Watcher's Eye": {
        kind: "watchers-eye",
        mods: (lines) => lines.flatMap((line) => auraMod(line) ?? []),
    },
    // PoE 2's Loreweave draws every explicit mod from other uniques. PoE 1's Loreweave (Elegant
    // Ringmail) shares the name but has fixed mods, so it stays one ordinary market.
    Loreweave: {
        kind: "loreweave",
        mods: (lines) => lines.map(normalise),
        bases: [
            "Ornate Ringmail",
            "Ancient Mail",
            "Runemastered Ornate Ringmail",
            "Runemastered Ancient Mail",
        ],
    },
};

export const MOD_POOL_EXTRACTORS: ModExtractor[] = Object.entries(MOD_POOLS).map(
    ([name, pool]) => ({
        kind: pool.kind,
        value: (signature) => {
            const value = (signature.mods as string[]).join(" / ");
            return value.length <= MAX_VALUE_LENGTH
                ? value
                : createHash("sha256").update(value).digest("hex");
        },
        matches: (item: Item) =>
            isUniqueItem(item) &&
            item.identified &&
            item.name === name &&
            (!pool.bases || pool.bases.includes(item.baseType)),
        extract(item: Item): ModSignature | null {
            const mods = pool.mods(explicitModLines(item)).sort();
            return mods.length ? { kind: pool.kind, mods } : null;
        },
    }),
);
