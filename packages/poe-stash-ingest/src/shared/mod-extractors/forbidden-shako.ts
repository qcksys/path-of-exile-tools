import type { Item } from "@poe-tools/api-client";
import { explicitModLines } from "#src/shared/mod-extractors/lines.ts";
import type { ModExtractor, ModSignature } from "#src/shared/mod-extractors/types.ts";

// Forbidden Shako rolls one or more "Socketed Gems are Supported by Level X {Skill}".
const RE = /Socketed Gems are Supported by Level (\d+) ([A-Za-z' ]+)/;

export const forbiddenShakoExtractor: ModExtractor = {
    kind: "forbidden-shako",
    value: (signature) => `${signature.skill}@${signature.level}`,
    matches(item: Item): boolean {
        return item.frameType === 3 && item.identified && item.name === "Forbidden Shako";
    },
    extract(item: Item): ModSignature | null {
        // Multiple support mods can roll; we take the first as the signature.
        // Downstream rollups can summarise distributions over time.
        for (const line of explicitModLines(item)) {
            const m = line.match(RE);
            if (m?.[1] && m?.[2]) {
                return {
                    kind: "forbidden-shako",
                    skill: m[2].trim(),
                    level: Number(m[1]),
                };
            }
        }
        return null;
    },
};
