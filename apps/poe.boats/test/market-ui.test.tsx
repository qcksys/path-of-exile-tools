import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { MarketPriceChart } from "~/components/market-price-chart";
import { marketNumber } from "~/lib/market-number";
import { marketFiltersSchema, marketLink } from "~/schemas/market";

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
        expect(parsed).toMatchObject({
            league: "Season A",
            realm: "poe2",
            currency: "chaos",
            item: "Watcher's Eye",
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
    ])("rejects unbounded or invalid filters %j", (input) => {
        expect(marketFiltersSchema.safeParse(input).success).toBe(false);
    });
    it("shows missing currency data without inventing a zero price", () => {
        const markup = renderToStaticMarkup(
            <MarketPriceChart
                points={[{ hour: 3600, prices: { chaos: { median: 20 } } }]}
                currency="divine"
            />,
        );
        expect(markup).toContain("No asking prices");
        expect(markup).not.toContain("<svg");
    });
    it("gives a constant price history a nonzero chart range", () => {
        const markup = renderToStaticMarkup(
            <MarketPriceChart
                points={[{ hour: 3600, prices: { divine: { median: 10 } } }]}
                currency="divine"
            />,
        );
        expect(markup).toContain('cy="130"');
        expect(markup).toContain(">9</text>");
        expect(markup).toContain(">11</text>");
    });
    it("does not connect prices across hours with no observations", () => {
        const markup = renderToStaticMarkup(
            <MarketPriceChart
                points={[
                    { hour: 3600, prices: { divine: { median: 10 } } },
                    { hour: 10800, prices: { divine: { median: 20 } } },
                ]}
                currency="divine"
            />,
        );
        expect(markup).toContain('d="M68,210 M868,50"');
        expect(markup).toContain("Hourly median asking price in divine");
    });
});
