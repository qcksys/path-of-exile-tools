import { useMemo } from "react";
import { EChart } from "~/components/echart";
import type { ChartOption } from "~/lib/echarts";
import { marketNumber } from "~/lib/market-number";

type Point = {
    hour: number;
    value: number | null;
    low: number | null;
    high: number | null;
    units: number;
};

function rangeSummary(point: Point | undefined) {
    if (!point || point.value === null) return "No rate";
    const range =
        point.low !== null && point.high !== null
            ? ` (range ${marketNumber(point.low)}–${marketNumber(point.high)})`
            : "";
    return `${marketNumber(point.value)}${range}`;
}

export function marketExchangeChartOption(
    points: Point[],
    valueName: string,
    unitsName: string,
): ChartOption | null {
    if (!points.length) return null;
    const ranged = (point: Point) => point.low !== null && point.high !== null;
    // The low-high band stacks the high - low width on an invisible low line.
    const band = {
        type: "line",
        stack: "range",
        symbol: "none",
        silent: true,
        connectNulls: false,
        lineStyle: { opacity: 0 },
        tooltip: { show: false },
    } as const;
    return {
        useUTC: true,
        grid: { left: 8, right: 8, top: 32, bottom: 8, outerBoundsMode: "same" },
        legend: { data: [valueName, unitsName], top: 0 },
        tooltip: { trigger: "axis" },
        xAxis: { type: "time" },
        yAxis: [
            {
                type: "value",
                scale: true,
                axisLabel: { formatter: (value: number) => marketNumber(value) },
            },
            {
                type: "value",
                splitLine: { show: false },
                axisLabel: { formatter: (value: number) => marketNumber(value) },
            },
        ],
        series: [
            {
                type: "bar",
                name: unitsName,
                yAxisIndex: 1,
                itemStyle: { opacity: 0.35 },
                data: points.map(({ hour, units }) => [hour * 1000, units]),
                tooltip: { valueFormatter: (value) => marketNumber(Number(value)) },
            },
            {
                ...band,
                data: points.map((point) => [point.hour * 1000, ranged(point) ? point.low : null]),
            },
            {
                ...band,
                areaStyle: { opacity: 0.2 },
                data: points.map((point) => [
                    point.hour * 1000,
                    ranged(point) ? point.high! - point.low! : null,
                ]),
            },
            {
                type: "line",
                name: valueName,
                symbolSize: 4,
                lineStyle: { width: 2 },
                data: points.map(({ hour, value }) => [hour * 1000, value]),
                tooltip: {
                    valueFormatter: (_value, dataIndex) => rangeSummary(points[dataIndex]),
                },
            },
        ],
    };
}

export function MarketExchangeChart({
    points,
    valueName,
    unitsName,
}: {
    points: Point[];
    valueName: string;
    unitsName: string;
}) {
    const option = useMemo(
        () => marketExchangeChartOption(points, valueName, unitsName),
        [points, valueName, unitsName],
    );
    if (!option)
        return <p className="py-12 text-center text-muted-foreground">No trades in this period.</p>;
    return (
        <EChart
            option={option}
            label={`Hourly ${valueName.toLowerCase()} with the lowest to highest rate traded in each hour shaded, and ${unitsName.toLowerCase()} as bars. Hours without trades are left out.`}
            className="h-64"
        />
    );
}
