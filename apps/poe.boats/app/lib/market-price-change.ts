const HOUR = 3600;
const DAY = 86400;

/** Hours of hourly prices behind the 24-hour change. */
export const MARKET_PRICE_HOURS = 24;

/** UTC days of daily prices behind the 3- and 7-day changes. */
export const MARKET_PRICE_DAYS = 7;

/** An item's prices over the latest 24 hours and the last 7 UTC days, and their changes. */
export type MarketPriceTrend = {
    /** Price in each of the 24 hours to the latest, oldest first. */
    hourly: (number | null)[];
    /** Price on each of the last 7 UTC days, oldest first. */
    daily: (number | null)[];
    change24h: number | null;
    change3d: number | null;
    change7d: number | null;
};

/** The price changes, each from the first to the last price of its points. */
export const MARKET_PRICE_WINDOWS = [
    {
        key: "change24h",
        label: "24h",
        name: "24 hours",
        points: (trend: Pick<MarketPriceTrend, "hourly">) => trend.hourly,
    },
    {
        key: "change3d",
        label: "3d",
        name: "3 days",
        points: (trend: Pick<MarketPriceTrend, "daily">) => trend.daily.slice(-3),
    },
    {
        key: "change7d",
        label: "7d",
        name: "7 days",
        points: (trend: Pick<MarketPriceTrend, "daily">) => trend.daily.slice(-7),
    },
] as const;

/** Change from the first to the last price, as a fraction; null without two prices. */
export function marketPriceChange(values: (number | null)[]) {
    const priced = values.filter((value) => value !== null);
    return priced.length > 1 ? priced.at(-1)! / priced[0]! - 1 : null;
}

/** The trend of hourly and daily prices. */
export function marketPriceTrend(
    hourly: (number | null)[],
    daily: (number | null)[],
): MarketPriceTrend {
    const trend = { hourly, daily };
    const [day, threeDays, week] = MARKET_PRICE_WINDOWS;
    return {
        ...trend,
        change24h: marketPriceChange(day.points(trend)),
        change3d: marketPriceChange(threeDays.points(trend)),
        change7d: marketPriceChange(week.points(trend)),
    };
}

/**
 * The trend of prices at some hours to `latestHour`: each of the latest 24 hours' price, and each
 * of the last 7 UTC days' price at its newest priced hour. Null and non-positive prices are gaps.
 */
export function marketPriceTrendFromHours(
    points: { hour: number; price: number | null }[],
    latestHour: number,
) {
    const firstHour = latestHour - (MARKET_PRICE_HOURS - 1) * HOUR;
    const firstDay = Math.floor(latestHour / DAY) * DAY - (MARKET_PRICE_DAYS - 1) * DAY;
    const hourly = Array<number | null>(MARKET_PRICE_HOURS).fill(null);
    const daily = Array<number | null>(MARKET_PRICE_DAYS).fill(null);
    for (const { hour, price } of points.toSorted((a, b) => a.hour - b.hour)) {
        if (price === null || !(price > 0) || hour < firstDay || hour > latestHour) continue;
        if (hour >= firstHour) hourly[(hour - firstHour) / HOUR] = price;
        daily[Math.floor((hour - firstDay) / DAY)] = price;
    }
    return marketPriceTrend(hourly, daily);
}
