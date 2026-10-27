import type { ExchangeSnapshot } from "@poe-tools/market";
import { expect, it } from "vite-plus/test";
import type { TDatabase } from "~/db/client";
import { findCraftingExchangePrices } from "~/db/queries/crafting-exchange.queries";
import { bindExchangePrice, liveExchangePrices } from "~/lib/crafting-exchange";
import { chaosId, exchangeGraph, exchangeSnapshot } from "./crafting-exchange-fixtures";

const item = "Metadata/Items/Currency/CurrencyHellscapeUpgradeModTier";
const bridge = "Metadata/Items/Currency/CurrencyHellscapeAddModToRare";
const alternate = "Metadata/Items/Currency/ZBridge";
const hour = exchangeSnapshot.hour;

function pair(first: string, second: string, firstVolume: number, secondVolume: number) {
    return {
        ...exchangeSnapshot,
        marketId: `${first}|${second}`,
        volumeTraded: { [first]: firstVolume, [second]: secondVolume },
        lowestRatio: null,
        highestRatio: null,
    };
}

function database(responses: ExchangeSnapshot[][]) {
    let calls = 0;
    const db = {
        select: () => ({
            from: () => ({
                where: () => ({
                    orderBy: () => {
                        const rows = responses[calls++] ?? [];
                        return Object.assign(Promise.resolve(rows), {
                            limit: () => Promise.resolve(rows),
                        });
                    },
                }),
            }),
        }),
    } as unknown as TDatabase;
    return { db, calls: () => calls };
}

const input = {
    game: "poe1" as const,
    realm: "pc" as const,
    league: exchangeSnapshot.league,
    currency: "chaos",
    itemIds: [item],
    at: hour,
};

it("prices a same-hour exchange path through a non-reference item and retains both legs", async () => {
    const first = pair(item, bridge, 6, 6);
    const second = pair(bridge, chaosId, 1, 320);
    const otherFirst = pair(item, alternate, 1, 2);
    const otherSecond = pair(alternate, chaosId, 1, 3);
    const rows = [otherSecond, second, otherFirst, first];
    const { db, calls } = database([[], [], [], rows, rows]);
    const result = await findCraftingExchangePrices(db, {
        ...input,
        conversion: "two-leg-exchange-v1",
    });
    expect(result.missing).toEqual({});
    expect(result.quotes[item]).toMatchObject({
        amount: 320,
        hour,
        estimator: "cross-rate-v1",
        conversion: "two-leg-exchange-v1",
        legs: [
            { itemId: item, quoteId: bridge },
            { itemId: bridge, quoteId: chaosId },
        ],
    });
    const graph = bindExchangePrice(exchangeGraph(), item, result.quotes[item]!);
    expect(liveExchangePrices(graph)[0]?.reference).toMatchObject({
        itemId: item,
        conversion: "two-leg-exchange-v1",
    });
    expect(calls()).toBe(5);
});

it("does not change the old reference-currency policy or use an older matching hour", async () => {
    const first = pair(item, bridge, 6, 6);
    const second = pair(bridge, chaosId, 1, 320);
    const old = database([[], [], [], [first, second]]);
    const legacy = await findCraftingExchangePrices(old.db, {
        ...input,
        conversion: "reference-currency-v1",
    });
    expect(legacy.quotes[item]).toBeUndefined();
    expect(old.calls()).toBe(3);
    const stale = database([[], [], [], []]);
    const current = await findCraftingExchangePrices(stale.db, {
        ...input,
        at: hour + 3600,
        conversion: "two-leg-exchange-v1",
    });
    expect(current.quotes[item]).toBeUndefined();
    expect(current.missing[item]).toContain("selected completed hour");
});

it("rejects conflicting observations and fails closed when discovery is truncated", async () => {
    const first = pair(item, bridge, 6, 6);
    const conflict = pair(bridge, item, 3, 6);
    const second = pair(bridge, chaosId, 1, 320);
    const conflictingRows = [first, conflict, second];
    const conflictDb = database([[], [], [], conflictingRows, conflictingRows]);
    const conflictResult = await findCraftingExchangePrices(conflictDb.db, {
        ...input,
        conversion: "two-leg-exchange-v1",
    });
    expect(conflictResult.quotes[item]).toBeUndefined();
    const truncated = database([[], [], [], Array.from({ length: 5001 }, () => first)]);
    const result = await findCraftingExchangePrices(truncated.db, {
        ...input,
        conversion: "two-leg-exchange-v1",
    });
    expect(result.quotes[item]).toBeUndefined();
    expect(result.missing[item]).toContain("Too many exchange markets");
    expect(truncated.calls()).toBe(4);
});
