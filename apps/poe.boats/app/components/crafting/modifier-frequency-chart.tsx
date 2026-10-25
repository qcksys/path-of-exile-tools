import { useMemo } from "react";
import { EChart } from "~/components/echart";
import type { ChartOption } from "~/lib/echarts";

export interface ModifierFrequency {
    id: string;
    text: string;
    share: number;
}

const rowHeight = 40;

function percent(value: unknown) {
    return `${Number(value).toFixed(1)}%`;
}

export function modifierFrequencyChartOption(rows: ModifierFrequency[]): ChartOption {
    return {
        grid: { left: 8, right: 56, top: 8, bottom: 8, outerBoundsMode: "same" },
        tooltip: {
            trigger: "axis",
            axisPointer: { type: "shadow" },
            valueFormatter: percent,
        },
        xAxis: {
            type: "value",
            max: ({ max }) => Math.max(100, max),
            axisLabel: { formatter: "{value}%" },
        },
        yAxis: {
            type: "category",
            inverse: true,
            data: rows.map((row) => row.text.replaceAll("\n", " / ")),
            axisTick: { show: false },
            axisLabel: { width: 220, overflow: "break", lineHeight: 14 },
        },
        series: [
            {
                type: "bar",
                name: "Share of trials",
                data: rows.map((row) => row.share),
                barMaxWidth: 12,
                label: {
                    show: true,
                    position: "right",
                    formatter: ({ value }) => percent(value),
                },
            },
        ],
    };
}

export function ModifierFrequencyChart({ rows }: { rows: ModifierFrequency[] }) {
    const option = useMemo(() => modifierFrequencyChartOption(rows), [rows]);
    return (
        <>
            <EChart
                option={option}
                label="Share of trials containing each of the most frequent modifiers; values are listed below"
                className="mt-3"
                style={{ height: rows.length * rowHeight + 40 }}
            />
            <ol className="sr-only">
                {rows.map((row) => (
                    <li key={row.id}>
                        {row.text}: {row.share.toFixed(1)}%
                    </li>
                ))}
            </ol>
        </>
    );
}
