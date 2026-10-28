import type { LineSeriesOption } from "echarts/charts";
import type { TooltipComponentOption } from "echarts/components";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { type CostPoint, historyChartOption } from "~/components/crafting/process-cost-history";
import { MarketPriceChart, marketPriceChartOption } from "~/components/market-price-chart";
import { type ChartOption, init } from "~/lib/echarts";
import { marketNumber } from "~/lib/market-number";
import {
    type MergedMarketPrice,
    marketCorruption,
    marketFiltersSchema,
    marketLink,
} from "~/schemas/market";

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

function renderSvg(option: ChartOption) {
    const chart = init(null, null, { renderer: "svg", ssr: true, width: 920, height: 260 });
    chart.setOption(option);
    const svg = chart.renderToSVGString();
    chart.dispose();
    return svg;
}

function series(option: ChartOption, index = 0) {
    return (option.series as LineSeriesOption[])[index]!;
}

function tooltipValue(option: ChartOption, index: number, value: number | null, dataIndex = 0) {
    const valueFormatter =
        series(option, index).tooltip?.valueFormatter ??
        (option.tooltip as TooltipComponentOption).valueFormatter;
    return valueFormatter!(value as number, dataIndex);
}

function axisLabels(svg: string) {
    return [...svg.matchAll(/<text[^>]*>([\d.,]+)<\/text>/g)].map(([, label]) =>
        Number(label!.replaceAll(",", "")),
    );
}

const saleMedian = 2;
const lowestAsk = 3;

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
            corruption: "true",
            identification: "true",
            page: 3,
        });
        const link = marketLink(filters, {
            itemKey: "Watcher's Eye",
            identified: true,
            corrupted: true,
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
            corruption: "true",
            identification: "true",
            page: 3,
            identified: "true",
            corrupted: "true",
            kind: "watchers-eye",
            value: "variant",
        });
        expect(new URL(link, "https://example.invalid").searchParams.has("foil")).toBe(false);
    });
    it("links one link count of a unique, or every link count merged", () => {
        const filters = marketFiltersSchema.parse({ league: "Season A" });
        const item = {
            itemKey: "Loreweave",
            identified: true,
            corrupted: false,
            signatureKind: "",
            signatureValue: "",
        };
        const params = (links?: number | null) =>
            new URL(marketLink(filters, { ...item, links }), "https://example.invalid")
                .searchParams;
        expect(marketFiltersSchema.parse(Object.fromEntries(params(6))).links).toBe("6");
        expect(marketFiltersSchema.parse(Object.fromEntries(params(0))).links).toBe("0");
        expect(params(null).has("links")).toBe(false);
        expect(params().has("links")).toBe(false);
        expect(marketFiltersSchema.safeParse({ links: "4" }).success).toBe(false);
    });
    it("defaults unique equipment searches to uncorrupted and leaves the URL to an explicit choice", () => {
        const corruption = (input: Record<string, string>) =>
            marketCorruption(marketFiltersSchema.parse(input));
        expect(corruption({ category: "weapons" })).toBe("false");
        expect(corruption({ category: "armour" })).toBe("false");
        expect(corruption({ category: "accessories" })).toBe("false");
        expect(corruption({ category: "armour", corruption: "all" })).toBe("all");
        expect(corruption({ category: "armour-bases" })).toBe("all");
        expect(corruption({ category: "currency" })).toBe("all");
        expect(corruption({})).toBe("all");
        const params = (input: Record<string, string>) =>
            new URL(marketLink(marketFiltersSchema.parse(input)), "https://example.invalid")
                .searchParams;
        expect(params({ category: "armour" }).has("corruption")).toBe(false);
        expect(params({ category: "armour", corruption: "all" }).get("corruption")).toBe("all");
    });
    it.each([
        { days: "100000" },
        { page: "NaN" },
        { realm: "invalid" },
        { q: "a".repeat(101) },
        { category: "unknown" },
        { order: "unknown" },
        { corruption: "yes" },
    ])("rejects unbounded or invalid filters %j", (input) => {
        expect(marketFiltersSchema.safeParse(input).success).toBe(false);
    });
    it("shows unconvertible currency data without inventing a zero price", () => {
        const points = [{ hour: 3600, merged: null, mergedSales: null }];
        const markup = renderToStaticMarkup(<MarketPriceChart points={points} currency="divine" />);
        expect(markup).toContain("No asking prices");
        expect(markup).not.toContain('role="img"');
        expect(marketPriceChartOption(points, "divine")).toBeNull();
    });
    it("gives a constant price history a nonzero chart range", () => {
        const option = marketPriceChartOption(
            [{ hour: 3600, merged: flat(10), mergedSales: null }],
            "divine",
        )!;
        expect(new Set(axisLabels(renderSvg(option))).size).toBeGreaterThan(1);
    });
    it("plots the lowest ask without connecting hours with no observations", () => {
        const ask = (min: number) => ({ ...flat(min * 2), min });
        const option = marketPriceChartOption(
            [
                { hour: 3600, merged: ask(10), mergedSales: null },
                { hour: 7200, merged: ask(15), mergedSales: null },
                { hour: 10800, merged: null, mergedSales: null },
                { hour: 14400, merged: ask(20), mergedSales: null },
            ],
            "divine",
        )!;
        expect(series(option, lowestAsk).data).toEqual([
            [3600_000, 10],
            [7200_000, 15],
            [10800_000, null],
            [14400_000, 20],
        ]);
        const line = renderSvg(option).match(/<path d="([^"]*)"[^>]*stroke-width="2.5"/)![1]!;
        expect(line.match(/M/g)).toHaveLength(2);
        expect(tooltipValue(option, lowestAsk, 15, 1)).toBe(
            "15 divine (lowest of 1 listings, median 30)",
        );
        expect(tooltipValue(option, lowestAsk, null, 2)).toBe("No listings");
        expect(
            renderToStaticMarkup(
                <MarketPriceChart
                    points={[{ hour: 3600, merged: flat(10), mergedSales: null }]}
                    currency="divine"
                />,
            ),
        ).toContain("Hourly lowest asking price in divine");
    });
    it("shades the likely-sale interquartile range, ignoring outlying asks", () => {
        const outlier = { ...flat(4), p75: 300_000, p90: 300_000, max: 300_000 };
        const sale = { ...flat(10), p25: 5, p75: 15 };
        const option = marketPriceChartOption(
            [
                { hour: 3600, merged: outlier, mergedSales: { ...sale, unconverted: 2 } },
                { hour: 7200, merged: outlier, mergedSales: sale },
            ],
            "chaos",
        )!;
        expect(series(option, 0).data).toEqual([
            [3600_000, 5],
            [7200_000, 5],
        ]);
        expect(series(option, 1)).toMatchObject({
            stack: series(option, 0).stack,
            areaStyle: { opacity: 0.15 },
            data: [
                [3600_000, 10],
                [7200_000, 10],
            ],
        });
        const labels = axisLabels(renderSvg(option));
        expect(Math.min(...labels)).toBeLessThanOrEqual(4);
        expect(Math.max(...labels)).toBeGreaterThanOrEqual(15);
        expect(Math.max(...labels)).toBeLessThan(100);
        expect(tooltipValue(option, saleMedian, 10, 0)).toBe(
            "10 chaos (interquartile 5–15, 1 likely sales, 2 without an exchange rate)",
        );
    });
    it("connects sale prices across listed hours without a sale but not across gaps", () => {
        const option = marketPriceChartOption(
            [
                { hour: 3600, merged: flat(1), mergedSales: flat(10) },
                { hour: 7200, merged: flat(1), mergedSales: null },
                { hour: 10800, merged: flat(1), mergedSales: flat(12) },
                { hour: 18000, merged: flat(1), mergedSales: flat(14) },
            ],
            "chaos",
        )!;
        expect(series(option, saleMedian).data).toEqual([
            [3600_000, 10],
            [10800_000, 12],
            [14400_000, null],
            [18000_000, 14],
        ]);
        expect(tooltipValue(option, saleMedian, 12, 1)).toBe(
            "12 chaos (interquartile 12–12, 1 likely sales)",
        );
    });
    it("shows each hour's prices in every price currency at that hour's rates", () => {
        const option = marketPriceChartOption(
            [
                { hour: 3600, merged: flat(5), mergedSales: null, priceRates: { chaos: 1 } },
                {
                    hour: 7200,
                    merged: flat(5),
                    mergedSales: null,
                    priceRates: { chaos: 1, divine: 0.01 },
                },
            ],
            "chaos",
        )!;
        expect(tooltipValue(option, lowestAsk, 5, 0)).toBe("5c (lowest of 1 listings, median 5c)");
        expect(tooltipValue(option, lowestAsk, 5, 1)).toBe(
            "5c, 1/20d (lowest of 1 listings, median 5c, 1/20d)",
        );
    });
    it("plots historical process costs with gaps for unavailable estimates", () => {
        const point = (at: number, meanCost: number | null): CostPoint => ({
            at,
            result:
                meanCost === null
                    ? null
                    : ({ complete: true, meanCost } as unknown as CostPoint["result"]),
            issues: [],
            itemConfidence: null,
        });
        expect(historyChartOption([point(3600, null)], "chaos")).toBeNull();
        const option = historyChartOption(
            [point(3600, 12), point(7200, null), point(10800, 10.5)],
            "chaos",
        )!;
        expect(series(option).data).toEqual([
            [3600_000, 12],
            [7200_000, null],
            [10800_000, 10.5],
        ]);
        expect(renderSvg(option)).toContain("<path");
        expect(tooltipValue(option, 0, 10.5)).toBe("10.50 chaos");
        expect(tooltipValue(option, 0, null)).toBe("Unavailable");
    });
});
