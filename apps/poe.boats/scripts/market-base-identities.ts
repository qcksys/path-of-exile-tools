import { type BaseIdentity, baseIdentitySchema } from "@poe-tools/item-query";
import type { CraftingEngine } from "../app/lib/crafting-engine";
import { rolledModText } from "../app/lib/crafting-text";

export function marketBaseIdentities(engine: CraftingEngine, names: Set<string>): BaseIdentity[] {
    const bases = Object.entries(engine.catalog.bases).filter(
        ([id, base]) =>
            names.has(base.name) &&
            !id.includes("Royale") &&
            !base.corrupted &&
            base.rarities.some((rarity) => ["normal", "magic", "rare"].includes(rarity)),
    );
    return bases
        .filter(([, base]) => bases.filter(([, other]) => other.name === base.name).length > 1)
        .map(([id, base]) => {
            let implicits: string[][] | undefined = [[]];
            for (const modId of base.implicits) {
                const mod = engine.mod(modId);
                let rolls: number[][] = [[]];
                for (const stat of mod.stats) {
                    const count = stat.max - stat.min + 1;
                    if (
                        !Number.isInteger(count) ||
                        count < 1 ||
                        rolls.length * count * implicits.length > 256
                    ) {
                        implicits = undefined;
                        break;
                    }
                    rolls = rolls.flatMap((values) =>
                        Array.from({ length: count }, (_, index) => [...values, stat.min + index]),
                    );
                }
                if (!implicits) break;
                const texts = rolls.map((values) =>
                    rolledModText(engine.catalog, {
                        id: modId,
                        values,
                        fractured: false,
                        crafted: false,
                    }),
                );
                if (texts.some((text) => !text)) {
                    implicits = undefined;
                    break;
                }
                implicits = implicits.flatMap((lines) =>
                    texts.map((text) => [...lines, ...text!.split("\n")]),
                );
            }
            return baseIdentitySchema.parse({ id, baseType: base.name, implicits });
        });
}
