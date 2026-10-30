import type { LineSeriesOption } from "echarts/charts";
import { useMemo } from "react";
import { CurrencyLabel } from "~/components/currency-label";
import { EChart } from "~/components/echart";
import {
    type ExchangeDisplay,
    exchangePriceText,
    useMarketDisplay,
} from "~/components/market-exchange";
import type { ChartOption } from "~/lib/echarts";
import { MARKET_IQR_MIN_COUNT } from "~/lib/market-exchange";
import { marketNumber } from "~/lib/market-number";
import { MARKET_PRICE_CURRENCIES, type MarketPriceRates } from "~/lib/market-price-currencies";
import type { MergedMarketPrice } from "~/schemas/market";

type Game = "poe1" | "poe2";
/**
 * An hour's merged prices in the game's exchange unit, with its price currency rates and counts.
 * Markets without sale estimates omit the sale and removal counts; `newCount` and `soldAgeSeconds`
 * are null for hours ingested before they were recorded.
 */
type Point = {
    hour: number;
    merged: MergedMarketPrice | null;
    mergedSales: MergedMarketPrice | null;
    priceRates: MarketPriceRates;
    listingCount: number;
    newCount?: number | null;
    likelySales?: number;
    removedCount?: number;
    relistedCount?: number;
    pendingCount?: number;
    soldAgeSeconds?: number | null;
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
const DELISTED_COLOR = "var(--chart-5)";
const SOLD_AGE_COLOR = "var(--chart-3)";
/** Room for the legend, which wraps to two lines at the page's usual width. */
const LEGEND_HEIGHT = 60;

function hasSoldAge(points: Point[]) {
    return points.some(
        (point) => point.soldAgeSeconds !== null && point.soldAgeSeconds !== undefined,
    );
}

/** Listings removed without selling: every removal that is not a likely sale, relist or undecided. */
function delisted(point: Point) {
    if (point.removedCount === undefined) return undefined;
    return Math.max(
        0,
        point.removedCount -
            (point.likelySales ?? 0) -
            (point.relistedCount ?? 0) -
            (point.pendingCount ?? 0),
    );
}

function soldAge(hours: number) {
    return hours < 48 ? `${marketNumber(hours)} hours` : `${marketNumber(hours / 24)} days`;
}

function count(value: unknown) {
    return value === null || value === undefined ? "Not recorded" : marketNumber(Number(value));
}

function unconverted(price: MergedMarketPrice) {
    return price.unconverted ? `, ${price.unconverted} without an exchange rate` : "";
}

/** The price when the hour has enough observations for its interquartile range to mean something. */
function withIqr(price: MergedMarketPrice | null) {
    return price && price.count > MARKET_IQR_MIN_COUNT ? price : null;
}

function iqrSummary(price: MergedMarketPrice, format: Format) {
    return withIqr(price) ? `, interquartile ${format(price.p25)}–${format(price.p75)}` : "";
}

function priceSummary(price: MergedMarketPrice, format: Format, observations: string) {
    return `${format(price.min)} (lowest of ${price.count} ${observations}, median ${format(price.median)}${iqrSummary(price, format)}${unconverted(price)})`;
}

function askSummary(price: MergedMarketPrice | null, format: Format) {
    return price ? priceSummary(price, format, "listings") : "No listings";
}

function saleSummary(price: MergedMarketPrice | null, format: Format) {
    return price ? priceSummary(price, format, "likely sales") : "No observations";
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
    const hasDelisted = points.some((point) => point.removedCount !== undefined);
    const hasAge = hasSoldAge(points);
    const askName = `Min ask (${currency})`;
    const askIqrName = "IQR ask";
    const avgAskName = `Avg ask (${currency})`;
    const saleName = `Min sold (${currency})`;
    const saleIqrName = "IQR sold";
    const avgSaleName = `Avg sold (${currency})`;
    const listingsName = "Total listings";
    const newName = "New listings";
    const salesName = "Likely sold listings";
    const delistedName = "Delisted";
    const ageName = "Avg sold age (hours)";
    // An interquartile band stacks the p75 - p25 width on an invisible p25 line. Both share a name,
    // so the legend toggles them together. Hours with too few observations leave a gap.
    const iqrBand = (
        name: string,
        color: string,
        low: (number | null)[][],
        width: (number | null)[][],
    ) =>
        [{ data: low }, { areaStyle: { opacity: 0.15 }, data: width }].map((series) => ({
            type: "line",
            name,
            stack: name,
            symbol: "none",
            silent: true,
            color,
            lineStyle: { opacity: 0 },
            tooltip: { show: false },
            ...series,
        })) as LineSeriesOption[];
    const iqrData = (list: Row[], price: (row: Row) => MergedMarketPrice | null) => ({
        low: list.map((row) => [row.at, plot(row, withIqr(price(row))?.p25)]),
        width: list.map((row) => {
            const low = plot(row, withIqr(price(row))?.p25);
            const high = plot(row, withIqr(price(row))?.p75);
            return [row.at, low === null || high === null ? null : high - low];
        }),
    });
    const askIqr = iqrData(rows, (row) => row.ask);
    // Few hours have enough sales, so the band connects across them, as sale prices do.
    const saleIqr = iqrData(
        saleRows.filter((row) => withIqr(row.sales) || !row.ask),
        (row) => row.sales,
    );
    const average = (price: MergedMarketPrice | null) => price?.mean ?? undefined;
    const averageSummary = (list: Row[], price: (row: Row) => MergedMarketPrice | null) => ({
        valueFormatter: (_value: unknown, dataIndex: number) => {
            const row = list[dataIndex];
            const value = row && average(price(row));
            return value === undefined ? "—" : format(row)(value);
        },
    });
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
    const panels = hasAge ? [0, 1, 2] : [0, 1];
    const ageAxis = hasSales ? 3 : 2;
    // Sales are sparse, so sold age connects across observed hours without a sale, breaking at gaps.
    const ageRows = countRows.filter(
        ({ point }) =>
            !point || (point.soldAgeSeconds !== null && point.soldAgeSeconds !== undefined),
    );
    return {
        useUTC: true,
        grid: hasAge
            ? [
                  { ...sides, top: LEGEND_HEIGHT, bottom: "50%" },
                  { ...sides, top: "54%", bottom: "26%" },
                  { ...sides, top: "78%", bottom: 56 },
              ]
            : [
                  { ...sides, top: LEGEND_HEIGHT, bottom: "38%" },
                  { ...sides, top: "70%", bottom: 56 },
              ],
        legend: {
            top: 0,
            // A mean follows outlying asks, so it starts hidden to keep the price axis readable.
            selected: { [avgAskName]: false },
            // ECharts' default is brighter than active entries on the dark theme.
            inactiveColor: "var(--border)",
            data: [
                askName,
                // A band's own lines are invisible, so its legend icon is a shaded swatch.
                { name: askIqrName, icon: "rect", itemStyle: { color: ASK_COLOR, opacity: 0.3 } },
                avgAskName,
                saleName,
                { name: saleIqrName, icon: "rect", itemStyle: { color: SALE_COLOR, opacity: 0.3 } },
                avgSaleName,
                listingsName,
                ...(hasNew ? [newName] : []),
                ...(hasSales ? [salesName] : []),
                ...(hasDelisted ? [delistedName] : []),
                ...(hasAge ? [ageName] : []),
            ],
        },
        tooltip: { trigger: "axis" },
        axisPointer: { link: [{ xAxisIndex: "all" }] },
        // The date range: drag the slider's handles, or scroll and drag on the chart.
        dataZoom: [
            { type: "inside", xAxisIndex: panels },
            { type: "slider", xAxisIndex: panels, height: 20, bottom: 8 },
        ],
        xAxis: [
            { ...time, axisLabel: { show: false } },
            { ...time, gridIndex: 1, ...(hasAge ? { axisLabel: { show: false } } : {}) },
            ...(hasAge ? [{ ...time, gridIndex: 2 }] : []),
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
            ...(hasAge
                ? [
                      {
                          type: "value",
                          gridIndex: 2,
                          splitNumber: 2,
                          axisLabel: { formatter: (value: number) => marketNumber(value) },
                      } as const,
                  ]
                : []),
        ],
        series: [
            ...iqrBand(saleIqrName, SALE_COLOR, saleIqr.low, saleIqr.width),
            ...iqrBand(askIqrName, ASK_COLOR, askIqr.low, askIqr.width),
            {
                type: "line",
                name: avgSaleName,
                color: SALE_COLOR,
                data: saleRows.map((row) => [row.at, plot(row, average(row.sales))]),
                symbolSize: 4,
                lineStyle: { width: 1.5, type: "dashed" },
                tooltip: averageSummary(saleRows, (row) => row.sales),
            },
            {
                type: "line",
                name: avgAskName,
                color: ASK_COLOR,
                data: rows.map((row) => [row.at, plot(row, average(row.ask))]),
                symbolSize: 4,
                lineStyle: { width: 1.5, type: "dashed" },
                tooltip: averageSummary(rows, (row) => row.ask),
            },
            {
                type: "line",
                name: saleName,
                color: SALE_COLOR,
                data: saleRows.map((row) => [row.at, plot(row, row.sales?.min)]),
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
            ...(hasDelisted
                ? [
                      {
                          ...counts,
                          type: "bar",
                          name: delistedName,
                          yAxisIndex: hasSales ? 2 : 1,
                          color: DELISTED_COLOR,
                          data: points.map((point) => [point.hour * 1000, delisted(point) ?? null]),
                      } as const,
                  ]
                : []),
            ...(hasAge
                ? [
                      {
                          type: "line",
                          name: ageName,
                          xAxisIndex: 2,
                          yAxisIndex: ageAxis,
                          color: SOLD_AGE_COLOR,
                          symbolSize: 5,
                          lineStyle: { width: 1.5 },
                          data: ageRows.map(({ at, point }) => [
                              at,
                              point ? point.soldAgeSeconds! / 3600 : null,
                          ]),
                          tooltip: {
                              valueFormatter: (value: unknown) =>
                                  value === null || value === undefined
                                      ? "No likely sales"
                                      : soldAge(Number(value)),
                          },
                      } as const,
                  ]
                : []),
        ],
    };
}

/** An item's hourly ask and likely sale prices and listing counts, in the shared value display. */
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
            label={`Hourly lowest and average asking and likely sale prices in ${currency} across all listing currencies, with their interquartile ranges shaded in hours with more than ${MARKET_IQR_MIN_COUNT} observations. Below, total, new, likely sold and delisted listings per hour, and the average age of likely sales. Gaps indicate no observations.`}
            className={hasSoldAge(points) ? "h-[36rem]" : "h-[26rem]"}
        />
    );
}
