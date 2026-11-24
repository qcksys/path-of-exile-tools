import { expect, it } from "vite-plus/test";
import {
    marketPriceChange,
    marketPriceTrend,
    marketPriceTrendFromHours,
} from "~/lib/market-price-change";

const hour = 1_792_836_000;
const DAY = 86400;
const today = Math.floor(hour / DAY) * DAY;
const nulls = (length: number) => Array<null>(length).fill(null);

it("changes from the first to the last price, skipping gaps", () => {
    expect(marketPriceChange([null, 100, null, 125, null])).toBeCloseTo(0.25, 9);
    expect(marketPriceChange([null, 100, null])).toBeNull();
    expect(marketPriceChange([])).toBeNull();
});

it("takes the 24-hour change from hourly prices and the 3- and 7-day changes from daily prices", () => {
    expect(
        marketPriceTrend([...nulls(22), 80, 100], [50, null, null, null, 200, null, 100]),
    ).toEqual({
        hourly: [...nulls(22), 80, 100],
        daily: [50, null, null, null, 200, null, 100],
        change24h: 0.25,
        change3d: -0.5,
        change7d: 1,
    });
});

it("buckets prices into the latest 24 hours and each UTC day's newest priced hour", () => {
    const trend = marketPriceTrendFromHours(
        [
            { hour, price: 12 },
            { hour: hour - 3600, price: 11 },
            // Older than 24 hours: only in its day.
            { hour: hour - 30 * 3600, price: 9 },
            { hour: hour - 34 * 3600, price: 8 },
            { hour: today - 6 * DAY, price: 5 },
            // Gaps: unpriced, outside the 7 days, or after the latest hour.
            { hour: hour - 2 * 3600, price: null },
            { hour: hour - 3 * 3600, price: 0 },
            { hour: today - 7 * DAY, price: 1 },
            { hour: hour + 3600, price: 100 },
        ],
        hour,
    );
    expect(trend.hourly).toEqual([...nulls(22), 11, 12]);
    expect(trend.daily).toEqual([5, null, null, null, null, 9, 12]);
    expect(trend.change24h).toBeCloseTo(1 / 11, 9);
    expect(trend.change3d).toBeCloseTo(12 / 9 - 1, 9);
    expect(trend.change7d).toBeCloseTo(12 / 5 - 1, 9);
    expect(marketPriceTrendFromHours([], hour)).toEqual({
        hourly: nulls(24),
        daily: nulls(7),
        change24h: null,
        change3d: null,
        change7d: null,
    });
});
