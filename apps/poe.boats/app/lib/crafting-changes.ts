import { type CraftingItem, type RolledMod, rolledModSchema } from "../schemas/crafting";
import type { CraftingEngine } from "./crafting-engine";
import { rolledModText } from "./crafting-text";

export type ModifierChange = {
    key: string;
    kind: "mods" | "implicits" | "enchantments";
    before?: RolledMod;
    after?: RolledMod;
};

export function modifierChanges(
    engine: CraftingEngine,
    before: CraftingItem,
    after: CraftingItem,
): ModifierChange[] {
    const changes: ModifierChange[] = [];
    for (const kind of ["mods", "implicits", "enchantments"] as const) {
        const entries = (item: CraftingItem) =>
            (item[kind] ?? []).map((rolled, index) => ({
                rolled,
                index,
                signature: JSON.stringify([
                    rolledModSchema.parse(rolled),
                    rolledModText(engine.catalog, rolled, item),
                ]),
            }));
        const previous = entries(before);
        const remaining = entries(after).filter((entry) => {
            const match = previous.findIndex((other) => other.signature === entry.signature);
            if (match < 0) return true;
            previous.splice(match, 1);
            return false;
        });
        for (const entry of remaining) {
            const match = previous.findIndex((other) => other.rolled.id === entry.rolled.id);
            changes.push({
                key: `${kind}:after:${entry.index}`,
                kind,
                before: match < 0 ? undefined : previous.splice(match, 1)[0]!.rolled,
                after: entry.rolled,
            });
        }
        for (const entry of previous)
            changes.push({
                key: `${kind}:before:${entry.index}`,
                kind,
                before: entry.rolled,
            });
    }
    return changes;
}
