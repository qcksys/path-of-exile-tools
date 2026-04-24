import type { Item } from "@poe-tools/api-client";

export function itemKey(item: Item): string {
  if (!item.identified) {
    return `unid:${item.baseType}`;
  }
  const parts = [item.name];
  if (item.corrupted) parts.push("corrupted");
  if (item.foilVariation !== undefined) parts.push(`foil:${item.foilVariation}`);
  return parts.join("|");
}
