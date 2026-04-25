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
 * Watcher's Eye explicit mods are "While affected by {Aura}, …{stat phrase}".
 * The stat phrase is the categorisation we want — it identifies which of the
 * many possible per-aura modifiers rolled.
 */
function parseLine(line: string): { aura: string; stat: string } | null {
  const m = line.match(/^While affected by ([A-Za-z ]+?),\s*(.+)$/);
  if (!m?.[1] || !m?.[2]) return null;
  const aura = m[1].trim();
  if (!AURAS.includes(aura as (typeof AURAS)[number])) return null;
  return { aura, stat: m[2].trim() };
}

export const watchersEyeExtractor: ModExtractor = {
  kind: "watchers-eye",
  matches(item: Item): boolean {
    return item.frameType === 3 && item.identified && item.name === "Watcher's Eye";
  },
  extract(item: Item): ModSignature | null {
    const mods = (item.explicitMods ?? [])
      .map(parseLine)
      .filter((m): m is { aura: string; stat: string } => m !== null);
    if (mods.length === 0) return null;
    return { kind: "watchers-eye", mods };
  },
};
