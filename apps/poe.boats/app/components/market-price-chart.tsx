import { marketNumber } from "~/lib/market-number";
import type { MergedMarketPrice } from "~/schemas/market";

type Point = { hour: number; merged: MergedMarketPrice | null };

export function MarketPriceChart({ points, currency }: { points: Point[]; currency: string }) {
    const priced = points.flatMap((point) =>
        point.merged ? [{ ...point.merged, hour: point.hour }] : [],
    );
    if (priced.length === 0)
        return (
            <p className="py-12 text-center text-muted-foreground">
                No asking prices convertible to {currency} for this period.
            </p>
        );
    const lowest = Math.min(...priced.map((p) => p.p25));
    const highest = Math.max(...priced.map((p) => p.p75));
    const padding = lowest === highest ? Math.abs(lowest) * 0.1 || 1 : 0;
    const minimum = lowest - padding;
    const maximum = highest + padding;
    const first = points[0]!.hour;
    const last = points.at(-1)!.hour;
    const x = (hour: number) => 68 + ((hour - first) / Math.max(last - first, 3600)) * 800;
    const y = (price: number) => 210 - ((price - minimum) / (maximum - minimum || 1)) * 160;
    const segments: (typeof priced)[] = [];
    for (const point of priced) {
        const segment = segments.at(-1);
        if (segment && point.hour - segment.at(-1)!.hour <= 3600) segment.push(point);
        else segments.push([point]);
    }
    const line = (segment: typeof priced, key: "p25" | "median" | "p75", start: "M" | "L") =>
        segment.map((point, index) => `${index ? "L" : start}${x(point.hour)},${y(point[key])}`);
    return (
        <svg
            viewBox="0 0 920 260"
            role="img"
            aria-label={`Hourly median asking price across all listing currencies in ${currency}, with the interquartile range shaded. Gaps indicate no observations.`}
            className="w-full text-primary"
        >
            <title>{`Hourly median asking price in ${currency}`}</title>
            {[0, 1, 2, 3, 4].map((tick) => {
                const value = minimum + ((maximum - minimum) * tick) / 4;
                const position = 210 - tick * 40;
                return (
                    <g key={tick}>
                        <line
                            x1="68"
                            x2="868"
                            y1={position}
                            y2={position}
                            stroke="currentColor"
                            opacity="0.15"
                        />
                        <text
                            x="58"
                            y={position + 4}
                            textAnchor="end"
                            fill="currentColor"
                            fontSize="12"
                        >
                            {marketNumber(value)}
                        </text>
                    </g>
                );
            })}
            {segments.map((segment) => (
                <path
                    key={segment[0]!.hour}
                    d={[
                        ...line(segment, "p75", "M"),
                        ...line([...segment].reverse(), "p25", "L"),
                        "Z",
                    ].join(" ")}
                    fill="currentColor"
                    opacity="0.15"
                />
            ))}
            <path
                d={segments.flatMap((segment) => line(segment, "median", "M")).join(" ")}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
            />
            {priced.map((point) => (
                <circle
                    key={point.hour}
                    cx={x(point.hour)}
                    cy={y(point.median)}
                    r="2.5"
                    fill="currentColor"
                >
                    <title>
                        {`${new Date(point.hour * 1000).toISOString()}: ${marketNumber(point.median)} ${currency} (interquartile ${marketNumber(point.p25)}–${marketNumber(point.p75)}, ${point.count} listings${point.unconverted ? `, ${point.unconverted} without an exchange rate` : ""})`}
                    </title>
                </circle>
            ))}
            <text x="68" y="244" fill="currentColor" fontSize="12">
                {new Date(first * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC
            </text>
            <text x="868" y="244" textAnchor="end" fill="currentColor" fontSize="12">
                {new Date(last * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC
            </text>
        </svg>
    );
}
