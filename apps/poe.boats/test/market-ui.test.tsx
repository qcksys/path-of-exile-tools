import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { MarketPriceChart } from "~/components/market-price-chart";
import { marketNumber } from "~/lib/market-number";
import { type MergedMarketPrice, marketFiltersSchema, marketLink } from "~/schemas/market";

function flat(price: number): MergedMarketPrice {
    return {
        count: 1,
        unconverted: 0,
        mean: price,
        min: price,
        p10: price,
        p25: price,
        median: price,
        p75: price,
        p90: price,
        max: price,
    };
}

describe("market browsing", () => {
    it("preserves small fractional prices without rounding them to zero", () => {
        expect(marketNumber(1 / 5000)).toBe("0.0002");
        expect(marketNumber(0)).toBe("0");
        expect(marketNumber(12345)).toBe("12,345");
    });
    it("preserves season, currency, and all variant axes in detail links", () => {
        const filters = marketFiltersSchema.parse({
            league: "Season A",
            realm: "poe2",
            currency: "chaos",
            category: "jewels",
            order: "price-asc",
            rarity: "unique",
            corruption: "true",
            identification: "true",
            page: 3,
        });
        const link = marketLink(filters, {
            itemKey: "Watcher's Eye",
            identified: true,
            corrupted: true,
            foilVariation: 3,
            signatureKind: "watchers-eye",
            signatureValue: "variant",
        });
        const parsed = marketFiltersSchema.parse(
            Object.fromEntries(new URL(link, "https://example.invalid").searchParams),
        );
        expect(decodeURIComponent(new URL(link, "https://example.invalid").pathname)).toBe(
            "/1/market/items/Watcher's Eye",
        );
        expect(parsed).toMatchObject({
            league: "Season A",
            realm: "poe2",
            currency: "chaos",
            category: "jewels",
            order: "price-asc",
            rarity: "unique",
            corruption: "true",
            identification: "true",
            page: 3,
            identified: "true",
            corrupted: "true",
            foil: 3,
            kind: "watchers-eye",
            value: "variant",
        });
    });
    it.each([
        { days: "100000" },
        { page: "NaN" },
        { realm: "invalid" },
        { q: "a".repeat(101) },
        { category: "unknown" },
        { order: "unknown" },
        { rarity: "legendary" },
        { corruption: "yes" },
    ])("rejects unbounded or invalid filters %j", (input) => {
        expect(marketFiltersSchema.safeParse(input).success).toBe(false);
    });
    it("shows unconvertible currency data without inventing a zero price", () => {
        const markup = renderToStaticMarkup(
            <MarketPriceChart points={[{ hour: 3600, merged: null }]} currency="divine" />,
        );
        expect(markup).toContain("No asking prices");
        expect(markup).not.toContain("<svg");
    });
    it("gives a constant price history a nonzero chart range", () => {
        const markup = renderToStaticMarkup(
            <MarketPriceChart points={[{ hour: 3600, merged: flat(10) }]} currency="divine" />,
        );
        expect(markup).toContain('cy="130"');
        expect(markup).toContain(">9</text>");
        expect(markup).toContain(">11</text>");
    });
    it("does not connect prices across hours with no observations", () => {
        const markup = renderToStaticMarkup(
            <MarketPriceChart
                points={[
                    { hour: 3600, merged: flat(10) },
                    { hour: 10800, merged: flat(20) },
                ]}
                currency="divine"
            />,
        );
        expect(markup).toContain('d="M68,210 M868,50"');
        expect(markup).toContain("Hourly median asking price in divine");
    });
    it("shades the interquartile range and reports unconverted listings", () => {
        const markup = renderToStaticMarkup(
            <MarketPriceChart
                points={[
                    { hour: 3600, merged: { ...flat(10), p25: 5, p75: 15, unconverted: 2 } },
                    { hour: 7200, merged: { ...flat(10), p25: 5, p75: 15 } },
                ]}
                currency="chaos"
            />,
        );
        expect(markup).toContain('d="M68,50 L868,50 L868,210 L68,210 Z"');
        expect(markup).toContain('d="M68,130 L868,130"');
        expect(markup).toContain("2 without an exchange rate");
    });
});
