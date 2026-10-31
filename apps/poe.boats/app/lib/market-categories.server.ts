import { marketBaseMarketCategory, marketBaseTypes } from "@poe-tools/market";
import { and, eq, inArray, isNull, ne, notInArray, or } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { RECIPE_BEASTS } from "~/lib/crafting-beasts";
import {
    bestiaryNames,
    isYellowBeast,
    yellowBeastMarket,
    yellowBeastNames,
} from "~/lib/crafting-yellow-beasts";
import { FORBIDDEN_JEWELS, isForbiddenJewel } from "~/lib/forbidden-jewels";
import { marketBaseTypesSchema } from "~/lib/market-bases";
import { MARKET_FORBIDDEN_CATEGORY } from "~/lib/market-categories";
import { marketSettings } from "~/lib/market-kinds";
import { type MarketFilters, marketCategorySchema } from "~/schemas/market";
import poe1BaseTypes from "../../public/game-data/market-base-types-poe1.json";
import poe1 from "../../public/game-data/market-categories-poe1.json";
import poe2 from "../../public/game-data/market-categories-poe2.json";

/**
 * Captured beasts' base type is the beast's name, which no base item has: spirit beasts are
 * uniques, and other beasts are rares. Yellow beast species are listed together as one
 * `Yellow Beast` market, so lists leave out their own rows.
 */
const BEASTS = new Set([...Object.values(RECIPE_BEASTS), ...bestiaryNames, yellowBeastMarket]);

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
/** Crafting base markets share base types with uniques, and list apart from them. */
const BASE_KIND = "base";

export function marketCategory(
    realm: string,
    baseType: string,
    signatureKind = "",
    name: string | null = null,
) {
    if (signatureKind === GEM_KIND) return "gems";
    if (signatureKind === BASE_KIND)
        return marketCategorySchema.catch("other").parse(marketBaseMarketCategory(baseType));
    const category = catalogs[realm === "poe2" ? "poe2" : "poe1"].get(baseType) ?? "other";
    return category === "jewels" && isForbiddenJewel(name) ? MARKET_FORBIDDEN_CATEGORY : category;
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
    {
        baseType,
        signatureKind,
        name,
    }: Record<"baseType" | "signatureKind" | "name", AnyMySqlColumn>,
) {
    const { realm, category } = filters;
    if (category === "all")
        return realm === "poe2" ? undefined : notInArray(baseType, [...yellowBeastNames]);
    const catalog = catalogs[realm === "poe2" ? "poe2" : "poe1"];
    const { kind } = marketSettings(category);
    if (kind === "base")
        return and(
            eq(signatureKind, BASE_KIND),
            inArray(
                baseType,
                marketBaseTypes()
                    .filter(
                        (base) =>
                            base.category === category &&
                            (!filters.baseClass || base.itemClass === filters.baseClass) &&
                            (!filters.attributes ||
                                base.attributes.join("-") === filters.attributes),
                    )
                    .map((base) => base.baseType),
            ),
        );
    const unique = kind === "unique";
    const forbidden = kind === "forbidden";
    // Forbidden jewels have no base types of their own: they are jewels picked out by name.
    const listed = forbidden ? "jewels" : category;
    const bases = [...catalog]
        .filter(([, value]) => (category === "other" ? value !== "other" : value === listed))
        .filter(([base]) => !unique || baseTypeMatch(base, filters))
        .map(([base]) => base)
        .filter((base) => category === "other" || !isYellowBeast(base));
    const notBase = ne(signatureKind, BASE_KIND);
    if (category === "other")
        return and(notInArray(baseType, bases), ne(signatureKind, GEM_KIND), notBase);
    if (category === "gems") return or(inArray(baseType, bases), eq(signatureKind, GEM_KIND));
    if (forbidden) return and(inArray(baseType, bases), inArray(name, [...FORBIDDEN_JEWELS]));
    if (category === "jewels")
        return and(
            inArray(baseType, bases),
            notBase,
            or(isNull(name), notInArray(name, [...FORBIDDEN_JEWELS])),
        );
    return and(inArray(baseType, bases), notBase);
}
