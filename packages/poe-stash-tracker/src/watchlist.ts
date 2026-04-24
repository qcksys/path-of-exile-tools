import type { Item } from "@poe-tools/api-client";

export type WatchlistEntry =
  | { kind: "unid"; baseType: string }
  | { kind: "identified"; name: string };

export const DEFAULT_WATCHLIST: WatchlistEntry[] = [
  { kind: "unid", baseType: "Heavy Belt" },
  { kind: "unid", baseType: "Leather Belt" },
  { kind: "unid", baseType: "Onyx Amulet" },
  { kind: "unid", baseType: "Topaz Ring" },
  { kind: "unid", baseType: "Crimson Jewel" },
  { kind: "unid", baseType: "Cobalt Jewel" },
  { kind: "unid", baseType: "Viridian Jewel" },
  { kind: "unid", baseType: "Spiked Shield" },
  { kind: "unid", baseType: "Forked Sceptre" },
  { kind: "identified", name: "Mageblood" },
  { kind: "identified", name: "Headhunter" },
  { kind: "identified", name: "Ashes of the Stars" },
  { kind: "identified", name: "Nimis" },
  { kind: "identified", name: "Sign of the Sin Eater" },
  { kind: "identified", name: "Crest of Desire" },
  { kind: "identified", name: "Forbidden Flame" },
  { kind: "identified", name: "Forbidden Flesh" },
];

export function matches(item: Item, list: WatchlistEntry[] = DEFAULT_WATCHLIST): boolean {
  return list.some((e) =>
    e.kind === "unid"
      ? !item.identified && item.baseType === e.baseType
      : item.identified && item.name === e.name,
  );
}
