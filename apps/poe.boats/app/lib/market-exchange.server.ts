import exchangeCategoriesPoe2 from "~/data/exchange-categories-poe2.json";
import type { MarketExchangeCategory, Poe2ExchangeCategory } from "~/lib/market-categories";
import { marketCategory } from "~/lib/market-categories.server";
import poe1 from "../../public/game-data/market-exchange-items-poe1.json";
import poe2 from "../../public/game-data/market-exchange-items-poe2.json";

const names: Record<"poe1" | "poe2", Record<string, string>> = { poe1, poe2 };
const poe2Categories: Record<string, Poe2ExchangeCategory> = exchangeCategoriesPoe2.items as Record<
    string,
    Poe2ExchangeCategory
>;

/** Name and category of an exchange item; undefined for IDs outside the game catalog. */
export function marketExchangeItem(
    realm: string,
    itemId: string,
): { name: string; category: MarketExchangeCategory } | undefined {
    const game = realm === "poe2" ? "poe2" : "poe1";
    const name = Object.hasOwn(names[game], itemId) ? names[game][itemId] : undefined;
    if (!name) return undefined;
    if (game === "poe1") return { name, category: marketCategory(realm, name) };
    return {
        name,
        category: Object.hasOwn(poe2Categories, itemId) ? poe2Categories[itemId]! : "other",
    };
}
