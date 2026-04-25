import type { Item } from "@poe-tools/api-client";
import type { ModExtractor, ModSignature } from "#src/shared/mod-extractors/types.ts";

// "Passives in Radius of {Keystone} can be Allocated without being connected to your tree"
const RE = /Passives in Radius of ([A-Za-z' ]+?) can be Allocated/;

export const impossibleEscapeExtractor: ModExtractor = {
  kind: "impossible-escape",
  matches(item: Item): boolean {
    return item.frameType === 3 && item.identified && item.name === "Impossible Escape";
  },
  extract(item: Item): ModSignature | null {
    for (const line of item.explicitMods ?? []) {
      const m = line.match(RE);
      if (m?.[1]) return { kind: "impossible-escape", keystone: m[1].trim() };
    }
    return null;
  },
};
