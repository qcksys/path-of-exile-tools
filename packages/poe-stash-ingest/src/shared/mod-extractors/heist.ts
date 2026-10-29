import type { Item } from "@poe-tools/api-client";
import {
    isHeistBlueprint,
    isHeistContract,
    isHeistMarketItem,
    propertyText,
} from "#src/shared/capture.ts";
import type { ModExtractor } from "#src/shared/mod-extractors/types.ts";

const REQUIREMENT = "Requires {1} (Level {0})";

/** A contract's single job requirement, e.g. `{ job: "Lockpicking", level: 5 }`. */
function contractRequirement(item: Item) {
    const values = item.properties?.find((property) => property.name === REQUIREMENT)?.values;
    const level = Number(values?.[0]?.[0]);
    const job = values?.[1]?.[0];
    return job && Number.isSafeInteger(level) ? { job, level } : null;
}

/**
 * Contracts trade by their job requirement; blueprints by wings revealed and their enchants
 * (e.g. `Heist Targets are always Thieves' Trinkets`), each enchant set its own market.
 */
export const heistExtractor: ModExtractor = {
    kind: "heist",
    value: (signature) =>
        signature.job
            ? `${signature.job} (Level ${signature.level})`
            : [`${signature.wings} wings`, ...(signature.enchants as string[])].join(" · "),
    matches: isHeistMarketItem,
    extract(item) {
        if (isHeistContract(item)) {
            const requirement = contractRequirement(item);
            return requirement && { kind: "heist", ...requirement };
        }
        if (!isHeistBlueprint(item)) return null;
        return {
            kind: "heist",
            wings: propertyText(item, "Wings Revealed"),
            enchants: [...(item.enchantMods ?? [])].sort(),
        };
    },
};
