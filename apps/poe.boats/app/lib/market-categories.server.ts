import { and, eq, inArray, ne, notInArray, or } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { RECIPE_BEASTS } from "~/lib/crafting-beasts";
import { bestiaryNames } from "~/lib/crafting-yellow-beasts";
import { marketBaseTypesSchema } from "~/lib/market-bases";
import { isMarketUniqueCategory } from "~/lib/market-categories";
import { type MarketFilters, marketCategorySchema } from "~/schemas/market";
import poe1BaseTypes from "../../public/game-data/market-base-types-poe1.json";
import poe1 from "../../public/game-data/market-categories-poe1.json";
import poe2 from "../../public/game-data/market-categories-poe2.json";

/**
 * Captured beasts' base type is the beast's name, which no base item has: spirit beasts are
 * uniques, and other beasts are rares.
 */
const BEASTS = new Set([...Object.values(RECIPE_BEASTS), ...bestiaryNames]);

const catalogs = {
    poe1: new Map([
        ...Object.entries(poe1).map(
            ([name, category]) => [name, marketCategorySchema.parse(category)] as const,
        ),
        ...[...BEASTS].map((name) => [name, "beasts"] as const),
    ]),
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

const baseTypes = marketBaseTypesSchema.parse(poe1BaseTypes);

/** Unique equipment of a base type (item class) and attribute set, as crafting bases filter. */
function baseTypeMatch(
    name: string,
    { baseClass, attributes }: Pick<MarketFilters, "baseClass" | "attributes">,
) {
    if (!baseClass && !attributes) return true;
    const type = baseTypes[name];
    return (
        !!type &&
        (!baseClass || type.itemClass === baseClass) &&
        (!attributes || type.attributes === attributes)
    );
}

export function marketCategoryFilter(
    filters: MarketFilters,
    baseType: AnyMySqlColumn,
    signatureKind: AnyMySqlColumn,
) {
    const { realm, category } = filters;
    if (category === "all") return undefined;
    const catalog = catalogs[realm === "poe2" ? "poe2" : "poe1"];
    const unique = isMarketUniqueCategory(category);
    const bases = [...catalog]
        .filter(([, value]) => (category === "other" ? value !== "other" : value === category))
        .filter(([name]) => !unique || baseTypeMatch(name, filters))
        .map(([name]) => name);
    if (category === "other") return and(notInArray(baseType, bases), ne(signatureKind, GEM_KIND));
    if (category === "gems") return or(inArray(baseType, bases), eq(signatureKind, GEM_KIND));
    return inArray(baseType, bases);
}
