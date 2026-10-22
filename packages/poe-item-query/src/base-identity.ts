import { z } from "zod";
import { itemRarity } from "./normalize.ts";
import type { ItemRecord } from "./schema.ts";

export const baseIdentitySchema = z.strictObject({
    id: z.string().min(1).max(500),
    baseType: z.string().min(1).max(500),
    implicits: z
        .array(z.array(z.string().min(1).max(5000)).max(32))
        .min(1)
        .max(256)
        .optional(),
});
export type BaseIdentity = z.infer<typeof baseIdentitySchema>;

function signature(texts: string[]) {
    return JSON.stringify(
        texts
            .flatMap((text) => text.split("\n"))
            .map((text) =>
                text
                    .replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2")
                    .replace(/\[([^\]]+)\]/g, "$1")
                    .trim()
                    .replace(/\s+/g, " "),
            )
            .sort(),
    );
}

export function compileBaseIdentities(identities: BaseIdentity[]) {
    const bases = new Map<string, BaseIdentity[]>();
    const signatures = new Map<string, Set<string>>();
    for (const input of identities) {
        const base = baseIdentitySchema.parse(input);
        if (signatures.has(base.id)) throw new Error("Duplicate base identity.");
        signatures.set(base.id, new Set(base.implicits?.map(signature)));
        bases.set(base.baseType, [...(bases.get(base.baseType) ?? []), base]);
    }
    return (record: ItemRecord): ItemRecord => {
        const { item } = record;
        if (
            record.game !== "poe1" ||
            !["stash", "trade"].includes(record.source) ||
            record.facts.baseId ||
            item.identified !== true ||
            item.corrupted ||
            item.synthesised ||
            !["Normal", "Magic", "Rare"].includes(itemRarity(item) ?? "") ||
            !item.implicitMods?.length ||
            item.implicitMods.some(
                (mod) => typeof mod !== "string" && Object.values(mod.flags ?? {}).some(Boolean),
            )
        )
            return record;
        const variants = bases.get(item.baseType);
        // An unrenderable variant cannot be excluded by another variant's matching text.
        if (!variants?.length || variants.some((base) => !base.implicits)) return record;
        const key = signature(
            item.implicitMods.map((mod) => (typeof mod === "string" ? mod : mod.description)),
        );
        const matches = variants.filter((base) => signatures.get(base.id)!.has(key));
        return matches.length === 1
            ? {
                  ...record,
                  facts: {
                      ...record.facts,
                      baseId: matches[0]!.id,
                      baseTypeAmbiguous: variants.length > 1,
                  },
              }
            : record;
    };
}
