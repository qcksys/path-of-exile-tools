import { useMemo } from "react";
import { CurrencyLabel } from "~/components/currency-label";
import { EChart } from "~/components/echart";
import type { ChartOption } from "~/lib/echarts";
import { marketNumber } from "~/lib/market-number";
import type { MergedMarketPrice } from "~/schemas/market";

type Point = { hour: number; merged: MergedMarketPrice | null };

function priceSummary(price: MergedMarketPrice | null, currency: string) {
    if (!price) return "No observations";
    const unconverted = price.unconverted ? `, ${price.unconverted} without an exchange rate` : "";
    return `${marketNumber(price.median)} ${currency} (interquartile ${marketNumber(price.p25)}–${marketNumber(price.p75)}, ${price.count} listings${unconverted})`;
}

export function marketPriceChartOption(points: Point[], currency: string): ChartOption | null {
    const rows: { at: number; price: MergedMarketPrice | null }[] = [];
    let previous = -Infinity;
    for (const point of points) {
        if (!point.merged) continue;
        // A null row breaks the line and the band, so hours without observations stay unconnected.
        if (rows.length && point.hour - previous > 3600)
            rows.push({ at: (previous + 3600) * 1000, price: null });
        previous = point.hour;
        rows.push({ at: point.hour * 1000, price: point.merged });
    }
    if (!rows.length) return null;
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
        grid: { left: 8, right: 24, top: 16, bottom: 8, outerBoundsMode: "same" },
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
            { ...band, data: rows.map(({ at, price }) => [at, price?.p25 ?? null]) },
            {
                ...band,
                areaStyle: { opacity: 0.15 },
                data: rows.map(({ at, price }) => [at, price ? price.p75 - price.p25 : null]),
            },
            {
                type: "line",
                name: `Median ask (${currency})`,
                data: rows.map(({ at, price }) => [at, price?.median ?? null]),
                symbolSize: 5,
                lineStyle: { width: 2.5 },
                tooltip: {
                    valueFormatter: (_value, dataIndex) =>
                        priceSummary(rows[dataIndex]?.price ?? null, currency),
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
    const option = useMemo(() => marketPriceChartOption(points, currency), [points, currency]);
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
            label={`Hourly median asking price in ${currency} across all listing currencies, with the interquartile range shaded. Gaps indicate no observations.`}
            className="h-64"
        />
    );
}
