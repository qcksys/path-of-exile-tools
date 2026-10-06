import type { CraftingData } from "./crafting-data-model.ts";
import type { Tables } from "./tables.ts";

export function extractAllflame(tables: Tables): CraftingData["allflame"] {
    if (tables.game !== "poe1") return null;
    const keyword = (id: string) => {
        const row = tables.rows("KeywordPopups").find((entry) => entry.id() === id);
        if (!row) throw new Error(`Missing Allflame keyword: ${id}`);
        return row;
    };
    const sulphur = keyword("DeadMansSulphur").ref("ItemReference")?.ref("BaseItemType")?.id();
    if (!sulphur) throw new Error("Missing Allflame sulphur item reference.");
    const description = tables
        .rows("ClientStrings")
        .find((row) => row.id() === "DeepwaterCraftingUIInfo")
        ?.string("Text");
    if (!description) throw new Error("Missing Allflame crafting description.");
    return {
        sulphur,
        description,
        intangibilityDescription: keyword("Intangibility").string("Definition"),
        ghostlyCopyDescription: keyword("GhostlyCopy").string("Definition"),
        classes: tables.rows("DeepwaterCraftingClasses").map((row) => {
            const itemClass = row.ref("ItemClass")?.id();
            if (!itemClass) throw new Error("Allflame class has no item-class reference.");
            return {
                itemClass,
                costPercent: row.unnamedInt32(1),
                levelScaling: row.unnamedBoolean(2),
            };
        }),
        levels: tables.rows("DeepwaterBalancePerLevel").map((row) => {
            const level = row.unnamedForeignKey(0);
            if (level === null) throw new Error("Allflame cost factor has no item level.");
            return { level, costIncreasePercent: row.unnamedInt32(1) };
        }),
        currencies: tables.rows("DeepwaterCraftingCurrencies").map((row) => {
            const currency = row.ref("Currency")?.ref("BaseItemTypesKey")?.id();
            if (!currency) throw new Error("Allflame bracket has no currency reference.");
            return {
                id: `allflame:${row.index}`,
                currency,
                tier: row.unnamedInt32(1),
                outcomes: { min: row.unnamedInt32(2), max: row.unnamedInt32(3) },
                sulphurCost: row.number("Cost"),
                intangibility: { min: row.unnamedInt32(12), max: row.unnamedInt32(13) },
            };
        }),
    };
}
