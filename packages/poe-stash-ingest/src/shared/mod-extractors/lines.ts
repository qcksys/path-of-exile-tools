import type { Item } from "@poe-tools/api-client";

function modLines(mods: Item["explicitMods"]): string[] {
    return (mods ?? []).map((mod) => (typeof mod === "string" ? mod : mod.description));
}

export function explicitModLines(item: Item): string[] {
    return modLines(item.explicitMods);
}

export function implicitModLines(item: Item): string[] {
    return modLines(item.implicitMods);
}
