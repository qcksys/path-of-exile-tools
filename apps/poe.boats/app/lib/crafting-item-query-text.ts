import { type ItemQuerySelection, queryFromItem } from "@poe-tools/item-query";
import type { CraftingItemQueryTextResult } from "~/schemas/crafting-item-query-text";
import type { CraftingEngine } from "./crafting-engine";
import { createCraftingItemQuery } from "./crafting-item-query";
import { importCraftingItemText } from "./crafting-item-text";

export function queriesFromItemText(
    engine: CraftingEngine,
    text: string,
    selection: ItemQuerySelection,
): CraftingItemQueryTextResult {
    const adapter = createCraftingItemQuery(engine);
    const matches = importCraftingItemText(engine, text);
    return {
        matches: matches.map(({ item, warnings }) => {
            const record = adapter.record(item);
            record.source = "paste";
            if (item.unidentified) {
                record.facts.prefixes = undefined;
                record.facts.suffixes = undefined;
            }
            if (!/^(?:Sockets|Socket Count):/m.test(text)) {
                record.facts.socketCount = undefined;
                record.facts.linkedSockets = undefined;
            }
            const result = queryFromItem(record, selection);
            return {
                item,
                record,
                query: result.query,
                warnings: [...warnings, ...result.warnings],
            };
        }),
    };
}
