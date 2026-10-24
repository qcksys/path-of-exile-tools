import { inArray, notInArray } from "drizzle-orm";
import { tStashUniqueHourly as market } from "~/db/schema/stash.unique-hourly";
import { type MarketFilters, marketCategorySchema } from "~/schemas/market";
import poe1 from "../../public/game-data/market-categories-poe1.json";
import poe2 from "../../public/game-data/market-categories-poe2.json";

const catalogs = {
    poe1: new Map(
        Object.entries(poe1).map(([name, category]) => [
            name,
            marketCategorySchema.parse(category),
        ]),
    ),
    poe2: new Map(
        Object.entries(poe2).map(([name, category]) => [
            name,
            marketCategorySchema.parse(category),
        ]),
    ),
};

export function marketCategory(realm: string, baseType: string) {
    return catalogs[realm === "poe2" ? "poe2" : "poe1"].get(baseType) ?? "other";
}

export function marketCategoryFilter({ realm, category }: MarketFilters) {
    if (category === "all") return undefined;
    const catalog = catalogs[realm === "poe2" ? "poe2" : "poe1"];
    const bases = [...catalog]
        .filter(([, value]) => (category === "other" ? value !== "other" : value === category))
        .map(([name]) => name);
    return category === "other"
        ? notInArray(market.baseType, bases)
        : inArray(market.baseType, bases);
}
