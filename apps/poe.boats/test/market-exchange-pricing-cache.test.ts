import { exchangeCurrencyId, marketObservationRange } from "@poe-tools/market";
import { drizzle } from "drizzle-orm/mysql-proxy";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { type TDatabase, workerDatabaseCacheScopes } from "~/db/client";
import { exchangePricingCache } from "~/db/queries/exchange-pricing-cache.server";
import type { PriceBook } from "~/db/queries/exchange-pricing-inputs.server";
import { marketFiltersSchema } from "~/schemas/market";
import { createTraceRecorder } from "./trace-recorder";

const recorder = createTraceRecorder();
const writes: Promise<unknown>[] = [];
vi.doMock("cloudflare:workers", () => ({
    env: { LOG_LEVEL: "silent" },
    tracing: recorder.tracing,
    waitUntil: (write: Promise<unknown>) => writes.push(write),
}));
const { exchangePricingBook } = await import("~/db/queries/exchange-pricing-inputs.server");

const chaos = exchangeCurrencyId("chaos")!;
const divine = exchangeCurrencyId("divine")!;
const alchemy = exchangeCurrencyId("alch")!;
const league = "Current";

function edgeCache() {
    const entries = new Map<string, string>();
    const cache = {
        match: vi.fn(async (key: string) => {
            const body = entries.get(key);
            return body === undefined ? undefined : new Response(body);
        }),
        put: vi.fn(async (key: string, response: Response) => {
            entries.set(key, await response.text());
        }),
    };
    vi.stubGlobal("caches", { open: async () => cache });
    return cache;
}

function database(coverage = 2, source = "first") {
    const hour = marketObservationRange().latestHour;
    const markets = [
        [divine, chaos],
        [alchemy, chaos],
        [alchemy, divine],
    ].map((pair) => pair.join("|"));
    const query = vi.fn(async (sql: string, params: unknown[]) => {
        if (sql.includes("hour_coverage")) return { rows: [[league, hour, hour, coverage]] };
        if (sql.includes("json_arrayagg") && sql.includes("_currency_hour`"))
            return {
                rows: markets
                    .filter((id) => params.includes(id))
                    .map((id) => [id, [[hour, 1, 12, 0, 0, 0, 0]]]),
            };
        if (sql.includes("_currency_market`")) return { rows: markets.map((id) => [id, hour]) };
        if (sql.includes("_currency_hourly`"))
            return {
                rows: markets
                    .filter((id) => params.includes(id))
                    .map((id) => [
                        "pc",
                        league,
                        id,
                        hour,
                        { [id.split("|")[1]!]: 12, [id.split("|")[0]!]: 1 },
                        null,
                        null,
                    ]),
            };
        return { rows: [] };
    });
    const db = drizzle(query) as unknown as TDatabase;
    workerDatabaseCacheScopes.set(db, { host: "market.example", source });
    return { db, query };
}

afterEach(async () => {
    await Promise.all(writes.splice(0));
    recorder.spans.length = 0;
    vi.unstubAllGlobals();
});

it("shares the currency category exchange rows across periods and sorting and bypasses free-text searches", async () => {
    const cache = edgeCache();
    const { getMarketData } = await import("~/db/queries/market.queries");
    const read = (filters: Record<string, string>, coverage = 2) =>
        getMarketData(
            database(coverage).db,
            marketFiltersSchema.parse({ league, category: "currency", ...filters }),
            "list",
        );
    const first = await read({ days: "7" });
    expect(first.exchange.length).toBeGreaterThan(0);
    expect(
        recorder.spans.findLast((s) => s.name === "market.data")?.attributes[
            "market.category_exchange_cache"
        ],
    ).toBe("miss");
    recorder.spans.length = 0;
    const longer = await read({ days: "30", order: "listings-desc" });
    expect(longer.exchange).toEqual(first.exchange);
    expect(longer.priceRates).toEqual(first.priceRates);
    expect(
        recorder.spans.find((s) => s.name === "market.data")?.attributes[
            "market.category_exchange_cache"
        ],
    ).toBe("hit");
    expect(recorder.spans.some((s) => s.name === "market.exchange_recent")).toBe(false);

    cache.put.mockClear();
    for (const q of ["div", "MY SEARCH"]) {
        const result = await read({ q });
        expect(result.exchange.map((row) => row.name)).toEqual(
            first.exchange
                .filter((row) => row.name.toLowerCase().includes(q.toLowerCase()))
                .map((row) => row.name),
        );
    }
    expect(cache.put).not.toHaveBeenCalled();
    await read({}, 3);
    expect(
        recorder.spans.findLast((s) => s.name === "market.data")?.attributes[
            "market.category_exchange_cache"
        ],
    ).toBe("miss");
});

it("reuses the league's pairs for other items and a finished price across history windows and connections", async () => {
    edgeCache();
    const { getMarketExchangeItem } = await import("~/db/queries/market.queries");
    const first = database();
    const input = { realm: "pc" as const, league, itemId: divine, days: "7" as const };
    const seven = await getMarketExchangeItem(first.db, input);
    expect(seven.item?.price).toBe(12);
    const priceQueries = first.query.mock.calls.map(([sql]) => sql);
    const dailyPricing = priceQueries.filter(
        (sql) => sql.includes("_currency_daily`") && sql.includes("json_arrayagg("),
    );
    expect(dailyPricing).toHaveLength(1);
    expect(dailyPricing[0]).toContain("group by");
    expect(recorder.spans.filter((span) => span.name === "market.exchange_recent")).toHaveLength(1);
    expect(seven.priceRates.divine).toBe(1 / 12);
    expect(
        recorder.spans.findLast((s) => s.name === "market.exchange_item")?.attributes,
    ).toMatchObject({
        "market.price_cache": "miss",
        "market.anchor_cache": "miss",
    });

    const second = database();
    recorder.spans.length = 0;
    const other = await getMarketExchangeItem(second.db, { ...input, itemId: alchemy });
    expect(other.item?.price).toBe(12);
    expect(
        recorder.spans.findLast((s) => s.name === "market.exchange_item")?.attributes,
    ).toMatchObject({
        "market.price_cache": "miss",
        "market.anchor_cache": "hit",
        "market.price_input_cached_markets": 3,
        "market.price_input_read_markets": 0,
    });
    expect(recorder.spans.map((s) => s.name)).not.toContain("market.exchange_markets");
    expect(recorder.spans.map((s) => s.name)).not.toContain("market.exchange_recent");
    expect(recorder.spans.map((s) => s.name)).not.toContain("market.exchange_daily");

    recorder.spans.length = 0;
    const thirty = await getMarketExchangeItem(second.db, { ...input, days: "30" });
    expect(thirty.item).toEqual(seven.item);
    expect(thirty.priceRates).toEqual(seven.priceRates);
    expect(thirty.historyStart).toBe(seven.historyStart - 23 * 86400);
    expect(recorder.spans.find((s) => s.name === "market.exchange_item")?.attributes).toMatchObject(
        {
            "market.price_cache": "hit",
            "market.history_cache": "miss",
        },
    );
    expect(recorder.spans.map((s) => s.name)).toContain("market.exchange_history");
    expect(recorder.spans.map((s) => s.name)).not.toContain("market.exchange_recent");
    expect(recorder.spans.map((s) => s.name)).not.toContain("market.exchange_daily");

    recorder.spans.length = 0;
    expect(await getMarketExchangeItem(database().db, { ...input, days: "30" })).toEqual(thirty);
    expect(recorder.spans.find((s) => s.name === "market.exchange_item")?.attributes).toMatchObject(
        {
            "market.history_cache": "hit",
            "market.history_markets": 3,
        },
    );
    expect(recorder.spans.map((s) => s.name)).not.toContain("market.exchange_select_history_pairs");
    expect(recorder.spans.map((s) => s.name)).not.toContain("market.exchange_history");
    expect(recorder.spans.map((s) => s.name)).not.toContain("market.exchange_build_history");

    for (const next of [database(3), database(2, "second")]) {
        await getMarketExchangeItem(next.db, input);
        expect(
            recorder.spans.findLast((s) => s.name === "market.exchange_item")?.attributes,
        ).toMatchObject({
            "market.price_cache": "miss",
            "market.history_cache": "miss",
        });
    }
});

it("returns the database price when edge cache reads and writes are unavailable", async () => {
    const cache = edgeCache();
    cache.match.mockRejectedValue(new Error("unavailable"));
    cache.put.mockRejectedValue(new Error("unavailable"));
    const { getMarketExchangeItem } = await import("~/db/queries/market.queries");
    const result = await getMarketExchangeItem(database().db, {
        realm: "pc",
        league,
        itemId: divine,
        days: "7",
    });
    expect(result.item?.price).toBe(12);
    expect(
        recorder.spans.find((s) => s.name === "market.exchange_item")?.attributes[
            "market.price_cache"
        ],
    ).toBe("bypass");
});

it("reads only a cold thin item's pairs and preserves oriented hourly ranges when another item fills a group", async () => {
    edgeCache();
    const scope = { realm: "pc" as const, league };
    const hour = marketObservationRange().latestHour;
    const cache = await exchangePricingCache(database().db, scope.realm, league, hour, "initial");
    const pair = `${divine}|${chaos}`;
    const reverse = `${chaos}|${divine}`;
    const listed = [
        pair,
        reverse,
        ...Array.from({ length: 62 }, (_, index) => `item${index}|${divine}`),
    ];
    const load = vi.fn(
        async (ids: string[]): Promise<PriceBook> =>
            Object.fromEntries(
                ids.map((id) => [
                    id,
                    {
                        hours:
                            id === reverse
                                ? [[hour, 14, 1, 0, 0, 16, 1]]
                                : [[hour, 1, 14, 1, 12, 1, 16]],
                        days: [[hour, 1, 14, 1, hour]],
                    },
                ]),
            ),
    );
    const cold = await exchangePricingBook(cache, listed, [pair, reverse], [], false, load);
    expect(cold.readMarkets).toBe(2);
    expect(load.mock.calls[0]![0].toSorted()).toEqual([pair, reverse].toSorted());
    const broad = await exchangePricingBook(cache, listed, listed.slice(0, 32), [], true, load);
    expect(broad.readMarkets).toBe(64);
    expect(Object.keys(broad.book)).toHaveLength(32);
    await Promise.all(writes);
    load.mockClear();
    const after = await exchangePricingBook(cache, listed, [pair, reverse], [], true, load);
    expect(load).not.toHaveBeenCalled();
    expect(after).toEqual({ ...cold, readMarkets: 0, cachedMarkets: 2 });

    const extended = [...listed, ...Array.from({ length: 64 }, (_, index) => `z${index}|quote`)];
    const partial = await exchangePricingBook(
        cache,
        extended,
        [pair, extended.at(-1)!],
        [],
        true,
        load,
    );
    expect(partial).toMatchObject({ cachedMarkets: 1, readMarkets: 1 });
    expect(load.mock.calls[0]![0]).toEqual([extended.at(-1)]);
    expect(Object.keys(partial.book).toSorted()).toEqual([pair, extended.at(-1)!].toSorted());
});

it("preserves scoped thin-bridge prices and conflicting inverse quotes on both cache paths", async () => {
    edgeCache();
    const { getMarketExchangeItem } = await import("~/db/queries/market.queries");
    const mirror = exchangeCurrencyId("mirror")!;
    const hour = marketObservationRange().latestHour;
    const day = Math.floor(hour / 86400) * 86400;
    const quotes = [
        { first: mirror, second: chaos, a: 1, b: 65000, hours: 1, low: 65000 },
        { first: mirror, second: divine, a: 1, b: 1000, hours: 20, low: 900 },
        { first: divine, second: chaos, a: 1, b: 400, hours: 20, low: 390 },
        { first: alchemy, second: divine, a: 1, b: 2, hours: 5, low: 2 },
        { first: divine, second: alchemy, a: 2, b: 1, hours: 5, low: 0.4 },
    ].map((row) => ({ ...row, id: [row.first, row.second].join("|") }));
    const db = drizzle(async (sql, params) => {
        if (sql.includes("hour_coverage")) return { rows: [[league, hour, hour, 5]] };
        const found = quotes.filter((row) => params.includes(row.id));
        if (sql.includes("json_arrayagg") && sql.includes("_currency_hour`"))
            return {
                rows: found.map((row) => [
                    row.id,
                    [[hour, row.a, row.b, 1, row.low, row.a, row.b]],
                ]),
            };
        if (sql.includes("_currency_market`")) return { rows: quotes.map(({ id }) => [id, hour]) };
        if (sql.includes("_currency_daily`"))
            return { rows: found.map((row) => [row.id, [[day, row.a, row.b, row.hours, hour]]]) };
        return { rows: [] };
    }) as unknown as TDatabase;
    const input = { realm: "pc" as const, league, days: "7" as const };
    const fresh = await Promise.all(
        [mirror, alchemy].map((itemId) => getMarketExchangeItem(db, { ...input, itemId })),
    );
    expect(fresh[0]!.item).toMatchObject({ price: 400000, via: { itemId: divine } });
    expect(fresh[1]!.item?.current).toBe(false);
    workerDatabaseCacheScopes.set(db, { host: "market.example", source: "thin" });
    await getMarketExchangeItem(db, { ...input, itemId: divine });
    for (const [index, itemId] of [mirror, alchemy].entries()) {
        const primed = await getMarketExchangeItem(db, { ...input, itemId });
        expect(primed).toEqual(fresh[index]);
        expect(
            recorder.spans.findLast((s) => s.name === "market.exchange_item")?.attributes,
        ).toMatchObject({
            "market.price_cache": "miss",
            "market.price_input_read_markets": 0,
        });
        expect(await getMarketExchangeItem(db, { ...input, itemId })).toEqual(primed);
        expect(
            recorder.spans.findLast((s) => s.name === "market.exchange_item")?.attributes[
                "market.price_cache"
            ],
        ).toBe("hit");
    }
});
