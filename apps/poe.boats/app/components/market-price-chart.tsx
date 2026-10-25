import { useMemo } from "react";
import { EChart } from "~/components/echart";
import type { ChartOption } from "~/lib/echarts";
import { marketNumber } from "~/lib/market-number";

type Point = { hour: number; prices: Record<string, { median: number }> | null };

export function marketPriceChartOption(points: Point[], currency: string): ChartOption | null {
    const data: [number, number | null][] = [];
    let previous = -Infinity;
    for (const point of points) {
        const price = point.prices?.[currency]?.median;
        if (price === undefined) continue;
        // A null value breaks the line, so hours without observations stay unconnected.
        if (data.length && point.hour - previous > 3600)
            data.push([(previous + 3600) * 1000, null]);
        previous = point.hour;
        data.push([point.hour * 1000, price]);
    }
    if (!data.length) return null;
    return {
        useUTC: true,
        grid: { left: 8, right: 24, top: 16, bottom: 8, outerBoundsMode: "same" },
        tooltip: {
            trigger: "axis",
            valueFormatter: (value) =>
                typeof value === "number" && Number.isFinite(value)
                    ? `${marketNumber(value)} ${currency}`
                    : "No observations",
        },
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
            {
                type: "line",
                name: `Median ask (${currency})`,
                data,
                symbolSize: 5,
                lineStyle: { width: 2.5 },
            },
        ],
    };
}

export function MarketPriceChart({ points, currency }: { points: Point[]; currency: string }) {
    const option = useMemo(() => marketPriceChartOption(points, currency), [points, currency]);
    if (!option)
        return (
            <p className="py-12 text-center text-muted-foreground">
                No asking prices in {currency} for this period.
            </p>
        );
    return (
        <EChart
            option={option}
            label={`Hourly median asking price in ${currency}. Gaps indicate no observations.`}
            className="h-64"
        />
    );
}
