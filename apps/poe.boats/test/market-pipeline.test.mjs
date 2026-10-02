// biome-ignore-all lint/style/useNamingConvention: Source fixtures and SQL rows use upstream names.
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { flushRollups, runPipeline } from "../../../packages/poe-stash-ingest/src/pipeline.ts";
import { ingestPs } from "../../../packages/poe-stash-ingest/src/ps/ingest.ts";
import { rollupPs } from "../../../packages/poe-stash-ingest/src/ps/rollup.ts";
import { evaluateSales } from "../../../packages/poe-stash-ingest/src/ps/sales.ts";
import { openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db.ts";
import { signatureValue } from "../../../packages/poe-stash-ingest/src/shared/mod-extractors/index.ts";
import {
    extractListingPrice,
    parsePriceText,
} from "../../../packages/poe-stash-ingest/src/shared/price.ts";
import { prune } from "../../../packages/poe-stash-ingest/src/shared/prune.ts";
import { assertSourceRealm } from "../../../packages/poe-stash-ingest/src/shared/source.ts";

vi.mock("../../../packages/poe-stash-ingest/src/shared/auth.ts", () => ({ REALM: undefined }));

const item = {
    id: "item-0",
    name: "Headhunter",
    typeLine: "Leather Belt",
    baseType: "Leather Belt",
    frameType: 3,
    identified: true,
    note: "~price 10 divine",
};
const stash = {
    id: "stash-0",
    accountName: "seller-0",
    league: "Season A",
    public: true,
    items: [item],
};
let db;
let next;
const client = { public: { stashTabs: vi.fn() } };

async function ingest(stashes, opts = {}) {
    client.public.stashTabs.mockResolvedValueOnce({ stashes, next_change_id: `cursor-${++next}` });
    return ingestPs(db.conn, client, { pages: 1, ...opts });
}

async function seed(overrides = {}) {
    await ingest([
        ...[1, 2, 3].map((n) => ({
            ...stash,
            id: `stash-${n}`,
            accountName: `seller-${n}`,
            items: [{ ...item, id: `item-${n}` }],
        })),
        { ...stash, items: [{ ...item, ...overrides }] },
    ]);
    await evaluateSales(db.conn, true);
    await ingest([{ ...stash, items: [] }]);
}

async function mature() {
    const start = Date.now();
    for (let seconds = 0; seconds <= 3600; seconds += 240) {
        await evaluateSales(db.conn, true, new Date(start + seconds * 1000));
    }
}

async function events() {
    return queryAll(
        db.conn,
        "SELECT status, price_amount, market_price, market_sellers FROM ps_sale ORDER BY item_id",
    );
}

beforeEach(async () => {
    db = await openDb(":memory:");
    next = 0;
    client.public.stashTabs.mockReset();
    vi.stubEnv("POE_BOATS_INGEST_URL", "https://example.invalid/api/stash-ingest");
    vi.stubEnv("POE_BOATS_INGEST_TOKEN", "test-token");
});
afterEach(async () => {
    await db.close();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe("sale inference", () => {
    it("waits for continuous caught-up coverage and records a near-market removal", async () => {
        await seed();
        expect(await events()).toEqual([
            { status: "pending", price_amount: 10, market_price: 10, market_sellers: "3" },
        ]);
        await mature();
        expect((await events())[0].status).toBe("likely-sold");
        const network = vi.fn().mockResolvedValue(Response.json({ written: 1 }));
        vi.stubGlobal("fetch", network);
        await rollupPs(db.conn, { hour: Math.floor(Date.now() / 3600000) * 3600 });
        const row = JSON.parse(network.mock.calls[0][1].body).rows[0];
        expect(row).toMatchObject({
            likelySales: 1,
            removedCount: 1,
            pendingCount: 0,
            prices: { divine: { median: 10 } },
            salesPrices: { divine: { median: 10, count: 1 } },
        });
    });
    it.each([
        "item-0",
        "replacement-id",
    ])("suppresses a same-seller relist with ID %s in another stash", async (id) => {
        await seed();
        await ingest([
            { ...stash, id: "moved-stash", items: [{ ...item, id, note: "~price 100 divine" }] },
        ]);
        await mature();
        expect((await events())[0].status).toBe("relisted");
    });
    it("retracts an earlier estimate after a late same-seller relist", async () => {
        await seed();
        await mature();
        await ingest([{ ...stash, id: "late-stash", items: [item] }]);
        expect((await events())[0].status).toBe("relisted");
    });
    it("does not confuse another seller or another season with a relist", async () => {
        await seed();
        await ingest([
            { ...stash, accountName: "buyer", id: "buyer-stash", items: [item] },
            { ...stash, league: "Season B", id: "other-season", items: [item] },
        ]);
        await mature();
        expect((await events())[0].status).toBe("likely-sold");
    });
    it("excludes entire stash withdrawals", async () => {
        await ingest([stash]);
        await ingest([{ id: stash.id, public: false }]);
        await mature();
        expect((await events())[0].status).toBe("withdrawn");
    });
    it.each([
        ["~price 100 divine", "outside-market"],
        ["~price 1 divine", "outside-market"],
        ["~price 10 chaos", "insufficient-market"],
        ["~skip", "insufficient-market"],
    ])("classifies %s as %s", async (note, status) => {
        await seed({ note });
        await mature();
        expect((await events())[0].status).toBe(status);
    });
    it("resets the grace period after an observation gap or stream backlog", async () => {
        await seed();
        const now = Date.now();
        await evaluateSales(db.conn, true, new Date(now));
        await evaluateSales(db.conn, true, new Date(now + 7200000));
        expect((await events())[0].status).toBe("pending");
        await evaluateSales(db.conn, false, new Date(now + 7260000));
        expect(
            (await queryAll(db.conn, "SELECT eligible_since FROM ps_sale"))[0].eligible_since,
        ).toBeNull();
    });
    it("does not duplicate a removal when a source page is replayed", async () => {
        await seed();
        await ingest([{ ...stash, items: [] }]);
        expect(await events()).toHaveLength(1);
    });
});

it("filters ingestion by season and refuses to reuse its cursor for another scope", async () => {
    await ingest([stash, { ...stash, id: "other", league: "Season B" }], { league: "Season A" });
    expect(await queryAll(db.conn, "SELECT DISTINCT league FROM ps_listing")).toEqual([
        { league: "Season A" },
    ]);
    await expect(ingest([], { league: "Season B" })).rejects.toThrow("another realm or season");
});

it("retries failed delivery and does not resend unchanged completed hours", async () => {
    await ingest([stash]);
    await db.conn.run("UPDATE ps_listing_hour SET observed_hour = observed_hour - 3600");
    const network = vi
        .fn()
        .mockResolvedValueOnce(new Response("failed", { status: 503 }))
        .mockImplementation(() => Promise.resolve(Response.json({ written: 1 })));
    vi.stubGlobal("fetch", network);
    await expect(flushRollups(db.conn)).rejects.toThrow("503");
    expect(await queryAll(db.conn, "SELECT * FROM rollup_state")).toHaveLength(0);
    expect(await flushRollups(db.conn)).toEqual({ hours: 1, rows: 1 });
    expect(await flushRollups(db.conn)).toEqual({ hours: 0, rows: 0 });
});

it("supports new signature kinds without editing rollup SQL", () => {
    expect(signatureValue({ kind: "new-item", variant: "a" })).toHaveLength(64);
    expect(signatureValue({ kind: "new-item", variant: "a" })).not.toBe(
        signatureValue({ kind: "new-item", variant: "b" }),
    );
});

it("parses fractional bulk prices, aliases, and explicit unpriced overrides", () => {
    expect(parsePriceText("~price 10/5 div")).toEqual({ amount: 2, currency: "divine" });
    expect(parsePriceText("~price 1/0 chaos")).toBeNull();
    expect(parsePriceText("~price 0 divine")).toBeNull();
    expect(extractListingPrice({ ...item, note: "~skip" }, "~price 10 divine")).toBeNull();
});

it("does not infer sales from removals encountered during initial catch-up", async () => {
    await ingest([stash]);
    await ingest([{ ...stash, items: [] }]);
    await mature();
    expect((await events())[0].status).toBe("unobserved");
});

it("withdraws pending candidates when their entire stash becomes private", async () => {
    await seed();
    await ingest([{ id: stash.id, public: false }]);
    await mature();
    expect((await events())[0].status).toBe("withdrawn");
});

it("keeps active listings and evidence needed to correct prior sale hours when pruning", async () => {
    await seed();
    await db.conn.run("UPDATE ps_listing SET last_seen_at = last_seen_at - INTERVAL 40 DAY");
    await db.conn.run(
        "UPDATE ps_listing_hour SET observed_hour = observed_hour - 40 * 86400, last_seen_at = last_seen_at - INTERVAL 40 DAY",
    );
    await db.conn.run("UPDATE ps_sale SET removed_at = removed_at - INTERVAL 40 DAY");
    await db.conn.run(
        "INSERT INTO rollup_state SELECT DISTINCT 'psapi', league, observed_hour, current_timestamp, 1 FROM ps_listing_hour",
    );
    expect(await prune(db.conn, { keepDays: 30, maxRows: 1 })).toMatchObject({
        afterRows: 4,
        droppedHourlyRows: 0,
    });
});

it("rejects relabeling stored observations as another realm", async () => {
    await ingest([stash]);
    await expect(assertSourceRealm(db.conn, "poe2")).rejects.toThrow("realm");
});

it("still delivers pending hours when the next upstream ingest fails", async () => {
    await ingest([stash]);
    await db.conn.run("UPDATE ps_listing_hour SET observed_hour = observed_hour - 3600");
    client.public.stashTabs.mockRejectedValueOnce(new Error("upstream unavailable"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ written: 1 })));
    await expect(runPipeline(db.conn, client, { pages: 1, currency: false })).rejects.toThrow(
        "pipeline stages failed",
    );
    expect(await queryAll(db.conn, "SELECT * FROM rollup_state")).toHaveLength(1);
});

it("batches large stashes without losing raw modifiers, null fields, or icon counts", async () => {
    const iconAsset = "Art/2DItems/Belts/Headhunter";
    const icon = `https://example.invalid/gen/image/${Buffer.from(JSON.stringify([0, 0, { f: iconAsset }])).toString("base64url")}`;
    const items = Array.from({ length: 1000 }, (_, n) => ({
        ...item,
        id: `batch-${n}`,
        icon,
        explicitMods: [{ description: '+25 to Strength "quoted"' }],
    }));
    expect(await ingest([{ ...stash, items }])).toMatchObject({ inserted: 1000 });
    expect(await ingest([{ ...stash, items }])).toMatchObject({ inserted: 0, updated: 1000 });
    expect(await queryAll(db.conn, "SELECT count(*) AS total FROM ps_listing")).toEqual([
        { total: "1000" },
    ]);
    expect(await queryAll(db.conn, "SELECT seen_count FROM icon_basemap")).toEqual([
        { seen_count: "2000" },
    ]);
    const [row] = await queryAll(
        db.conn,
        "SELECT raw_item, foil_variation, mod_signature FROM ps_listing LIMIT 1",
    );
    expect(JSON.parse(row.raw_item).explicitMods).toEqual(items[0].explicitMods);
    expect(row.foil_variation).toBeNull();
    expect(row.mod_signature).toBeNull();
});
