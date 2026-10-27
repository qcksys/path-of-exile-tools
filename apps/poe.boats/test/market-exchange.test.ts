import { type ExchangeSnapshot, exchangeCurrencyId, listingCurrencyId } from "@poe-tools/market";
import { expect, it } from "vite-plus/test";
import { marketExchangeRows } from "~/lib/market-exchange";

const hour = 1_792_836_000;
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

it("prices each exchange item using only the selected hour", () => {
    const rows = marketExchangeRows(
        [
            snapshot(divine, 10, chaos, 2000),
            snapshot(exalted, 10, chaos, 50),
            // An older direct pair is excluded from the price and volume.
            snapshot(wisdom, 100, chaos, 2, hour - 3600),
            snapshot(wisdom, 500, exalted, 1),
            snapshot(unknown, 1, chaos, 1),
        ],
        hour,
        describe,
    );
    expect(Object.fromEntries(rows.map((row) => [row.name, row]))).toEqual({
        "Chaos Orb": expect.objectContaining({ chaos: 1, volume: 2051 }),
        "Divine Orb": expect.objectContaining({ chaos: 200, volume: 10, hour }),
        "Exalted Orb": expect.objectContaining({ chaos: 5, volume: 11 }),
        "Scroll of Wisdom": expect.objectContaining({
            chaos: expect.closeTo(0.01, 9),
            volume: 500,
            hour,
        }),
    });
});

it("prices an item through another traded item when both legs are in the selected hour", () => {
    const rows = marketExchangeRows(
        [snapshot(teardrop, 6, taintedExalted, 6), snapshot(taintedExalted, 1, chaos, 320)],
        hour,
        describe,
    );
    expect(rows.find((row) => row.itemId === teardrop)).toMatchObject({
        chaos: 320,
        volume: 6,
        hour,
    });
    const missingBridge = marketExchangeRows(
        [
            snapshot(teardrop, 6, taintedExalted, 6),
            snapshot(taintedExalted, 1, chaos, 320, hour - 3600),
        ],
        hour,
        describe,
    );
    expect(missingBridge.find((row) => row.itemId === teardrop)?.chaos).toBeNull();
});

it("prefers the direct quote over conversion, matching crafting exchange pricing", () => {
    const rows = marketExchangeRows(
        [
            snapshot(wisdom, 100, chaos, 2),
            snapshot(wisdom, 500, exalted, 1),
            snapshot(exalted, 10, chaos, 50),
        ],
        hour,
        describe,
    );
    expect(rows.find((row) => row.itemId === wisdom)?.chaos).toBe(0.02);
});

it("does not use older trades or combine conversion legs from different hours", () => {
    const rows = marketExchangeRows(
        [
            snapshot(divine, 10, chaos, 2000, hour - 3600),
            snapshot(wisdom, 100, divine, 1),
            snapshot(exalted, 1, chaos, 5, hour - 3600),
        ],
        hour,
        describe,
        [divine, exalted, wisdom],
    );
    expect(rows.find((row) => row.name === "Scroll of Wisdom")).toMatchObject({
        chaos: null,
        volume: 100,
        hour,
    });
    expect(rows.find((row) => row.name === "Divine Orb")).toMatchObject({ chaos: null, hour });
    expect(rows.find((row) => row.name === "Exalted Orb")).toMatchObject({
        chaos: null,
        volume: 0,
        hour: null,
    });
});

it("keeps only the newest observation of a pair stored under both orders", () => {
    const rows = marketExchangeRows(
        [
            snapshot(divine, 10, chaos, 2000, hour - 3600),
            { ...snapshot(chaos, 1500, divine, 10), marketId: `${chaos}|${divine}` },
        ],
        hour,
        describe,
    );
    expect(rows.find((row) => row.name === "Divine Orb")).toMatchObject({
        chaos: 150,
        volume: 10,
        hour,
    });
});

it("lists exchange items that did not trade without a price", () => {
    const rows = marketExchangeRows([snapshot(divine, 10, chaos, 2000)], hour, describe, [
        divine,
        chaos,
        wisdom,
        unknown,
    ]);
    expect(rows.find((row) => row.name === "Scroll of Wisdom")).toEqual({
        itemId: wisdom,
        name: "Scroll of Wisdom",
        category: "currency",
        chaos: null,
        volume: 0,
        hour: null,
    });
    expect(rows.map((row) => row.name).sort()).toEqual([
        "Chaos Orb",
        "Divine Orb",
        "Scroll of Wisdom",
    ]);
});
