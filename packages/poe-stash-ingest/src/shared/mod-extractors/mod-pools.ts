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

/** The aura condition can precede or follow the stat, sometimes across a newline. */
function auraMod(line: string): string | null {
    const text = normalise(line);
    const prefix = text.match(/^While affected by ([A-Za-z ]+?),\s*(.+)$/i);
    const suffix = text.match(/^(.+?) while affected by ([A-Za-z ]+)$/i);
    const aura = (prefix?.[1] ?? suffix?.[2])?.trim();
    const stat = (prefix?.[2] ?? suffix?.[1])?.trim();
    if (!aura || !stat || !AURAS.includes(aura as (typeof AURAS)[number])) return null;
    return `${aura}: ${stat}`;
}

/**
 * Uniques whose mods are drawn from a pool, so their price depends on which mods they rolled.
 * Each gets its own signature kind; a market is one combination of masked mods, so every roll
 * of the same mods trades together. The app reads these kinds as `MOD_POOL_KINDS`.
 */
export const MOD_POOLS: Record<string, { kind: string; mods: (lines: string[]) => string[] }> = {
    "Watcher's Eye": {
        kind: "watchers-eye",
        mods: (lines) => lines.flatMap((line) => auraMod(line) ?? []),
    },
    // PoE 2: every explicit mod comes from another unique.
    Loreweave: { kind: "loreweave", mods: (lines) => lines.map(normalise) },
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
        matches: (item: Item) => isUniqueItem(item) && item.identified && item.name === name,
        extract(item: Item): ModSignature | null {
            const mods = pool.mods(explicitModLines(item)).sort();
            return mods.length ? { kind: pool.kind, mods } : null;
        },
    }),
);
