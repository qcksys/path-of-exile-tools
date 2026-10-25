import type { LineSeriesOption } from "echarts/charts";
import type { TooltipComponentOption } from "echarts/components";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { type CostPoint, historyChartOption } from "~/components/crafting/process-cost-history";
import { MarketPriceChart, marketPriceChartOption } from "~/components/market-price-chart";
import { type ChartOption, init } from "~/lib/echarts";
import { marketNumber } from "~/lib/market-number";
import { marketFiltersSchema, marketLink } from "~/schemas/market";

function renderSvg(option: ChartOption) {
    const chart = init(null, null, { renderer: "svg", ssr: true, width: 920, height: 260 });
    chart.setOption(option);
    const svg = chart.renderToSVGString();
    chart.dispose();
    return svg;
}

function series(option: ChartOption) {
    return (option.series as LineSeriesOption[])[0]!;
}

function tooltipValue(option: ChartOption, value: number | null) {
    const { valueFormatter } = option.tooltip as TooltipComponentOption;
    return valueFormatter!(value as number, 0);
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
    it("shows missing currency data without inventing a zero price", () => {
        const points = [{ hour: 3600, prices: { chaos: { median: 20 } } }];
        const markup = renderToStaticMarkup(<MarketPriceChart points={points} currency="divine" />);
        expect(markup).toContain("No asking prices");
        expect(markup).not.toContain('role="img"');
        expect(marketPriceChartOption(points, "divine")).toBeNull();
    });
    it("gives a constant price history a nonzero chart range", () => {
        const option = marketPriceChartOption(
            [{ hour: 3600, prices: { divine: { median: 10 } } }],
            "divine",
        )!;
        const labels = new Set(
            [...renderSvg(option).matchAll(/<text[^>]*>([\d.,]+)<\/text>/g)].map(
                ([, label]) => label,
            ),
        );
        expect(labels.size).toBeGreaterThan(1);
    });
    it("does not connect prices across hours with no observations", () => {
        const option = marketPriceChartOption(
            [
                { hour: 3600, prices: { divine: { median: 10 } } },
                { hour: 7200, prices: { divine: { median: 15 } } },
                { hour: 10800, prices: null },
                { hour: 14400, prices: { divine: { median: 20 } } },
            ],
            "divine",
        )!;
        expect(series(option).data).toEqual([
            [3600_000, 10],
            [7200_000, 15],
            [10800_000, null],
            [14400_000, 20],
        ]);
        const line = renderSvg(option).match(/<path d="([^"]*)"[^>]*stroke-width="2.5"/)![1]!;
        expect(line.match(/M/g)).toHaveLength(2);
        expect(tooltipValue(option, 15)).toBe("15 divine");
        expect(tooltipValue(option, null)).toBe("No observations");
        expect(tooltipValue(option, Number.NaN)).toBe("No observations");
        expect(
            renderToStaticMarkup(
                <MarketPriceChart
                    points={[{ hour: 3600, prices: { divine: { median: 10 } } }]}
                    currency="divine"
                />,
            ),
        ).toContain("Hourly median asking price in divine");
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
        expect(tooltipValue(option, 10.5)).toBe("10.50 chaos");
        expect(tooltipValue(option, null)).toBe("Unavailable");
    });
});
