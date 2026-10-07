import type { ItemQuery } from "@poe-tools/item-query";
import {
    buildCraftingTradeSearch,
    type CraftingTradeCatalog,
    loadCraftingTradeMetadata,
} from "./crafting-trade";

self.onmessage = async ({
    data,
}: MessageEvent<{ catalog: CraftingTradeCatalog; query: ItemQuery; league: string }>) => {
    try {
        self.postMessage({
            result: buildCraftingTradeSearch(
                data.catalog,
                data.query,
                data.league,
                await loadCraftingTradeMetadata(data.query.game),
            ),
        });
    } catch (error) {
        self.postMessage({
            error: error instanceof Error ? error.message : "Cannot prepare this trade search.",
        });
    }
};
