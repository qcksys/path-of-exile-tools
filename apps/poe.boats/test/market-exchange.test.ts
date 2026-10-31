import { type ExchangeSnapshot, exchangeCurrencyId, listingCurrencyId } from "@poe-tools/market";
import { expect, it } from "vite-plus/test";
import {
    type MarketExchangeDaily,
    marketExchangeHistory,
    marketExchangeIqr,
    marketExchangeRecentVolume,
    marketExchangeRows,
} from "~/lib/market-exchange";

const hour = 1_792_836_000;
const DAY = 86400;
const today = Math.floor(hour / DAY) * DAY;
const chaos = exchangeCurrencyId("chaos")!;
const divine = exchangeCurrencyId("divine")!;
const exalted = exchangeCurrencyId("exalted")!;
const wisdom = listingCurrencyId("wisdom", "poe1")!;
const unknown = "Metadata/Items/Unknown";
const taintedExalted = "Metadata/Items/Currency/CurrencyHellscapeAddModToRare";
const teardrop = "Metadata/Items/Currency/CurrencyHellscapeUpgradeModTier";

function snapshot(
    item: string,
    itemVolume: number,
    quote: string,
    quoteVolume: number,
    at = hour,
): ExchangeSnapshot {
    return {
        realm: "pc",
        league: "Season",
        marketId: `${item}|${quote}`,
        hour: at,
        volumeTraded: { [item]: itemVolume, [quote]: quoteVolume },
        lowestRatio: null,
        highestRatio: null,
    };
}

function daily(
    item: string,
    itemVolume: number,
    quote: string,
    quoteVolume: number,
    day = today,
    latestHour = day + 3600,
    tradedHours = 1,
): MarketExchangeDaily {
    return {
        marketId: `${item}|${quote}`,
        day,
        firstVolume: itemVolume,
        secondVolume: quoteVolume,
        tradedHours,
        latestHour,
    };
}

const names: Record<string, string> = {
    [chaos]: "Chaos Orb",
    [divine]: "Divine Orb",
    [exalted]: "Exalted Orb",
    [wisdom]: "Scroll of Wisdom",
    [taintedExalted]: "Tainted Exalted Orb",
    [teardrop]: "Tainted Divine Teardrop",
};
const describe = (id: string) =>
    names[id] ? { name: names[id], category: "currency" as const } : undefined;
const byName = (rows: ReturnType<typeof marketExchangeRows>) =>
    Object.fromEntries(rows.map((row) => [row.name, row]));

it("prices each exchange item from the latest hour's trades", () => {
    const rows = marketExchangeRows(
        [
            snapshot(divine, 10, chaos, 2000),
            snapshot(exalted, 10, chaos, 50),
            // An older direct pair is excluded from the price.
            snapshot(wisdom, 100, chaos, 2, hour - 3600),
            snapshot(wisdom, 500, exalted, 1),
            snapshot(unknown, 1, chaos, 1),
        ],
        [],
        hour,
        describe,
    );
    expect(byName(rows)).toEqual({
        "Chaos Orb": expect.objectContaining({ price: 1, current: true, hour }),
        "Divine Orb": expect.objectContaining({
            price: 200,
            current: true,
            hour,
            via: { itemId: chaos, name: "Chaos Orb" },
        }),
        "Exalted Orb": expect.objectContaining({ price: 5 }),
        "Scroll of Wisdom": expect.objectContaining({
            price: expect.closeTo(0.01, 9),
            current: true,
            via: { itemId: exalted, name: "Exalted Orb" },
            // Volume and trend come only from daily totals.
            volume: 0,
            change: null,
        }),
    });
});

it("prices an item through another traded item when both legs are in the latest hour", () => {
    const rows = marketExchangeRows(
        [snapshot(teardrop, 6, taintedExalted, 6), snapshot(taintedExalted, 1, chaos, 320)],
        [],
        hour,
        describe,
    );
    expect(rows.find((row) => row.itemId === teardrop)).toMatchObject({
        price: 320,
        via: { itemId: taintedExalted, name: "Tainted Exalted Orb" },
        hour,
    });
    const missingBridge = marketExchangeRows(
        [
            snapshot(teardrop, 6, taintedExalted, 6),
            snapshot(taintedExalted, 1, chaos, 320, hour - 3600),
        ],
        [],
        hour,
        describe,
    );
    // It traded in the latest hour, but has no rate.
    expect(missingBridge.find((row) => row.itemId === teardrop)).toMatchObject({
        price: null,
        hour,
        current: false,
    });
});

it("prefers the direct quote over conversion, matching crafting exchange pricing", () => {
    const rows = marketExchangeRows(
        [
            snapshot(wisdom, 100, chaos, 2),
            snapshot(wisdom, 500, exalted, 1),
            snapshot(exalted, 10, chaos, 50),
        ],
        [],
        hour,
        describe,
    );
    expect(rows.find((row) => row.itemId === wisdom)?.price).toBe(0.02);
});

it("falls back to the newest traded day's volume-weighted price when the latest hour has none", () => {
    const rows = marketExchangeRows(
        [snapshot(divine, 10, chaos, 2000), snapshot(wisdom, 0, chaos, 0)],
        [
            daily(wisdom, 400, chaos, 4, today - 2 * DAY, today - 2 * DAY + 7200),
            daily(wisdom, 100, chaos, 2, today - DAY, today - DAY + 18000),
            daily(divine, 10, chaos, 2000),
        ],
        hour,
        describe,
        [wisdom],
    );
    expect(rows.find((row) => row.itemId === wisdom)).toMatchObject({
        price: 0.02,
        current: false,
        hour: today - DAY + 18000,
        via: { itemId: chaos, name: "Chaos Orb" },
    });
    // Conversion legs come from the same day, never one leg from each.
    const mixed = marketExchangeRows(
        [snapshot(divine, 10, chaos, 2000)],
        [daily(wisdom, 100, divine, 1, today - DAY), daily(divine, 10, chaos, 2000)],
        hour,
        describe,
        [wisdom],
    );
    expect(mixed.find((row) => row.itemId === wisdom)).toMatchObject({
        price: null,
        hour: today - DAY + 3600,
    });
});

it("keeps one observation of a pair stored under both orders", () => {
    const rows = marketExchangeRows(
        [
            snapshot(divine, 10, chaos, 2000, hour - 3600),
            { ...snapshot(chaos, 1500, divine, 10), marketId: `${chaos}|${divine}` },
        ],
        [daily(divine, 10, chaos, 1500), daily(chaos, 1500, divine, 10)],
        hour,
        describe,
    );
    expect(rows.find((row) => row.name === "Divine Orb")).toMatchObject({
        price: 150,
        current: true,
        hour,
    });
    // Both stored orders describe the same trades, so the volume counts them once, averaged
    // over the 155 hours since the window's first day.
    expect(rows.find((row) => row.name === "Divine Orb")?.volume).toBeCloseTo((10 * 150) / 155, 9);
});

it("averages volume from the league's first exchange hour when it is inside the window", () => {
    const rows = marketExchangeRows(
        [snapshot(divine, 10, chaos, 2000)],
        [daily(divine, 10, chaos, 2000)],
        hour,
        describe,
        [],
        hour - 9 * 3600,
    );
    expect(rows.find((row) => row.name === "Divine Orb")?.volume).toBeCloseTo((10 * 200) / 10, 9);
});

it("lists only listed items and items traded in the latest hour", () => {
    // A market first seen after the latest hour can share its daily total.
    const rows = marketExchangeRows([], [daily(wisdom, 100, chaos, 2)], hour, describe, [chaos]);
    expect(rows.map((row) => row.name)).toEqual(["Chaos Orb"]);
});

it("lists exchange items that did not trade without a price", () => {
    const rows = marketExchangeRows([snapshot(divine, 10, chaos, 2000)], [], hour, describe, [
        divine,
        chaos,
        wisdom,
        unknown,
    ]);
    expect(rows.find((row) => row.name === "Scroll of Wisdom")).toEqual({
        itemId: wisdom,
        name: "Scroll of Wisdom",
        category: "currency",
        price: null,
        via: null,
        hour: null,
        current: false,
        volume: null,
        history: [null, null, null, null, null, null, null],
        change: null,
        pair: null,
    });
    expect(rows.map((row) => row.name).sort()).toEqual([
        "Chaos Orb",
        "Divine Orb",
        "Scroll of Wisdom",
    ]);
});

it("builds a 7-day trend, chaos value per hour and the most traded pair from daily totals", () => {
    const sixDaysAgo = today - 6 * DAY;
    const rows = marketExchangeRows(
        [snapshot(divine, 10, chaos, 2100)],
        [
            daily(divine, 10, chaos, 1500, sixDaysAgo),
            daily(divine, 10, chaos, 2000),
            daily(divine, 2, exalted, 80),
            daily(exalted, 10, chaos, 50),
        ],
        hour,
        describe,
        [exalted],
    );
    const row = rows.find((entry) => entry.itemId === divine)!;
    expect(row.history).toEqual([150, null, null, null, null, null, 200]);
    expect(row.change).toBeCloseTo(1 / 3, 9);
    // 22 Divine Orbs over the 155 hours since the window's first day, at the latest hour's 210 chaos.
    expect(row.volume).toBeCloseTo((22 * 210) / 155, 9);
    expect(row.pair).toEqual({ quoteId: chaos, name: "Chaos Orb", rate: 210 });
    expect(rows.find((entry) => entry.itemId === exalted)?.pair).toEqual({
        quoteId: divine,
        name: "Divine Orb",
        rate: 2 / 80,
    });
});

it("returns an item's hourly chaos price and range through a bridge and each pair's hourly rates", () => {
    const ranged = (
        item: string,
        itemVolume: number,
        quote: string,
        quoteVolume: number,
        at: number,
        [low, high]: [number, number],
    ): ExchangeSnapshot => ({
        ...snapshot(item, itemVolume, quote, quoteVolume, at),
        lowestRatio: { [item]: 1, [quote]: low },
        highestRatio: { [item]: 1, [quote]: high },
    });
    const history = marketExchangeHistory(
        [
            ranged(teardrop, 6, taintedExalted, 12, hour - 3600, [1.8, 2.4]),
            snapshot(taintedExalted, 1, chaos, 300, hour - 3600),
            snapshot(teardrop, 4, taintedExalted, 4),
            ranged(teardrop, 1, chaos, 400, hour, [380, 410]),
            snapshot(taintedExalted, 2, chaos, 640),
        ],
        teardrop,
        describe,
    );
    expect(history.prices).toEqual([
        // Through Tainted Exalted Orb, its pair's range scales by that orb's chaos price.
        {
            hour: hour - 3600,
            price: 600,
            low: 540,
            high: 720,
            p25: null,
            p75: null,
            via: taintedExalted,
            units: 6,
        },
        { hour, price: 400, low: 380, high: 410, p25: null, p75: null, via: chaos, units: 5 },
    ]);
    expect(history.pairs).toEqual([
        {
            quoteId: taintedExalted,
            name: "Tainted Exalted Orb",
            hours: [
                { hour: hour - 3600, rate: 2, low: 1.8, high: 2.4, p25: null, p75: null, units: 6 },
                { hour, rate: 1, low: null, high: null, p25: null, p75: null, units: 4 },
            ],
            lowVolume: false,
        },
        {
            quoteId: chaos,
            name: "Chaos Orb",
            hours: [{ hour, rate: 400, low: 380, high: 410, p25: null, p75: null, units: 1 }],
            lowVolume: false,
        },
    ]);
});

it("marks pairs trading in under a tenth of the hours of the item's busiest pair as low volume", () => {
    const hours = (count: number) => Array.from({ length: count }, (_, i) => hour - i * 3600);
    const pairHours = (quote: string, count: number, units = 1) =>
        hours(count).map((at) => snapshot(teardrop, units, quote, 2, at));
    const lowVolume = (snapshots: ExchangeSnapshot[]) =>
        Object.fromEntries(
            marketExchangeHistory(snapshots, teardrop, describe).pairs.map((pair) => [
                pair.name,
                pair.lowVolume,
            ]),
        );
    expect(lowVolume([...pairHours(divine, 20), ...pairHours(chaos, 1)])).toEqual({
        "Divine Orb": false,
        "Chaos Orb": true,
    });
    // Exactly a tenth is kept, and units do not count: many units in one hour is still thin.
    expect(lowVolume([...pairHours(divine, 20), ...pairHours(chaos, 2)])).toEqual({
        "Divine Orb": false,
        "Chaos Orb": false,
    });
    expect(lowVolume([...pairHours(divine, 20), ...pairHours(chaos, 1, 1_000)])).toEqual({
        "Divine Orb": false,
        "Chaos Orb": true,
    });
    expect(lowVolume(pairHours(chaos, 1))).toEqual({ "Chaos Orb": false });
});

it("leaves a low volume pair out of an item's hourly price, keeping its rates and units", () => {
    const at = hour - 3600;
    const history = marketExchangeHistory(
        [
            ...Array.from({ length: 20 }, (_, i) => hour - i * 3600).flatMap((traded) => [
                snapshot(teardrop, 1, divine, 1000, traded),
                snapshot(divine, 1, chaos, 400, traded),
            ]),
            snapshot(teardrop, 2, chaos, 130_000, at),
        ],
        teardrop,
        describe,
    );
    expect(history.prices.find((point) => point.hour === at)).toMatchObject({
        price: 400_000,
        via: divine,
        units: 3,
    });
    const thin = history.pairs.find((pair) => pair.quoteId === chaos)!;
    expect(thin.lowVolume).toBe(true);
    expect(thin.hours.map((point) => point.rate)).toEqual([65_000]);
});

it("leaves no price for an hour where only a low volume pair traded", () => {
    const at = hour - 3600;
    const history = marketExchangeHistory(
        [
            ...Array.from({ length: 20 }, (_, i) => hour - (i + 2) * 3600).flatMap((traded) => [
                snapshot(teardrop, 1, divine, 1000, traded),
                snapshot(divine, 1, chaos, 400, traded),
            ]),
            snapshot(teardrop, 2, chaos, 130_000, at),
        ],
        teardrop,
        describe,
    );
    expect(history.prices.find((point) => point.hour === at)).toMatchObject({
        price: null,
        via: null,
        units: 2,
    });
});

it("does not let a low volume pair set an item's latest price or daily trend", () => {
    const earlier = today - 3 * DAY;
    const days = [earlier, today - 2 * DAY, today - DAY, today];
    const rows = marketExchangeRows(
        [
            snapshot(teardrop, 1, divine, 1000),
            snapshot(divine, 1, chaos, 400),
            // Traded alongside the busy pair in the latest hour, and earlier in the window.
            snapshot(teardrop, 2, chaos, 130_000),
        ],
        [
            ...days.flatMap((day) => [
                daily(teardrop, 24, divine, 24_000, day, day + 3600, 24),
                daily(divine, 24, chaos, 9_600, day, day + 3600, 24),
            ]),
            daily(teardrop, 2, chaos, 130_000, earlier, earlier + 3600, 1),
        ],
        hour,
        describe,
    );
    const row = byName(rows)["Tainted Divine Teardrop"]!;
    expect(row).toMatchObject({ price: 400_000, via: { itemId: divine }, current: true });
    expect(row.history.filter((value) => value !== null)).toEqual([
        400_000, 400_000, 400_000, 400_000,
    ]);
    expect(row.change).toBe(0);
});

it("judges a low volume pair from the priced item's side, leaving its other side's price", () => {
    // Under a tenth of Divine Orb's hours on the Exalted Orb pair, but all of Exalted Orb's.
    const rows = marketExchangeRows(
        [snapshot(divine, 1, chaos, 400), snapshot(exalted, 1, divine, 1)],
        [
            daily(divine, 24, chaos, 9_600, today, today + 3600, 24),
            daily(exalted, 2, divine, 2, today, today + 3600, 1),
        ],
        hour,
        describe,
    );
    expect(byName(rows)).toMatchObject({
        "Divine Orb": { price: 400, via: { itemId: chaos } },
        "Exalted Orb": { price: 400, via: { itemId: divine } },
    });
});

it("estimates a symmetric IQR when the volume-weighted rate is the midpoint", () => {
    const { p25, p75 } = marketExchangeIqr(10, 20, 15, 9);
    expect(p25).toBeCloseTo(10 + Math.sqrt(0.25 * 10 * 5));
    expect(p75).toBeCloseTo(20 - Math.sqrt(0.25 * 10 * 5));
});

it("skews the estimated IQR towards the volume-weighted rate", () => {
    const middle = marketExchangeIqr(10, 20, 15, 100);
    const low = marketExchangeIqr(10, 20, 14, 100);
    const high = marketExchangeIqr(10, 20, 16, 100);
    expect(low.p25!).toBeLessThan(middle.p25!);
    expect(low.p75!).toBeLessThan(middle.p75!);
    expect(high.p25!).toBeGreaterThan(middle.p25!);
    expect(high.p75!).toBeGreaterThan(middle.p75!);
});

it("keeps the estimated IQR inside the range when the rate falls outside it", () => {
    const { p25, p75 } = marketExchangeIqr(10, 20, 30, 100);
    expect(p25!).toBeGreaterThanOrEqual(10);
    expect(p75!).toBeLessThanOrEqual(20);
});

it("needs more than 8 units and a range to estimate an IQR", () => {
    expect(marketExchangeIqr(10, 20, 15, 8)).toEqual({ p25: null, p75: null });
    expect(marketExchangeIqr(null, 20, 15, 100)).toEqual({ p25: null, p75: null });
    expect(marketExchangeIqr(10, 20, null, 100)).toEqual({ p25: null, p75: null });
    expect(marketExchangeIqr(10, 10, 10, 100)).toEqual({ p25: 10, p75: 10 });
});

it("estimates each hour's IQR in the exchange unit through a bridge", () => {
    const history = marketExchangeHistory(
        [
            {
                ...snapshot(teardrop, 100, taintedExalted, 150),
                lowestRatio: { [teardrop]: 1, [taintedExalted]: 1 },
                highestRatio: { [teardrop]: 1, [taintedExalted]: 2 },
            },
            snapshot(taintedExalted, 1, chaos, 300),
        ],
        teardrop,
        describe,
    );
    const direct = marketExchangeIqr(1, 2, 1.5, 100);
    expect(history.pairs[0]!.hours[0]).toMatchObject(direct);
    const [point] = history.prices;
    expect(point!.p25).toBeCloseTo(direct.p25! * 300);
    expect(point!.p75).toBeCloseTo(direct.p75! * 300);
});

it("prices PoE 2 items in exalted, through divine before chaos when there is no exalted pair", () => {
    const rows = marketExchangeRows(
        [
            snapshot(divine, 1, exalted, 400),
            snapshot(chaos, 10, exalted, 20),
            snapshot(wisdom, 100, chaos, 1),
            snapshot(teardrop, 1, chaos, 50),
            snapshot(teardrop, 10, divine, 3),
        ],
        [],
        hour,
        describe,
        [],
        0,
        "exalted",
    );
    expect(byName(rows)).toMatchObject({
        "Exalted Orb": { price: 1, current: true },
        "Divine Orb": { price: 400, via: { itemId: exalted } },
        "Chaos Orb": { price: 2, via: { itemId: exalted } },
        "Scroll of Wisdom": { price: 0.02, via: { itemId: chaos } },
        "Tainted Divine Teardrop": { price: 120, via: { itemId: divine } },
    });
});

it("returns an item's hourly exalted price through a chaos bridge", () => {
    const history = marketExchangeHistory(
        [snapshot(chaos, 10, exalted, 20), snapshot(wisdom, 100, chaos, 1)],
        wisdom,
        describe,
        "exalted",
    );
    expect(history.prices).toEqual([
        { hour, price: 0.02, low: null, high: null, p25: null, p75: null, via: chaos, units: 100 },
    ]);
});

it("sums each item's units traded across its markets by hour and UTC day", () => {
    const volumes = marketExchangeRecentVolume(
        [
            snapshot(wisdom, 500, chaos, 1),
            snapshot(wisdom, 200, divine, 1),
            snapshot(wisdom, 100, chaos, 1, hour - 3600),
            // Older than the 24 charted hours.
            snapshot(wisdom, 9_000, chaos, 1, hour - 24 * 3600),
        ],
        [
            daily(wisdom, 800, chaos, 2),
            daily(divine, 3, wisdom, 600),
            daily(wisdom, 50, chaos, 1, today - 6 * DAY),
            daily(wisdom, 9_000, chaos, 1, today - 7 * DAY),
        ],
        hour,
        [wisdom],
    );
    expect(volumes.get(wisdom)).toEqual({
        hourly: [...Array<number>(22).fill(0), 100, 700],
        daily: [50, 0, 0, 0, 0, 0, 1_400],
    });
    expect(volumes.has(chaos)).toBe(false);
});
