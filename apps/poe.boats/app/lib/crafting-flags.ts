import {
    type CraftingCatalog,
    type CraftingItem,
    craftingFlagSchema,
    craftingItemStateSchema,
} from "../schemas/crafting";
import type { CraftingEngine } from "./crafting-engine";

export function craftingFlags(game: CraftingCatalog["game"]) {
    return [
        {
            key: "corrupted",
            label: "Corrupted",
            requirement: "Required corruption",
            absent: "Uncorrupted",
        },
        {
            key: "mirrored",
            label: "Mirrored",
            requirement: "Required mirroring",
            absent: "Unmirrored",
        },
        ...(game === "poe1"
            ? [
                  {
                      key: "split",
                      label: "Split",
                      requirement: "Required split state",
                      absent: "Unsplit",
                  } as const,
              ]
            : [
                  {
                      key: "sanctified",
                      label: "Sanctified",
                      requirement: "Required Sanctification",
                      absent: "Unsanctified",
                  } as const,
              ]),
    ] as const;
}

export function setCraftingFlag(
    engine: CraftingEngine,
    input: CraftingItem,
    key: ReturnType<typeof craftingFlags>[number]["key"],
    enabled: boolean,
): CraftingItem {
    const flag = craftingFlagSchema.parse(key);
    const value = craftingItemStateSchema.shape.corrupted.unwrap().parse(enabled);
    const item = engine.validateItem(input);
    if (!craftingFlags(engine.catalog.game).some((entry) => entry.key === flag))
        throw new Error("This item flag is unavailable in this game.");
    if (item.destroyed) throw new Error("Destroyed items cannot have their flags edited.");
    if (item.allflameCopies) throw new Error("Choose an Allflame copy before editing item flags.");

    item[flag] = value;
    if (value && flag !== "split") {
        item.corrupted = flag === "corrupted";
        item.mirrored = flag === "mirrored";
        item.sanctified = flag === "sanctified" ? true : undefined;
    }
    if (!item.corrupted) {
        delete item.corruptedBy;
        delete item.twiceCorrupted;
        delete item.putrefied;
        for (const mod of item.mods) delete mod.corruptionScale;
    }
    if (!item.sanctified) {
        delete item.sanctified;
        for (const mod of item.mods) delete mod.sanctification;
    }
    if (!item.split) delete item.split;
    return engine.validateItem(item);
}
