import type { EChartsType } from "echarts/core";
import { type CSSProperties, useEffect, useRef } from "react";
import type { ChartOption } from "~/lib/echarts";
import { cn } from "~/lib/utils";

// The app's tokens are oklch(); ECharts derives tooltip and hover colours by parsing
// colour strings, so convert each token to rgba through a one-pixel canvas.
function tokenColor(style: CSSStyleDeclaration, name: string) {
    const value = style.getPropertyValue(name).trim();
    const context = document.createElement("canvas").getContext("2d", {
        willReadFrequently: true,
    });
    if (!context || !value) return value;
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
    return `rgba(${red},${green},${blue},${alpha! / 255})`;
}

/**
 * Replaces each `var(--token)` colour in an option with `color(token)`, so options can name the
 * app's tokens.
 */
export function resolveTokens<T>(value: T, color: (token: string) => string): T {
    if (typeof value === "string") {
        const token = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
        return (token ? color(token) : value) as T;
    }
    if (Array.isArray(value)) return value.map((item) => resolveTokens(item, color)) as T;
    if (value && Object.getPrototypeOf(value) === Object.prototype)
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, resolveTokens(item, color)]),
        ) as T;
    return value;
}

function resolvedOption(option: ChartOption, element: HTMLElement) {
    const style = getComputedStyle(element);
    return resolveTokens(option, (token) => tokenColor(style, token));
}

function chartTheme(element: HTMLElement) {
    const style = getComputedStyle(element);
    const muted = tokenColor(style, "--muted-foreground");
    const border = tokenColor(style, "--border");
    const axis = {
        axisLine: { lineStyle: { color: border } },
        axisTick: { lineStyle: { color: border } },
        axisLabel: { color: muted },
        splitLine: { lineStyle: { color: border } },
    };
    return {
        color: [tokenColor(style, "--primary")],
        backgroundColor: "transparent",
        textStyle: { fontFamily: style.fontFamily, color: muted },
        categoryAxis: axis,
        timeAxis: { ...axis, axisLabel: { ...axis.axisLabel, hideOverlap: true } },
        valueAxis: axis,
        bar: {
            label: { color: tokenColor(style, "--foreground"), textBorderWidth: 0 },
        },
        tooltip: {
            backgroundColor: tokenColor(style, "--popover"),
            borderColor: border,
            textStyle: { color: tokenColor(style, "--popover-foreground") },
        },
    };
}

export function EChart({
    option,
    label,
    className,
    style,
}: {
    option: ChartOption;
    label: string;
    className?: string;
    style?: CSSProperties;
}) {
    const container = useRef<HTMLDivElement>(null);
    const chart = useRef<EChartsType | null>(null);
    const latest = useRef(option);
    useEffect(() => {
        latest.current = option;
        chart.current?.setOption(resolvedOption(option, container.current!), { notMerge: true });
    }, [option]);
    useEffect(() => {
        const element = container.current!;
        let active = true;
        let echarts: typeof import("~/lib/echarts") | undefined;
        const start = () => {
            chart.current?.dispose();
            chart.current = echarts!.init(element, chartTheme(element), { renderer: "svg" });
            chart.current.setOption(resolvedOption(latest.current, element));
        };
        void import("~/lib/echarts").then((loaded) => {
            if (!active) return;
            echarts = loaded;
            start();
        });
        const resize = new ResizeObserver(() => chart.current?.resize());
        resize.observe(element);
        // remix-themes switches light and dark mode through the <html> class.
        const theme = new MutationObserver(() => echarts && start());
        theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
        return () => {
            active = false;
            resize.disconnect();
            theme.disconnect();
            chart.current?.dispose();
            chart.current = null;
        };
    }, []);
    return (
        <div
            ref={container}
            role="img"
            aria-label={label}
            className={cn("w-full", className)}
            style={style}
        />
    );
}
