import { marketNumber as number } from "~/lib/market-number";

const WINDOWS = [
    { label: "6h", name: "6 hours", points: (sales: RecentSales) => sales.hourly.slice(-6) },
    { label: "1d", name: "24 hours", points: (sales: RecentSales) => sales.hourly },
    { label: "7d", name: "7 days", points: (sales: RecentSales) => sales.daily },
] as const;

type RecentSales = { hourly: number[]; daily: number[] };

function SalesBars({ values }: { values: number[] }) {
    const width = 56;
    const height = 14;
    const peak = Math.max(...values, 1);
    const step = width / values.length;
    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            width={width}
            height={height}
            aria-hidden="true"
            className="shrink-0 text-primary"
        >
            <line
                x1="0"
                x2={width}
                y1={height - 0.5}
                y2={height - 0.5}
                stroke="currentColor"
                strokeOpacity="0.25"
            />
            {values.map((value, index) =>
                value > 0 ? (
                    <rect
                        key={index}
                        x={(index * step + step * 0.15).toFixed(2)}
                        y={(height - (value / peak) * height).toFixed(2)}
                        width={(step * 0.7).toFixed(2)}
                        height={((value / peak) * height).toFixed(2)}
                        fill="currentColor"
                    />
                ) : null,
            )}
        </svg>
    );
}

/** Likely sales in the latest 6 hours, 24 hours and 7 UTC days, each as a total and bar sparkline. */
export function MarketRecentSales({ sales }: { sales: RecentSales }) {
    return (
        <dl className="grid grid-cols-[auto_auto_auto] items-center gap-x-2 gap-y-0.5 text-xs">
            {WINDOWS.map((window) => {
                const values = window.points(sales);
                const total = values.reduce((sum, value) => sum + value, 0);
                return (
                    <div key={window.label} className="contents">
                        <dt className="text-muted-foreground">
                            <abbr title={`Last ${window.name}`} className="no-underline">
                                {window.label}
                            </abbr>
                        </dt>
                        <dd className="contents">
                            <SalesBars values={values} />
                            <span
                                className="text-right font-semibold tabular-nums"
                                title={`${number(total)} likely sales in the last ${window.name}`}
                            >
                                {number(total)}
                            </span>
                        </dd>
                    </div>
                );
            })}
        </dl>
    );
}
