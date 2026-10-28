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
/** An hour's merged prices in the game's exchange unit, with its price currency rates. */
type Point = {
    hour: number;
    merged: MergedMarketPrice | null;
    mergedSales: MergedMarketPrice | null;
    priceRates: MarketPriceRates;
};
type Row = {
    at: number;
    ask: MergedMarketPrice | null;
    sales: MergedMarketPrice | null;
    rates: MarketPriceRates;
};
type Format = (value: number) => string;

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
    const askName = `Lowest ask (${currency})`;
    const saleName = `Median likely sale (${currency})`;
    // The interquartile band stacks the p75 - p25 width on an invisible p25 line.
    const band = {
        type: "line",
        stack: "interquartile",
        symbol: "none",
        silent: true,
        lineStyle: { opacity: 0 },
        tooltip: { show: false },
    } as const;
    return {
        useUTC: true,
        grid: { left: 8, right: 24, top: 32, bottom: 8, outerBoundsMode: "same" },
        legend: { data: [askName, saleName] },
        tooltip: { trigger: "axis" },
        xAxis: {
            type: "time",
            min: points[0]!.hour * 1000,
            max: Math.max(points.at(-1)!.hour, points[0]!.hour + 3600) * 1000,
        },
        yAxis: {
            type: "value",
            scale: true,
            axisLabel: { formatter: (value: number) => marketNumber(value) },
        },
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
                data: rows.map((row) => [row.at, plot(row, row.ask?.min)]),
                symbolSize: 5,
                lineStyle: { width: 2.5 },
                tooltip: {
                    valueFormatter: (_value, dataIndex) =>
                        askSummary(rows[dataIndex]?.ask ?? null, format(rows[dataIndex])),
                },
            },
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
            label={`Hourly lowest asking price in ${currency} across all listing currencies, with the median likely sale price and its interquartile range shaded. Gaps indicate no observations.`}
            className="h-64"
        />
    );
}
