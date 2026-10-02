import type { Item } from "@poe-tools/api-client";

export function explicitModLines(item: Item): string[] {
    return (item.explicitMods ?? []).map((mod) =>
        typeof mod === "string" ? mod : mod.description,
    );
}
