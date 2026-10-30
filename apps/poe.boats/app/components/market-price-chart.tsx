import { useMemo } from "react";
import { CurrencyLabel } from "~/components/currency-label";
import { EChart } from "~/components/echart";
import {
    type ExchangeDisplay,
    exchangePriceText,
    useMarketDisplay,
} from "~/components/market-exchange";
import type { ChartOption } from "~/lib/echarts";
import { marketNumber } from "~/lib/market-number";
import { MARKET_PRICE_CURRENCIES, type MarketPriceRates } from "~/lib/market-price-currencies";
import type { MergedMarketPrice } from "~/schemas/market";

type Game = "poe1" | "poe2";
/**
 * An hour's merged prices in the game's exchange unit, with its price currency rates and counts.
 * Markets without sale estimates omit `likelySales`; `newCount` is null for hours ingested before
 * new listings were counted.
 */
type Point = {
    hour: number;
    merged: MergedMarketPrice | null;
    mergedSales: MergedMarketPrice | null;
    priceRates: MarketPriceRates;
    listingCount: number;
    newCount?: number | null;
    likelySales?: number;
};
type Row = {
    at: number;
    ask: MergedMarketPrice | null;
    sales: MergedMarketPrice | null;
    rates: MarketPriceRates;
};
type Format = (value: number) => string;

const ASK_COLOR = "var(--primary)";
const SALE_COLOR = "var(--chart-2)";
const NEW_LISTINGS_COLOR = "var(--chart-1)";

function count(value: unknown) {
    return value === null || value === undefined ? "Not recorded" : marketNumber(Number(value));
}

function unconverted(price: MergedMarketPrice) {
    return price.unconverted ? `, ${price.unconverted} without an exchange rate` : "";
}

function askSummary(price: MergedMarketPrice | null, format: Format) {
    if (!price) return "No listings";
    return `${format(price.min)} (lowest of ${price.count} listings, median ${format(price.median)}${unconverted(price)})`;
}

function saleSummary(price: MergedMarketPrice | null, format: Format) {
    if (!price) return "No observations";
    return `${format(price.median)} (interquartile ${format(price.p25)}–${format(price.p75)}, ${price.count} likely sales${unconverted(price)})`;
}

/** The currency the chart plots: the exchange unit for adaptive values, otherwise the display's. */
function plottedCurrency(game: Game, display: ExchangeDisplay) {
    return display === "adaptive" ? MARKET_PRICE_CURRENCIES[game][0] : display;
}

export function marketPriceChartOption(
    points: Point[],
    game: Game,
    display: ExchangeDisplay = "adaptive",
): ChartOption | null {
    const rows: Row[] = [];
    let previous = -Infinity;
    for (const point of points) {
        if (!point.merged && !point.mergedSales) continue;
        // A row without prices breaks every line and the band, so hours without observations stay unconnected.
        if (rows.length && point.hour - previous > 3600)
            rows.push({ at: (previous + 3600) * 1000, ask: null, sales: null, rates: {} });
        previous = point.hour;
        rows.push({
            at: point.hour * 1000,
            ask: point.merged,
            sales: point.mergedSales,
            rates: point.priceRates,
        });
    }
    if (!rows.length) return null;
    const currency = plottedCurrency(game, display);
    // Hours without a rate to the plotted currency leave a gap.
    const plot = (row: Row, value: number | undefined) => {
        if (value === undefined) return null;
        if (display === "adaptive") return value;
        const rate = row.rates[display];
        return rate ? value * rate : null;
    };
    const format =
        (row: Row | undefined): Format =>
        (value) =>
            exchangePriceText(value, row?.rates ?? {}, display, game);
    // Sales are sparse, so sale prices connect across observed hours without a sale.
    const saleRows = rows.filter((row) => row.sales || !row.ask);
    // Counts cover every observed hour, priced or not; the listings line breaks at gaps too.
    const countRows: { at: number; point: Point | null }[] = [];
    let counted = -Infinity;
    for (const point of points) {
        if (countRows.length && point.hour - counted > 3600)
            countRows.push({ at: (counted + 3600) * 1000, point: null });
        counted = point.hour;
        countRows.push({ at: point.hour * 1000, point });
    }
    const hasNew = points.some((point) => point.newCount !== null && point.newCount !== undefined);
    const hasSales = points.some((point) => point.likelySales !== undefined);
    const askName = `Lowest ask (${currency})`;
    const saleName = `Median likely sale (${currency})`;
    const iqrName = "Likely sale IQR";
    const listingsName = "Total listings";
    const newName = "New listings";
    const salesName = "Likely sales";
    // The interquartile band stacks the p75 - p25 width on an invisible p25 line. Both share a
    // name, so the legend toggles them together.
    const band = {
        type: "line",
        name: iqrName,
        stack: "interquartile",
        symbol: "none",
        silent: true,
        color: SALE_COLOR,
        lineStyle: { opacity: 0 },
        tooltip: { show: false },
    } as const;
    const counts = {
        xAxisIndex: 1,
        yAxisIndex: 1,
        tooltip: { valueFormatter: count },
    } as const;
    const time = {
        type: "time",
        min: points[0]!.hour * 1000,
        max: Math.max(points.at(-1)!.hour, points[0]!.hour + 3600) * 1000,
    } as const;
    const countAxis = {
        type: "value",
        gridIndex: 1,
        minInterval: 1,
        splitNumber: 2,
        axisLabel: { formatter: (value: number) => marketNumber(value) },
    } as const;
    // Fixed margins keep the price and count panels' time axes aligned.
    const sides = { left: 52, right: hasSales ? 44 : 24, outerBoundsMode: "none" } as const;
    const both = [0, 1];
    return {
        useUTC: true,
        grid: [
            { ...sides, top: 32, bottom: "38%" },
            { ...sides, top: "70%", bottom: 56 },
        ],
        legend: {
            top: 0,
            data: [
                askName,
                saleName,
                // The band's own lines are invisible, so its legend icon is a shaded swatch.
                { name: iqrName, icon: "rect", itemStyle: { color: SALE_COLOR, opacity: 0.3 } },
                listingsName,
                ...(hasNew ? [newName] : []),
                ...(hasSales ? [salesName] : []),
            ],
        },
        tooltip: { trigger: "axis" },
        axisPointer: { link: [{ xAxisIndex: "all" }] },
        // The date range: drag the slider's handles, or scroll and drag on the chart.
        dataZoom: [
            { type: "inside", xAxisIndex: both },
            { type: "slider", xAxisIndex: both, height: 20, bottom: 8 },
        ],
        xAxis: [
            { ...time, axisLabel: { show: false } },
            { ...time, gridIndex: 1 },
        ],
        yAxis: [
            {
                type: "value",
                scale: true,
                axisLabel: { formatter: (value: number) => marketNumber(value) },
            },
            countAxis,
            ...(hasSales
                ? [
                      {
                          ...countAxis,
                          splitLine: { show: false },
                          axisLabel: { ...countAxis.axisLabel, color: SALE_COLOR },
                      },
                  ]
                : []),
        ],
        series: [
            { ...band, data: saleRows.map((row) => [row.at, plot(row, row.sales?.p25)]) },
            {
                ...band,
                areaStyle: { opacity: 0.15 },
                data: saleRows.map((row) => {
                    const low = plot(row, row.sales?.p25);
                    const high = plot(row, row.sales?.p75);
                    return [row.at, low === null || high === null ? null : high - low];
                }),
            },
            {
                type: "line",
                name: saleName,
                color: SALE_COLOR,
                data: saleRows.map((row) => [row.at, plot(row, row.sales?.median)]),
                symbolSize: 6,
                lineStyle: { width: 1.5 },
                tooltip: {
                    valueFormatter: (_value, dataIndex) =>
                        saleSummary(
                            saleRows[dataIndex]?.sales ?? null,
                            format(saleRows[dataIndex]),
                        ),
                },
            },
            {
                type: "line",
                name: askName,
                color: ASK_COLOR,
                data: rows.map((row) => [row.at, plot(row, row.ask?.min)]),
                symbolSize: 5,
                lineStyle: { width: 2.5 },
                tooltip: {
                    valueFormatter: (_value, dataIndex) =>
                        askSummary(rows[dataIndex]?.ask ?? null, format(rows[dataIndex])),
                },
            },
            {
                ...counts,
                type: "line",
                name: listingsName,
                color: ASK_COLOR,
                symbol: "none",
                lineStyle: { width: 1.5 },
                areaStyle: { opacity: 0.1 },
                data: countRows.map(({ at, point }) => [at, point?.listingCount ?? null]),
            },
            ...(hasNew
                ? [
                      {
                          ...counts,
                          type: "bar",
                          name: newName,
                          color: NEW_LISTINGS_COLOR,
                          data: points.map((point) => [point.hour * 1000, point.newCount ?? null]),
                      } as const,
                  ]
                : []),
            ...(hasSales
                ? [
                      {
                          ...counts,
                          type: "bar",
                          name: salesName,
                          yAxisIndex: 2,
                          color: SALE_COLOR,
                          data: points.map((point) => [point.hour * 1000, point.likelySales ?? 0]),
                      } as const,
                  ]
                : []),
        ],
    };
}

/** An item's hourly lowest ask and likely sale prices, in the shared value display. */
export function MarketPriceChart({ points, game }: { points: Point[]; game: Game }) {
    const [display] = useMarketDisplay();
    const option = useMemo(
        () => marketPriceChartOption(points, game, display),
        [points, game, display],
    );
    const currency = plottedCurrency(game, display);
    if (!option)
        return (
            <p className="py-12 text-center text-muted-foreground">
                No asking prices convertible to <CurrencyLabel currency={currency} game={game} />{" "}
                for this period.
            </p>
        );
    return (
        <EChart
            option={option}
            label={`Hourly lowest asking price in ${currency} across all listing currencies, with the median likely sale price and its interquartile range shaded. Below, total and new listings and likely sales per hour. Gaps indicate no observations.`}
            className="h-96"
        />
    );
}
