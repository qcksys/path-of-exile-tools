import { and, eq, inArray, ne, notInArray, or } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
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

/** Gem markets carry a `gem` signature; transfigured gems may have no base type in the catalog. */
const GEM_KIND = "gem";

export function marketCategory(realm: string, baseType: string, signatureKind = "") {
    if (signatureKind === GEM_KIND) return "gems";
    return catalogs[realm === "poe2" ? "poe2" : "poe1"].get(baseType) ?? "other";
}

export function marketCategoryFilter(
    { realm, category }: MarketFilters,
    baseType: AnyMySqlColumn,
    signatureKind: AnyMySqlColumn,
) {
    if (category === "all") return undefined;
    const catalog = catalogs[realm === "poe2" ? "poe2" : "poe1"];
    const bases = [...catalog]
        .filter(([, value]) => (category === "other" ? value !== "other" : value === category))
        .map(([name]) => name);
    if (category === "other") return and(notInArray(baseType, bases), ne(signatureKind, GEM_KIND));
    if (category === "gems") return or(inArray(baseType, bases), eq(signatureKind, GEM_KIND));
    return inArray(baseType, bases);
}
