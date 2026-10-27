import { type ExchangeSnapshot, exchangeCurrencyId, listingCurrencyId } from "@poe-tools/market";
import { expect, it } from "vite-plus/test";
import { marketExchangeRows } from "~/lib/market-exchange";

const hour = 1_792_836_000;
const chaos = exchangeCurrencyId("chaos")!;
const divine = exchangeCurrencyId("divine")!;
const exalted = exchangeCurrencyId("exalted")!;
const wisdom = listingCurrencyId("wisdom", "poe1")!;
const unknown = "Metadata/Items/Unknown";

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
};
const describe = (id: string) =>
    names[id] ? { name: names[id], category: "currency" as const } : undefined;

it("prices each exchange item at its best rate and sums its traded volume", () => {
    const rows = marketExchangeRows(
        [
            snapshot(divine, 10, chaos, 2000),
            snapshot(exalted, 10, chaos, 50),
            // Wisdom is cheaper through exalted (0.01c) than directly (0.02c).
            snapshot(wisdom, 100, chaos, 2, hour - 3600),
            snapshot(wisdom, 500, exalted, 1),
            snapshot(unknown, 1, chaos, 1),
        ],
        hour,
        describe,
    );
    expect(Object.fromEntries(rows.map((row) => [row.name, row]))).toEqual({
        "Chaos Orb": expect.objectContaining({ chaos: 1, volume: 2053 }),
        "Divine Orb": expect.objectContaining({ chaos: 200, volume: 10, hour }),
        "Exalted Orb": expect.objectContaining({ chaos: 5, volume: 11 }),
        "Scroll of Wisdom": expect.objectContaining({
            chaos: expect.closeTo(0.01, 9),
            volume: 600,
            hour,
        }),
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
