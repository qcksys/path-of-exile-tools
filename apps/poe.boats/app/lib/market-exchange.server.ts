import { marketCategory } from "~/lib/market-categories.server";
import poe1 from "../../public/game-data/market-exchange-items-poe1.json";
import poe2 from "../../public/game-data/market-exchange-items-poe2.json";

const names: Record<"poe1" | "poe2", Record<string, string>> = { poe1, poe2 };

/** Name and category of an exchange item; undefined for IDs outside the game catalog. */
export function marketExchangeItem(realm: string, itemId: string) {
    const game = realm === "poe2" ? "poe2" : "poe1";
    const name = Object.hasOwn(names[game], itemId) ? names[game][itemId] : undefined;
    return name ? { name, category: marketCategory(realm, name) } : undefined;
}
