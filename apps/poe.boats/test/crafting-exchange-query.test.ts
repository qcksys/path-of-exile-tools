import { DatabaseSync } from "node:sqlite";
import type { ExchangeSnapshot } from "@poe-tools/market";
import { drizzle } from "drizzle-orm/mysql-proxy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { DB_TABLE_PREFIX } from "~/const";
import type { TDatabase } from "~/db/client";
import { findCraftingExchangePrices } from "~/db/queries/crafting-exchange.queries";
import type { CraftingExchangeInput } from "~/schemas/crafting-exchange";

const item = "Metadata/Items/Currency/EssenceTest";
const chaos = "Metadata/Items/Currency/CurrencyRerollRare";
const divine = "Metadata/Items/Currency/CurrencyModValues";
const now = Date.parse("2026-10-22T12:30:00Z") / 1000;
const completedHour = now - 5400;
const input: CraftingExchangeInput = {
    game: "poe1",
    realm: "pc",
    league: "Allflame",
    currency: "chaos",
    itemIds: [item],
};
let sqlite: DatabaseSync;
let db: TDatabase;

function snapshot(from: string, to: string, hour: number, amount = 2, volume = 100) {
    const row: ExchangeSnapshot = {
        realm: "pc",
        league: "Allflame",
        marketId: `${from}|${to}`,
        hour,
        volumeTraded: { [from]: volume, [to]: volume * amount },
        lowestRatio: null,
        highestRatio: null,
    };
    sqlite
        .prepare(
            `INSERT INTO ${DB_TABLE_PREFIX}stash_poe1_currency_hourly VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
            row.realm,
            row.league,
            row.marketId,
            row.hour,
            JSON.stringify(row.volumeTraded),
            null,
            null,
        );
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now * 1000);
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`CREATE TABLE ${DB_TABLE_PREFIX}stash_poe1_currency_hourly (
        realm TEXT, league TEXT, marketId TEXT, hour INTEGER,
        volumeTraded TEXT, lowestRatio TEXT, highestRatio TEXT
    )`);
    db = drizzle(async (sql, params) => {
        const statement = sqlite.prepare(sql);
        statement.setReturnArrays(true);
        return {
            rows: statement
                .all(...params)
                .map((row) =>
                    Object.values(row).map((value) =>
                        typeof value === "string" && value.startsWith("{")
                            ? JSON.parse(value)
                            : value,
                    ),
                ),
        };
    }) as unknown as TDatabase;
});
afterEach(() => {
    sqlite.close();
    vi.useRealTimers();
});

describe("captured crafting exchange prices", () => {
    it("rejects old captures instead of reporting them as current prices", async () => {
        snapshot(item, chaos, completedHour - 13 * 24 * 3600);
        const result = await findCraftingExchangePrices(db, input);
        expect(result.quotes[item]).toBeUndefined();
        expect(result.missing[item]).toContain("selected completed hour");
    });

    it("selects completed hours and preserves an inclusive historical cutoff", async () => {
        snapshot(item, chaos, completedHour + 3600, 9);
        snapshot(item, chaos, completedHour, 3);
        snapshot(item, chaos, completedHour - 3600, 2);
        expect((await findCraftingExchangePrices(db, input)).quotes[item]?.amount).toBe(3);
        expect(
            (await findCraftingExchangePrices(db, { ...input, at: completedHour - 3600 })).quotes[
                item
            ]?.amount,
        ).toBe(2);
        expect(
            (await findCraftingExchangePrices(db, { ...input, at: now + 86400 })).quotes[item]
                ?.amount,
        ).toBe(3);
    });

    it("bounds freshness at the historical cutoff without substituting current observations", async () => {
        const at = completedHour - 10 * 24 * 3600;
        snapshot(item, chaos, at, 5);
        snapshot(item, chaos, completedHour, 9);
        expect((await findCraftingExchangePrices(db, { ...input, at })).quotes[item]?.amount).toBe(
            5,
        );
        const missing = await findCraftingExchangePrices(db, { ...input, at: at + 24 * 3600 });
        expect(missing.quotes[item]).toBeUndefined();
        expect(missing.missing[item]).toContain("selected completed hour");
    });

    it("does not replace a zero-volume newest pair with an older positive observation", async () => {
        snapshot(item, chaos, completedHour, 0, 0);
        snapshot(chaos, item, completedHour - 3600, 0.5);
        const result = await findCraftingExchangePrices(db, input);
        expect(result.quotes[item]).toBeUndefined();
        expect(result.missing[item]).toContain("positive traded volume");
    });

    it("rejects conflicting inverse observations in the same latest hour", async () => {
        snapshot(item, chaos, completedHour);
        snapshot(chaos, item, completedHour, 0, 0);
        expect((await findCraftingExchangePrices(db, input)).quotes[item]).toBeUndefined();
    });

    it("does not reuse an older common hour when a conversion leg is missing at the cutoff", async () => {
        snapshot(item, divine, completedHour, 2);
        snapshot(item, divine, completedHour - 3600, 3);
        snapshot(divine, chaos, completedHour - 3600, 100);
        const result = await findCraftingExchangePrices(db, {
            ...input,
            conversion: "reference-currency-v1",
        });
        expect(result.quotes[item]).toBeUndefined();
        expect(result.missing[item]).toBeTruthy();
    });

    it("does not hide a zero-volume newest conversion leg with older positive trades", async () => {
        snapshot(item, divine, completedHour, 0, 0);
        snapshot(item, divine, completedHour - 3600, 3);
        snapshot(divine, chaos, completedHour - 3600, 100);
        expect(
            (
                await findCraftingExchangePrices(db, {
                    ...input,
                    conversion: "reference-currency-v1",
                })
            ).quotes[item],
        ).toBeUndefined();
    });

    it("uses a cutoff-hour bridge instead of an older direct pair by default", async () => {
        snapshot(item, chaos, completedHour - 3600, 5);
        snapshot(item, divine, completedHour, 2);
        snapshot(divine, chaos, completedHour, 100);
        const request: CraftingExchangeInput = {
            ...input,
            at: completedHour,
            conversion: "reference-currency-v1",
        };
        expect((await findCraftingExchangePrices(db, request)).quotes[item]).toMatchObject({
            amount: 200,
            hour: completedHour,
            estimator: "cross-rate-v1",
        });
        const result = await findCraftingExchangePrices(db, request, { exactHour: true });
        expect(result.quotes[item]).toMatchObject({
            amount: 200,
            hour: completedHour,
            estimator: "cross-rate-v1",
        });
    });

    it.each([
        undefined,
        "adaptive-v1",
    ] as const)("leaves an absent cutoff-hour observation unknown with window %s", async (window) => {
        snapshot(item, chaos, completedHour - 3600, 3);
        const result = await findCraftingExchangePrices(db, { ...input, window });
        expect(result.quotes[item]).toBeUndefined();
        expect(result.missing[item]).toBeTruthy();
        expect(
            (
                await findCraftingExchangePrices(db, {
                    ...input,
                    window,
                    at: completedHour - 3600,
                })
            ).quotes[item],
        ).toMatchObject({ amount: 3, hour: completedHour - 3600 });
    });

    it("uses the same adaptive window for both conversion legs", async () => {
        for (let offset = 0; offset < 24; offset++) {
            snapshot(item, divine, completedHour - offset * 3600, 2, 20);
            snapshot(divine, chaos, completedHour - offset * 3600, 100, 2);
        }
        const result = await findCraftingExchangePrices(db, {
            ...input,
            conversion: "reference-currency-v1",
            window: "adaptive-v1",
        });
        expect(result.quotes[item]).toMatchObject({
            amount: 200,
            hour: completedHour,
            windowStart: completedHour - 5 * 3600,
            legs: [
                { windowStart: completedHour - 5 * 3600, itemVolume: 120 },
                { windowStart: completedHour - 5 * 3600, itemVolume: 12 },
            ],
        });
    });
});
