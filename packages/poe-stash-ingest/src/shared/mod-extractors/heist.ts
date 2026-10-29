import type { Item } from "@poe-tools/api-client";
import {
    isHeistBlueprint,
    isHeistContract,
    isHeistMarketItem,
    propertyText,
} from "#src/shared/capture.ts";
import type { ModExtractor } from "#src/shared/mod-extractors/types.ts";

const REQUIREMENT = "Requires {1} (Level {0})";

/** The job a contract requires, e.g. `Lockpicking`, whatever its level. */
function contractJob(item: Item) {
    return item.properties?.find((property) => property.name === REQUIREMENT)?.values[1]?.[0];
}

/**
 * Contracts trade by the job they require; blueprints by wings revealed and their enchants
 * (e.g. `Heist Targets are always Thieves' Trinkets`), each enchant set its own market.
 */
export const heistExtractor: ModExtractor = {
    kind: "heist",
    value: (signature) =>
        signature.job
            ? String(signature.job)
            : [`${signature.wings} wings`, ...(signature.enchants as string[])].join(" · "),
    matches: isHeistMarketItem,
    extract(item) {
        if (isHeistContract(item)) {
            const job = contractJob(item);
            return job ? { kind: "heist", job } : null;
        }
        if (!isHeistBlueprint(item)) return null;
        return {
            kind: "heist",
            wings: propertyText(item, "Wings Revealed"),
            enchants: [...(item.enchantMods ?? [])].sort(),
        };
    },
};
