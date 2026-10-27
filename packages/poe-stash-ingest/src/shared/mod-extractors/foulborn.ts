import { createHash } from "node:crypto";
import type { Item } from "@poe-tools/api-client";
import { isUniqueItem } from "#src/shared/capture.ts";
import type { ModExtractor, ModSignature } from "#src/shared/mod-extractors/types.ts";

// The remote summary table stores `signature_value` as varchar(255).
const MAX_VALUE_LENGTH = 255;

/** Rolls differ per listing, so numbers are masked to keep one market per mutated modifier. */
function mutatedModLines(item: Item): string[] {
    const flagged = (item.explicitMods ?? []).flatMap((mod) =>
        typeof mod !== "string" && mod.flags?.mutated ? [mod.description] : [],
    );
    return [...new Set([...(item.mutatedMods ?? []), ...flagged])]
        .map((line) =>
            line
                .replace(/\s+/g, " ")
                .replace(/\d+(?:\.\d+)?/g, "#")
                .trim(),
        )
        .sort();
}

export const foulbornExtractor: ModExtractor = {
    kind: "foulborn",
    value: (signature) => {
        const value = (signature.mods as string[]).join(" / ");
        return value.length <= MAX_VALUE_LENGTH
            ? value
            : createHash("sha256").update(value).digest("hex");
    },
    matches(item: Item): boolean {
        return isUniqueItem(item) && item.identified && item.mutated === true;
    },
    extract(item: Item): ModSignature | null {
        const mods = mutatedModLines(item);
        return mods.length ? { kind: "foulborn", mods } : null;
    },
};
