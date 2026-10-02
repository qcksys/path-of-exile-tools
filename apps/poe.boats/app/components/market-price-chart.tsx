import { marketNumber } from "~/lib/market-number";

type Point = { hour: number; prices: Record<string, { median: number }> | null };

export function MarketPriceChart({ points, currency }: { points: Point[]; currency: string }) {
    const priced = points.flatMap((point) => {
        const price = point.prices?.[currency]?.median;
        return price === undefined ? [] : [{ hour: point.hour, price }];
    });
    if (priced.length === 0)
        return (
            <p className="py-12 text-center text-muted-foreground">
                No asking prices in {currency} for this period.
            </p>
        );
    const lowest = Math.min(...priced.map((p) => p.price));
    const highest = Math.max(...priced.map((p) => p.price));
    const padding = lowest === highest ? Math.abs(lowest) * 0.1 || 1 : 0;
    const minimum = lowest - padding;
    const maximum = highest + padding;
    const first = points[0]!.hour;
    const last = points.at(-1)!.hour;
    const x = (hour: number) => 68 + ((hour - first) / Math.max(last - first, 3600)) * 800;
    const y = (price: number) => 210 - ((price - minimum) / (maximum - minimum || 1)) * 160;
    let previous = -Infinity;
    const path = priced
        .map((point) => {
            const command = point.hour - previous > 3600 ? "M" : "L";
            previous = point.hour;
            return `${command}${x(point.hour)},${y(point.price)}`;
        })
        .join(" ");
    return (
        <svg
            viewBox="0 0 920 260"
            role="img"
            aria-label={`Hourly median asking price in ${currency}. Gaps indicate no observations.`}
            className="w-full text-primary"
        >
            <title>Hourly median asking price in {currency}</title>
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
            <path d={path} fill="none" stroke="currentColor" strokeWidth="2.5" />
            {priced.map((point) => (
                <circle
                    key={point.hour}
                    cx={x(point.hour)}
                    cy={y(point.price)}
                    r="2.5"
                    fill="currentColor"
                >
                    <title>
                        {new Date(point.hour * 1000).toISOString()}: {point.price} {currency}
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
