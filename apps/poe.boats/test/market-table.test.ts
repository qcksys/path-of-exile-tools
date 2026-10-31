import { describe, expect, it } from "vite-plus/test";
import {
    applyMarketTableFilters,
    marketTableFilters,
    marketTableOrder,
    marketTableSorting,
} from "~/lib/market-table";
import { MARKET_ORDERS, type MarketOrder, marketFiltersSchema, marketLink } from "~/schemas/market";

describe("market table state", () => {
    it.each(
        Object.keys(MARKET_ORDERS) as MarketOrder[],
    )("maps the %s order to one sorted header and back", (order) => {
        const sorting = marketTableSorting(order);
        expect(sorting).toHaveLength(1);
        expect(marketTableOrder(sorting)).toBe(order);
    });

    it("sorts by likely sales when no header is sorted", () => {
        expect(marketTableOrder([])).toBe("sales");
    });

    it("keeps only the filters of the link's category", () => {
        const link = (category: string) =>
            new URL(
                marketLink(
                    marketFiltersSchema.parse({
                        category,
                        baseClass: "Helmet",
                        attributes: "int",
                        quality: "30",
                        gemLevel: "20",
                        gemVaal: "true",
                        mapMods: "8",
                    }),
                ),
                "https://example.invalid",
            ).searchParams;
        const kept = (category: string) =>
            ["baseClass", "attributes", "quality", "gemLevel", "gemVaal", "mapMods"].filter(
                (param) => link(category).has(param),
            );
        expect(kept("armour-bases")).toEqual(["baseClass", "attributes", "quality"]);
        expect(kept("armour")).toEqual(["baseClass", "attributes"]);
        expect(kept("weapons")).toEqual(["baseClass"]);
        expect(kept("gems")).toEqual(["gemLevel", "gemVaal"]);
        expect(kept("maps")).toEqual(["mapMods"]);
        expect(kept("currency")).toEqual([]);
    });

    it("maps the item filter to the text search and range filters to URL bounds", () => {
        const filters = marketFiltersSchema.parse({ q: "old", page: 4, salesMax: 9 });
        const next = applyMarketTableFilters(filters, [
            { id: "item", value: "Goathide" },
            { id: "price", value: ["1.5", ""] },
            { id: "listings", value: ["", "20"] },
            { id: "sellers", value: ["-1", "abc"] },
        ]);
        expect(next).toMatchObject({
            q: "Goathide",
            page: 1,
            priceMin: 1.5,
            priceMax: undefined,
            listingsMin: undefined,
            listingsMax: 20,
            sellersMin: undefined,
            sellersMax: undefined,
            salesMin: undefined,
            salesMax: undefined,
        });
        expect(marketTableFilters(next)).toEqual([
            { id: "item", value: "Goathide" },
            { id: "price", value: ["1.5", ""] },
            { id: "listings", value: ["", "20"] },
        ]);
    });

    it("keeps range bounds in links and drops unset ones", () => {
        const filters = marketFiltersSchema.parse({ priceMin: "0.5", salesMax: "3" });
        const params = new URL(marketLink(filters), "https://example.invalid").searchParams;
        expect(params.get("priceMin")).toBe("0.5");
        expect(params.get("salesMax")).toBe("3");
        expect(params.has("priceMax")).toBe(false);
        expect(marketFiltersSchema.parse(Object.fromEntries(params))).toMatchObject({
            priceMin: 0.5,
            salesMax: 3,
        });
    });

    it.each([
        { priceMin: "-1" },
        { listingsMax: "1e13" },
        { sellersMin: "many" },
    ])("rejects invalid range bounds %j", (input) => {
        expect(marketFiltersSchema.safeParse(input).success).toBe(false);
    });
});
