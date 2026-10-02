import type { Item } from "@poe-tools/api-client";
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

/**
 * The aura condition can precede or follow the stat, sometimes across a newline.
 */
function parseLine(line: string): { aura: string; stat: string } | null {
    const text = line.replace(/\s+/g, " ").trim();
    const prefix = text.match(/^While affected by ([A-Za-z ]+?),\s*(.+)$/i);
    const suffix = text.match(/^(.+?) while affected by ([A-Za-z ]+)$/i);
    const aura = (prefix?.[1] ?? suffix?.[2])?.trim();
    const stat = (prefix?.[2] ?? suffix?.[1])?.trim();
    if (!aura || !stat) return null;
    if (!AURAS.includes(aura as (typeof AURAS)[number])) return null;
    return { aura, stat };
}

export const watchersEyeExtractor: ModExtractor = {
    kind: "watchers-eye",
    matches(item: Item): boolean {
        return item.frameType === 3 && item.identified && item.name === "Watcher's Eye";
    },
    extract(item: Item): ModSignature | null {
        const mods = (item.explicitMods ?? [])
            .map(parseLine)
            .filter((m): m is { aura: string; stat: string } => m !== null)
            .sort((a, b) => a.aura.localeCompare(b.aura) || a.stat.localeCompare(b.stat));
        if (mods.length === 0) return null;
        return { kind: "watchers-eye", mods };
    },
};
