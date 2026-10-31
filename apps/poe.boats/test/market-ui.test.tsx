import type { LineSeriesOption } from "echarts/charts";
import type { TooltipComponentOption } from "echarts/components";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { type CostPoint, historyChartOption } from "~/components/crafting/process-cost-history";
import { resolveTokens } from "~/components/echart";
import { exchangeDisplays, exchangePriceText } from "~/components/market-exchange";
import { marketExchangeChartOption } from "~/components/market-exchange-chart";
import { MarketPriceChart, marketPriceChartOption } from "~/components/market-price-chart";
import { type ChartOption, init } from "~/lib/echarts";
import { marketNumber } from "~/lib/market-number";
import type { MarketPriceRates } from "~/lib/market-price-currencies";
import {
    type MergedMarketPrice,
    marketCorruption,
    marketFiltersSchema,
    marketIdentification,
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

function point(
    hour: number,
    merged: MergedMarketPrice | null,
    mergedSales: MergedMarketPrice | null = null,
    priceRates: MarketPriceRates = { chaos: 1 },
) {
    return { hour, merged, mergedSales, priceRates, listingCount: 1 };
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

/** A price chart's tooltip as text for the hovered hour, with its cells split by ` | `. */
function hourTooltip(option: ChartOption, hour: number) {
    const { formatter } = option.tooltip as unknown as {
        formatter: (params: { axisIndex: number; axisValue: number }[]) => string;
    };
    return formatter([
        // Other panels snap to their own nearest data, which must not change the hour shown.
        { axisIndex: 2, axisValue: 1 },
        { axisIndex: 1, axisValue: hour * 1000 },
    ])
        .replace(/<\/(td|div|tr)>/g, " | ")
        .replace(/<[^>]+>/g, "")
        .replace(/( \| )+/g, " | ")
        .replace(/ \| $/, "");
}

/** A price chart's numeric axis labels above its count panel, which starts at 70% of the height. */
function axisLabels(svg: string) {
    return [...svg.matchAll(/<text[^>]*translate\([\d.]+ ([\d.]+)\)[^>]*>([\d.,]+)<\/text>/g)]
        .filter(([, y]) => Number(y) < 260 * 0.66)
        .map(([, , label]) => Number(label!.replaceAll(",", "")));
}

const lowestSale = 6;
const lowestAsk = 7;

function many(price: MergedMarketPrice, count = 9): MergedMarketPrice {
    return { ...price, count };
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
    it("ignores a stash tab choice from an older link", () => {
        const filters = marketFiltersSchema.parse({ tab: "other" });
        expect(filters).not.toHaveProperty("tab");
        expect(
            new URL(marketLink(filters), "https://example.invalid").searchParams.has("tab"),
        ).toBe(false);
    });
    it("defaults unique equipment searches to uncorrupted and leaves the URL to an explicit choice", () => {
        const corruption = (input: Record<string, string>) =>
            marketCorruption(marketFiltersSchema.parse(input));
        expect(corruption({ category: "weapons" })).toBe("false");
        expect(corruption({ category: "armour" })).toBe("false");
        expect(corruption({ category: "accessories" })).toBe("false");
        expect(corruption({ category: "armour", corruption: "all" })).toBe("all");
        expect(corruption({ category: "armour-bases" })).toBe("all");
        expect(corruption({ category: "forbidden" })).toBe("all");
        expect(corruption({ category: "currency" })).toBe("all");
        expect(corruption({})).toBe("all");
        const params = (input: Record<string, string>) =>
            new URL(marketLink(marketFiltersSchema.parse(input)), "https://example.invalid")
                .searchParams;
        expect(params({ category: "armour" }).has("corruption")).toBe(false);
        expect(params({ category: "armour", corruption: "all" }).get("corruption")).toBe("all");
    });
    it("ignores identification and corruption in categories whose markets do not split by them", () => {
        const applied = (input: Record<string, string>) => {
            const filters = marketFiltersSchema.parse(input);
            return [marketIdentification(filters), marketCorruption(filters)];
        };
        const split = { identification: "false", corruption: "true" };
        expect(applied({ category: "jewels", ...split })).toEqual(["false", "true"]);
        expect(applied({ category: "maps", ...split })).toEqual(["false", "true"]);
        expect(applied({ category: "gems", ...split })).toEqual(["all", "true"]);
        for (const category of ["currency", "cards", "scarabs", "armour-bases"])
            expect(applied({ category, ...split })).toEqual(["all", "all"]);
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
        const points = [point(3600, null)];
        const markup = renderToStaticMarkup(<MarketPriceChart points={points} game="poe1" />);
        expect(markup).toContain("No asking prices");
        expect(markup).not.toContain('role="img"');
        expect(marketPriceChartOption(points, "poe1")).toBeNull();
    });
    it("gives a constant price history a nonzero chart range", () => {
        const option = marketPriceChartOption([point(3600, flat(10))], "poe1")!;
        expect(new Set(axisLabels(renderSvg(option))).size).toBeGreaterThan(1);
    });
    it("plots the lowest ask without connecting hours with no observations", () => {
        const ask = (min: number) => ({ ...flat(min * 2), min });
        const option = marketPriceChartOption(
            [point(3600, ask(10)), point(7200, ask(15)), point(10800, null), point(14400, ask(20))],
            "poe1",
        )!;
        expect(series(option, lowestAsk).data).toEqual([
            [3600_000, 10],
            [7200_000, 15],
            [10800_000, null],
            [14400_000, 20],
        ]);
        const line = renderSvg(option).match(/<path d="([^"]*)"[^>]*stroke-width="2.5"/)![1]!;
        expect(line.match(/M/g)).toHaveLength(2);
        expect(
            renderToStaticMarkup(<MarketPriceChart points={[point(3600, flat(10))]} game="poe1" />),
        ).toContain("Hourly lowest and average asking and likely sale prices in chaos");
    });
    it("shades the likely-sale interquartile range, ignoring outlying asks", () => {
        const outlier = { ...flat(4), p75: 300_000, p90: 300_000, max: 300_000 };
        const sale = many({ ...flat(10), p25: 5, p75: 15 });
        const option = marketPriceChartOption(
            [point(3600, outlier, { ...sale, unconverted: 2 }), point(7200, outlier, sale)],
            "poe1",
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
    });
    it("shows one hour's prices and counts in one compact tooltip", () => {
        const sale = many({ ...flat(10), p25: 5, p75: 15, mean: 11 });
        const option = marketPriceChartOption(
            [
                {
                    ...point(3600, many({ ...flat(20), p25: 18, p75: 30, mean: 24 }, 40), {
                        ...sale,
                        unconverted: 2,
                    }),
                    mergedDelisted: many(flat(50), 8),
                    listingCount: 40,
                    newCount: null,
                    likelySales: 9,
                    removedCount: 13,
                    relistedCount: 1,
                    pendingCount: 1,
                    soldAgeSeconds: 345_600,
                    priceRates: { chaos: 1, divine: 1 / 200 },
                },
                {
                    ...point(7200, null),
                    newCount: 3,
                    likelySales: 0,
                    removedCount: 0,
                    soldAgeSeconds: null,
                },
                point(14400, flat(5)),
            ],
            "poe1",
        )!;
        expect(hourTooltip(option, 3600)).toBe(
            [
                "1970-01-01 01:00 UTC",
                "Min | Median | IQR | Avg | Count",
                "Ask | 20 | 20 | 18–30 | 24 | 40",
                "Sold | 10 | 10 | 5–15 | 11 | 9",
                // Too few observations for an interquartile range.
                "Delisted | 50 | 50 | — | 50 | 8",
                "Prices in chaos · 1 divine ≈ 200 chaos · 2 without an exchange rate",
                "Total listings | 40",
                "New listings | Not recorded",
                "Likely sold listings | 9",
                "Delisted | 2",
                "Avg sold age | 4 days",
            ].join(" | "),
        );
        // An hour with counts but no prices has no price table.
        expect(hourTooltip(option, 7200)).toBe(
            [
                "1970-01-01 02:00 UTC",
                "Total listings | 1",
                "New listings | 3",
                "Likely sold listings | 0",
                "Delisted | 0",
                "Avg sold age | No likely sales",
            ].join(" | "),
        );
        // The row that breaks the lines across hours without observations.
        expect(hourTooltip(option, 10800)).toBe("1970-01-01 03:00 UTC | No observations");
        expect(option.tooltip).toMatchObject({ trigger: "axis", confine: true });
    });
    it("reads an hour's tooltip prices in the value display", () => {
        const points = [
            point(3600, flat(5), null, { chaos: 1 }),
            point(7200, flat(500), flat(50), { chaos: 1, divine: 0.01 }),
            point(10800, flat(5), null, { chaos: 1, divine: 0.005 }),
        ];
        const adaptive = marketPriceChartOption(points, "poe1")!;
        expect(hourTooltip(adaptive, 3600)).toContain(
            "Ask | 5 | 5 | — | 5 | 1 | Prices in chaos |",
        );
        // One currency for the whole hour, chosen from its typical price.
        expect(hourTooltip(adaptive, 7200)).toContain(
            "Ask | 5 | 5 | — | 5 | 1 | Sold | 0.5 | 0.5 | — | 0.5 | 1 | Prices in divine · 1 divine ≈ 100 chaos |",
        );
        expect(hourTooltip(adaptive, 10800)).toContain("Prices in chaos · 1 divine ≈ 200 chaos |");
        const divine = marketPriceChartOption(points, "poe1", "divine")!;
        expect(hourTooltip(divine, 10800)).toContain(
            "Ask | 0.025 | 0.025 | — | 0.025 | 1 | Prices in divine · 1 divine ≈ 200 chaos |",
        );
        // Without a rate to the display, the hour stays in the exchange unit.
        expect(hourTooltip(divine, 3600)).toContain("Prices in chaos |");
        // Large prices shorten, so the table still fits a phone.
        const large = marketPriceChartOption(
            [point(3600, many({ ...flat(276_069.85), p25: 335_227.68, p75: 473_262.6 }))],
            "poe1",
        )!;
        expect(hourTooltip(large, 3600)).toContain(
            "Ask | 276.1K | 276.1K | 335.2K–473.3K | 276.1K | 9",
        );
    });
    it("shades an ask interquartile range only above 8 listings", () => {
        const ask = { ...flat(10), p25: 8, p75: 14 };
        const option = marketPriceChartOption(
            [point(3600, many(ask, 8)), point(7200, many(ask, 9)), point(10800, many(ask, 40))],
            "poe1",
        )!;
        expect(series(option, 2)).toMatchObject({
            name: "IQR ask",
            color: "var(--primary)",
            data: [
                [3600_000, null],
                [7200_000, 8],
                [10800_000, 8],
            ],
        });
        expect(series(option, 3)).toMatchObject({
            name: "IQR ask",
            stack: series(option, 2).stack,
            data: [
                [3600_000, null],
                [7200_000, 6],
                [10800_000, 6],
            ],
        });
        expect(hourTooltip(option, 3600)).toContain("Ask | 10 | 10 | — | 10 | 8");
        expect(hourTooltip(option, 7200)).toContain("Ask | 10 | 10 | 8–14 | 10 | 9");
    });
    it("connects the sold interquartile band across hours with too few sales", () => {
        const sale = many({ ...flat(10), p25: 8, p75: 14 });
        const option = marketPriceChartOption(
            [
                point(3600, flat(5), sale),
                point(7200, flat(5), flat(9)),
                point(10800, flat(5), sale),
            ],
            "poe1",
        )!;
        expect(series(option, 0).data).toEqual([
            [3600_000, 8],
            [10800_000, 8],
        ]);
        expect(series(option, 1).data).toEqual([
            [3600_000, 6],
            [10800_000, 6],
        ]);
    });
    it("plots average asks and sales, starting with average asks hidden", () => {
        const ask = { ...flat(10), mean: 30 };
        const sale = { ...flat(10), mean: 12 };
        const option = marketPriceChartOption(
            [point(3600, ask, sale), point(7200, { ...ask, mean: null })],
            "poe1",
        )!;
        expect(series(option, 4)).toMatchObject({
            name: "Avg sold (chaos)",
            data: [[3600_000, 12]],
        });
        expect(series(option, 5)).toMatchObject({
            name: "Avg ask (chaos)",
            data: [
                [3600_000, 30],
                [7200_000, null],
            ],
        });
        expect(hourTooltip(option, 3600)).toContain("Ask | 10 | 10 | — | 30 | 1");
        expect(hourTooltip(option, 7200)).toContain("Ask | 10 | 10 | — | — | 1");
        expect((option.legend as { selected: unknown }).selected).toEqual({
            "Avg ask (chaos)": false,
        });
    });
    it("counts delisted listings as removals that are not sales, relists or undecided", () => {
        const option = marketPriceChartOption(
            [
                {
                    ...point(3600, flat(5)),
                    likelySales: 3,
                    removedCount: 10,
                    relistedCount: 2,
                    pendingCount: 1,
                },
            ],
            "poe1",
        )!;
        const delisted = (option.series as LineSeriesOption[]).find(
            (entry) => entry.name === "Delisted",
        )!;
        expect(delisted).toMatchObject({ yAxisIndex: 2, data: [[3600_000, 4]] });
    });
    it("shades a delisted interquartile range only above 8 delisted listings", () => {
        const price = { ...flat(10), p25: 8, p75: 14 };
        const option = marketPriceChartOption(
            [
                { ...point(3600, flat(5)), mergedDelisted: many(price, 9), removedCount: 9 },
                // Too few to shade, so the band connects across this hour.
                { ...point(7200, flat(5)), mergedDelisted: many(price, 8), removedCount: 8 },
                { ...point(10800, flat(5)), mergedDelisted: many(price, 12), removedCount: 12 },
                // Hours without observations still break the band.
                { ...point(18000, flat(5)), mergedDelisted: many(price, 9), removedCount: 9 },
            ],
            "poe1",
        )!;
        expect(series(option, 0)).toMatchObject({
            name: "IQR delisted",
            color: "var(--chart-5)",
            data: [
                [3600_000, 8],
                [10800_000, 8],
                [14400_000, null],
                [18000_000, 8],
            ],
        });
        expect(series(option, 1)).toMatchObject({
            name: "IQR delisted",
            stack: series(option, 0).stack,
            data: [
                [3600_000, 6],
                [10800_000, 6],
                [14400_000, null],
                [18000_000, 6],
            ],
        });
        expect((option.legend as { data: unknown[] }).data).toContainEqual(
            expect.objectContaining({
                name: "IQR delisted",
                itemStyle: { color: "var(--chart-5)", opacity: 0.3 },
            }),
        );
        expect(hourTooltip(option, 3600)).toContain("Delisted | 10 | 10 | 8–14 | 10 | 9");
        expect(hourTooltip(option, 7200)).toContain("Delisted | 10 | 10 | — | 10 | 8");
    });
    it("leaves out the delisted band when no hour has enough delisted listings", () => {
        const option = marketPriceChartOption(
            [{ ...point(3600, flat(5)), mergedDelisted: many(flat(10), 8) }],
            "poe1",
        )!;
        expect((option.series as LineSeriesOption[]).map((entry) => entry.name)).not.toContain(
            "IQR delisted",
        );
        expect((option.legend as { data: unknown[] }).data).not.toContainEqual(
            expect.objectContaining({ name: "IQR delisted" }),
        );
    });
    it("charts an hour whose only prices are delisted without breaking the sold line", () => {
        const option = marketPriceChartOption(
            [
                point(3600, flat(5), flat(6)),
                { ...point(7200, null), mergedDelisted: many(flat(10), 9) },
                point(10800, flat(5), flat(7)),
            ],
            "poe1",
        )!;
        const named = (name: string) =>
            (option.series as LineSeriesOption[]).find((entry) => entry.name === name)!;
        expect(named("Min sold (chaos)").data).toEqual([
            [3600_000, 6],
            [10800_000, 7],
        ]);
        expect(named("Min ask (chaos)").data).toEqual([
            [3600_000, 5],
            [7200_000, null],
            [10800_000, 5],
        ]);
        expect(series(option, 0).data).toEqual([[7200_000, 10]]);
        expect(
            marketPriceChartOption(
                [{ ...point(3600, null), mergedDelisted: many(flat(10), 9) }],
                "poe1",
            ),
        ).not.toBeNull();
    });
    it("plots the likely sales' average age in hours in its own panel", () => {
        const option = marketPriceChartOption(
            [
                { ...point(3600, flat(5)), likelySales: 2, soldAgeSeconds: 7200 },
                { ...point(7200, flat(5)), likelySales: 0, soldAgeSeconds: null },
                { ...point(10800, flat(5)), likelySales: 1, soldAgeSeconds: 345_600 },
                { ...point(18000, flat(5)), likelySales: 1, soldAgeSeconds: 3600 },
            ],
            "poe1",
        )!;
        expect(option.grid).toHaveLength(3);
        expect(option.yAxis).toHaveLength(4);
        expect(option.dataZoom).toMatchObject([
            { xAxisIndex: [0, 1, 2] },
            { xAxisIndex: [0, 1, 2] },
        ]);
        const all = option.series as LineSeriesOption[];
        const index = all.findIndex((entry) => entry.name === "Avg sold age (hours)");
        expect(all[index]).toMatchObject({
            xAxisIndex: 2,
            yAxisIndex: 3,
            data: [
                [3600_000, 2],
                [10800_000, 96],
                [14400_000, null],
                [18000_000, 1],
            ],
        });
        expect(hourTooltip(option, 3600)).toContain("Avg sold age | 2 hours");
        expect(hourTooltip(option, 10800)).toContain("Avg sold age | 4 days");
        expect(renderSvg(option)).toContain("<path");
    });
    it("charts an exchange item's lowest rate and estimated IQR beside its value", () => {
        const base = { value: 15, low: 10, high: 20, units: 100 };
        const option = marketExchangeChartOption(
            [
                { hour: 3600, ...base, p25: 12, p75: 17 },
                { hour: 7200, ...base, p25: null, p75: null },
            ],
            "Chaos per unit",
            "Units traded",
        )!;
        expect(option.dataZoom).toMatchObject([{ type: "inside" }, { type: "slider" }]);
        expect((option.legend as { data: unknown[] }).data).toMatchObject([
            "Chaos per unit",
            "Lowest rate",
            { name: "Estimated IQR" },
            "Units traded",
        ]);
        const all = option.series as LineSeriesOption[];
        expect(all.filter((entry) => entry.name === "Estimated IQR")).toMatchObject([
            {
                stack: "interquartile",
                data: [
                    [3600_000, 12],
                    [7200_000, null],
                ],
            },
            {
                stack: "interquartile",
                data: [
                    [3600_000, 5],
                    [7200_000, null],
                ],
            },
        ]);
        expect(all.find((entry) => entry.name === "Lowest rate")).toMatchObject({
            data: [
                [3600_000, 10],
                [7200_000, 10],
            ],
        });
        expect(tooltipValue(option, all.length - 1, 15, 0)).toBe(
            "15 (range 10–20, estimated interquartile 12–17)",
        );
        expect(renderSvg(option)).toContain("<path");
    });
    it("leaves the estimated IQR out of the legend when no hour has one", () => {
        const option = marketExchangeChartOption(
            [{ hour: 3600, value: 15, low: 10, high: 20, p25: null, p75: null, units: 3 }],
            "Chaos per unit",
            "Units traded",
        )!;
        expect((option.legend as { data: unknown[] }).data).toEqual([
            "Chaos per unit",
            "Lowest rate",
            "Units traded",
        ]);
    });
    it("connects sale prices across listed hours without a sale but not across gaps", () => {
        const option = marketPriceChartOption(
            [
                point(3600, flat(1), flat(10)),
                point(7200, flat(1)),
                point(10800, flat(1), flat(12)),
                point(18000, flat(1), flat(14)),
            ],
            "poe1",
        )!;
        expect(series(option, lowestSale).data).toEqual([
            [3600_000, 10],
            [10800_000, 12],
            [14400_000, null],
            [18000_000, 14],
        ]);
    });
    it("plots each hour's prices in the value display at that hour's rates", () => {
        const points = [
            point(3600, flat(5), null, { chaos: 1 }),
            point(7200, flat(500), null, { chaos: 1, divine: 0.01 }),
            point(10800, flat(5), null, { chaos: 1, divine: 0.005 }),
        ];
        const adaptive = marketPriceChartOption(points, "poe1")!;
        expect(series(adaptive, lowestAsk).data).toEqual([
            [3600_000, 5],
            [7200_000, 500],
            [10800_000, 5],
        ]);
        // In divine, each hour converts at its own rate; an hour without one leaves a gap.
        const divine = marketPriceChartOption(points, "poe1", "divine")!;
        expect(series(divine, lowestAsk)).toMatchObject({
            name: "Min ask (divine)",
            data: [
                [3600_000, null],
                [7200_000, 5],
                [10800_000, 0.025],
            ],
        });
    });
    it("colours likely sales apart from the lowest ask", () => {
        const option = marketPriceChartOption([point(3600, flat(5), flat(6))], "poe1")!;
        expect(series(option, lowestAsk).color).toBe("var(--primary)");
        expect(series(option, lowestSale).color).toBe("var(--chart-2)");
        // The interquartile band shades in the likely sale's colour.
        expect(series(option, 1).color).toBe("var(--chart-2)");
    });
    it("toggles each interquartile band from the legend as one entry", () => {
        const option = marketPriceChartOption([point(3600, flat(5), flat(6))], "poe1")!;
        expect(series(option, 0).name).toBe("IQR sold");
        expect(series(option, 1).name).toBe("IQR sold");
        expect((option.legend as { data: unknown[] }).data[4]).toMatchObject({
            name: "IQR sold",
            itemStyle: { color: "var(--chart-2)" },
        });
        expect((option.legend as { data: unknown[] }).data[1]).toMatchObject({
            name: "IQR ask",
            itemStyle: { color: "var(--primary)" },
        });
    });
    it("zooms both panels to a date range together", () => {
        const option = marketPriceChartOption(
            [point(3600, flat(5)), point(7200, flat(6)), point(10800, flat(7))],
            "poe1",
        )!;
        expect(option.dataZoom).toMatchObject([
            { type: "inside", xAxisIndex: [0, 1] },
            { type: "slider", xAxisIndex: [0, 1] },
        ]);
        const chart = init(null, null, { renderer: "svg", ssr: true, width: 920, height: 260 });
        chart.setOption(option);
        chart.dispatchAction({ type: "dataZoom", start: 50, end: 100 });
        const extents = (
            chart.getOption().dataZoom as { startValue: number; endValue: number }[]
        ).map(({ startValue, endValue }) => [startValue, endValue]);
        chart.dispose();
        expect(extents).toEqual([
            [7200_000, 10800_000],
            [7200_000, 10800_000],
        ]);
    });
    it("plots total listings, new listings and likely sales per hour under the prices", () => {
        const option = marketPriceChartOption(
            [
                { ...point(3600, flat(5)), listingCount: 40, newCount: null, likelySales: 0 },
                { ...point(7200, flat(5), flat(6)), listingCount: 42, newCount: 5, likelySales: 3 },
                // An hour without convertible prices still has counts.
                { ...point(10800, null), listingCount: 41, newCount: 1, likelySales: 2 },
                { ...point(18000, flat(5)), listingCount: 30, newCount: 2, likelySales: 0 },
            ],
            "poe1",
        )!;
        expect(option.legend).toMatchObject({
            data: [
                "Min ask (chaos)",
                expect.objectContaining({ name: "IQR ask" }),
                "Avg ask (chaos)",
                "Min sold (chaos)",
                expect.objectContaining({ name: "IQR sold" }),
                "Avg sold (chaos)",
                "Total listings",
                "New listings",
                "Likely sold listings",
            ],
        });
        const [listings, added, sales] = (option.series as LineSeriesOption[]).slice(8);
        expect(listings).toMatchObject({
            type: "line",
            xAxisIndex: 1,
            yAxisIndex: 1,
            data: [
                [3600_000, 40],
                [7200_000, 42],
                [10800_000, 41],
                [14400_000, null],
                [18000_000, 30],
            ],
        });
        expect(added).toMatchObject({
            type: "bar",
            yAxisIndex: 1,
            color: "var(--chart-1)",
            data: [
                [3600_000, null],
                [7200_000, 5],
                [10800_000, 1],
                [18000_000, 2],
            ],
        });
        // Likely sales have their own axis, so a few sales stay visible beside many listings.
        expect(sales).toMatchObject({
            type: "bar",
            yAxisIndex: 2,
            color: "var(--chart-2)",
            data: [
                [3600_000, 0],
                [7200_000, 3],
                [10800_000, 2],
                [18000_000, 0],
            ],
        });
        expect(hourTooltip(option, 3600)).toContain("New listings | Not recorded");
        expect(renderSvg(option)).toContain("<path");
    });
    it("leaves out new listings and likely sales a market does not record", () => {
        const option = marketPriceChartOption(
            [point(3600, flat(5)), point(7200, flat(6))],
            "poe1",
        )!;
        expect(option.series).toHaveLength(9);
        expect(option.yAxis).toHaveLength(2);
        expect((option.legend as { data: string[] }).data).not.toContain("Likely sold listings");
        expect((option.legend as { data: string[] }).data).not.toContain("Delisted");
    });
    it("resolves theme token colours anywhere in an option", () => {
        const option = {
            legend: { data: ["Ask", { name: "Band", itemStyle: { color: "var(--chart-2)" } }] },
            series: [{ itemStyle: { color: "var(--chart-1)" }, data: [[1, 2]] }],
            yAxis: { axisLabel: { formatter: marketNumber, color: "red" } },
        };
        expect(resolveTokens(option, (token) => `resolved${token}`)).toEqual({
            legend: { data: ["Ask", { name: "Band", itemStyle: { color: "resolved--chart-2" } }] },
            series: [{ itemStyle: { color: "resolved--chart-1" }, data: [[1, 2]] }],
            yAxis: { axisLabel: { formatter: marketNumber, color: "red" } },
        });
    });
    it("restates exchange-unit values in each game's price currencies", () => {
        const poe2 = { exalted: 1, chaos: 4, annul: 0.05, divine: 0.0025 };
        expect(exchangeDisplays("poe1")).toEqual({
            adaptive: "Adaptive",
            chaos: "Chaos Orb",
            divine: "Divine Orb",
        });
        expect(Object.values(exchangeDisplays("poe2"))).toEqual([
            "Adaptive",
            "Exalted Orb",
            "Chaos Orb",
            "Orb of Annulment",
            "Divine Orb",
        ]);
        expect(exchangePriceText(40, poe2, "annul", "poe2")).toBe("2 annul");
        expect(exchangePriceText(40, poe2, "chaos", "poe2")).toBe("160 chaos");
        expect(exchangePriceText(800, poe2, "adaptive", "poe2")).toBe("2 divine ≈ 800 exalted");
        // A currency without a rate falls back to the exchange unit.
        expect(exchangePriceText(40, { exalted: 1 }, "annul", "poe2")).toBe("40 exalted");
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
