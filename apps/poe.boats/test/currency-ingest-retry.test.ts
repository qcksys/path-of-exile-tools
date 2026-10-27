import { drizzle } from "drizzle-orm/mysql-proxy";
import { afterEach, expect, it, vi } from "vite-plus/test";
import type { TDatabase } from "~/db/client";
import { upsertStashCurrencyHourly } from "~/db/queries/stash-ingest.queries";
import type { TStashCurrencyHourlyI } from "~/db/schema/stash.currency-hourly";

afterEach(() => vi.useRealTimers());

const row = (marketId: string, hour = 3600): TStashCurrencyHourlyI => ({
    realm: "pc",
    league: "Standard",
    marketId,
    hour,
    volumeTraded: { chaos: 0 },
});

it("uses the same row and chunk order for overlapping writers without mutating their input", async () => {
    const batches: unknown[][] = [];
    const db = drizzle(async (_query, params) => {
        batches.push(params);
        return { rows: [{ insertId: 0, affectedRows: 1 }] };
    }) as unknown as TDatabase;
    const rows = Array.from({ length: 401 }, (_, index) =>
        row(`market:${String(index).padStart(4, "0")}`),
    );
    const reversed = rows.toReversed();
    expect(await upsertStashCurrencyHourly(db, rows)).toBe(401);
    const first = batches.splice(0);
    expect(await upsertStashCurrencyHourly(db, reversed)).toBe(401);
    expect(batches).toEqual(first);
    expect(reversed[0]?.marketId).toBe("market:0400");
    // Three chunks, each writing hourly rows, then market first hours, daily totals and hour coverage.
    expect(first).toHaveLength(12);
});

it.each([
    Object.assign(new Error("victim"), { errno: 1213 }),
    Object.assign(new Error("victim"), { code: "ER_LOCK_DEADLOCK" }),
    new Error(
        "Deadlock found when trying to get lock; try restarting transaction (errno 1213) (sqlstate 40001)",
    ),
])("retries only the failed batch after a database deadlock", async (failure) => {
    vi.useFakeTimers();
    const attempts: unknown[][] = [];
    const db = drizzle(async (_query, params) => {
        attempts.push(params);
        if (attempts.length === 2) throw failure;
        return { rows: [{ insertId: 0, affectedRows: 1 }] };
    }) as unknown as TDatabase;
    const work = upsertStashCurrencyHourly(
        db,
        Array.from({ length: 201 }, (_, i) => row(String(i).padStart(3, "0"))),
    );
    const assertion = expect(work).resolves.toBe(201);
    await Promise.all([assertion, vi.runAllTimersAsync()]);
    // Two chunks of four statements, plus one replay of the failed second statement.
    expect(attempts).toHaveLength(9);
    expect(attempts[1]).toEqual(attempts[2]);
    expect(attempts[0]).not.toEqual(attempts[1]);
});

it("stops after three deadlock attempts and preserves the driver cause", async () => {
    vi.useFakeTimers();
    const failure = Object.assign(new Error("deadlock"), { errno: 1213 });
    const execute = vi.fn(async () => {
        throw failure;
    });
    const db = drizzle(execute) as unknown as TDatabase;
    const assertion = expect(upsertStashCurrencyHourly(db, [row("a")])).rejects.toMatchObject({
        cause: failure,
    });
    await vi.runAllTimersAsync();
    await assertion;
    expect(execute).toHaveBeenCalledTimes(3);
});

it.each([
    Object.assign(new Error("Lock wait timeout exceeded"), { errno: 1205 }),
    new Error("network failed"),
    new Error("invalid currency row"),
])("does not retry other failures", async (failure) => {
    const execute = vi.fn(async () => {
        throw failure;
    });
    const db = drizzle(execute) as unknown as TDatabase;
    await expect(upsertStashCurrencyHourly(db, [row("a")])).rejects.toMatchObject({
        cause: failure,
    });
    expect(execute).toHaveBeenCalledOnce();
});
