import type { Item } from "@poe-tools/api-client";

/**
 * Mod text with game markup reduced to its shown text. Since 3.30 the API tags names in mods:
 * `[AscendancyTrickster10|Spellbreaker]`, `[SupportIceBite<gemlevel=35>|Ice Bite]`, `[Mirage]`.
 */
export function withoutMarkup(line: string) {
    return line.replace(/\[(?:[^\]|]*\|)?([^\]]*)\]/g, "$1");
}

function modLines(mods: Item["explicitMods"]): string[] {
    return (mods ?? []).map((mod) =>
        withoutMarkup(typeof mod === "string" ? mod : mod.description),
    );
}

export function explicitModLines(item: Item): string[] {
    return modLines(item.explicitMods);
}

export function implicitModLines(item: Item): string[] {
    return modLines(item.implicitMods);
}
