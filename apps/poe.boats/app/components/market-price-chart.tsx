import { useMemo } from "react";
import { CurrencyLabel } from "~/components/currency-label";
import { EChart } from "~/components/echart";
import type { ChartOption } from "~/lib/echarts";
import { marketNumber } from "~/lib/market-number";
import { marketPriceText } from "~/lib/market-price-currencies";
import type { MergedMarketPrice } from "~/schemas/market";

type Point = {
    hour: number;
    merged: MergedMarketPrice | null;
    mergedSales: MergedMarketPrice | null;
    /** Each price currency per unit of `currency` at this hour; tooltips then show every one. */
    priceRates?: Record<string, number>;
};
type Row = {
    at: number;
    ask: MergedMarketPrice | null;
    sales: MergedMarketPrice | null;
    rates?: Record<string, number>;
};
/** `lead`: the summary's first amount, which names a single currency once. */
type Format = (value: number, lead?: boolean) => string;

function unconverted(price: MergedMarketPrice) {
    return price.unconverted ? `, ${price.unconverted} without an exchange rate` : "";
}

function askSummary(price: MergedMarketPrice | null, format: Format) {
    if (!price) return "No listings";
    return `${format(price.min, true)} (lowest of ${price.count} listings, median ${format(price.median)}${unconverted(price)})`;
}

function saleSummary(price: MergedMarketPrice | null, format: Format) {
    if (!price) return "No observations";
    return `${format(price.median, true)} (interquartile ${format(price.p25)}–${format(price.p75)}, ${price.count} likely sales${unconverted(price)})`;
}

export function marketPriceChartOption(
    points: Point[],
    currency: string,
    game: "poe1" | "poe2" = "poe1",
): ChartOption | null {
    const rows: Row[] = [];
    let previous = -Infinity;
    for (const point of points) {
        if (!point.merged && !point.mergedSales) continue;
        // A row without prices breaks every line and the band, so hours without observations stay unconnected.
        if (rows.length && point.hour - previous > 3600)
            rows.push({ at: (previous + 3600) * 1000, ask: null, sales: null });
        previous = point.hour;
        rows.push({
            at: point.hour * 1000,
            ask: point.merged,
            sales: point.mergedSales,
            rates: point.priceRates,
        });
    }
    const format =
        (row: Row | undefined): Format =>
        (value, lead) =>
            row?.rates
                ? marketPriceText(value, row.rates, game)
                : `${marketNumber(value)}${lead ? ` ${currency}` : ""}`;
    if (!rows.length) return null;
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
            { ...band, data: saleRows.map(({ at, sales }) => [at, sales?.p25 ?? null]) },
            {
                ...band,
                areaStyle: { opacity: 0.15 },
                data: saleRows.map(({ at, sales }) => [at, sales ? sales.p75 - sales.p25 : null]),
            },
            {
                type: "line",
                name: saleName,
                data: saleRows.map(({ at, sales }) => [at, sales?.median ?? null]),
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
                data: rows.map(({ at, ask }) => [at, ask?.min ?? null]),
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

export function MarketPriceChart({
    points,
    currency,
    game,
}: {
    points: Point[];
    currency: string;
    game?: "poe1" | "poe2";
}) {
    const option = useMemo(
        () => marketPriceChartOption(points, currency, game),
        [points, currency, game],
    );
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
