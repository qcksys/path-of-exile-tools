// biome-ignore-all lint/style/useNamingConvention: Source fixtures and SQL rows use upstream names.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
        await db.conn.run("UPDATE ps_sale SET first_seen_at = removed_at - INTERVAL 2 HOUR");
        await rollupPs(db.conn, { hour: Math.floor(Date.now() / 3600000) * 3600 });
        const row = JSON.parse(network.mock.calls[0][1].body).rows[0];
        expect(row).toMatchObject({
            likelySales: 1,
            soldAgeSeconds: 7200,
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
    it("does not treat a copy listed alongside the sold item as its relist", async () => {
        const copy = { ...item, id: "item-copy" };
        await ingest([
            ...[1, 2, 3].map((n) => ({
                ...stash,
                id: `stash-${n}`,
                accountName: `seller-${n}`,
                items: [{ ...item, id: `item-${n}` }],
            })),
            { ...stash, items: [item, copy] },
        ]);
        await evaluateSales(db.conn, true);
        await ingest([{ ...stash, items: [copy] }]);
        await mature();
        expect(await events()).toEqual([expect.objectContaining({ status: "likely-sold" })]);
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
    it("classifies once caught up an hour after the removal, despite backlogs in between", async () => {
        await seed();
        const now = Date.now();
        await evaluateSales(db.conn, false, new Date(now + 1_800_000));
        await evaluateSales(db.conn, true, new Date(now + 1_800_000));
        expect((await events())[0].status).toBe("pending");
        await evaluateSales(db.conn, false, new Date(now + 3_000_000));
        expect((await events())[0].status).toBe("pending");
        await evaluateSales(db.conn, true, new Date(now + 3_700_000));
        expect((await events())[0].status).toBe("likely-sold");
    });
    it("records a removal as unobserved when the stream was last caught up over an hour ago", async () => {
        await ingest([
            ...[1, 2, 3].map((n) => ({
                ...stash,
                id: `stash-${n}`,
                accountName: `seller-${n}`,
                items: [{ ...item, id: `item-${n}` }],
            })),
            stash,
        ]);
        await evaluateSales(db.conn, true, new Date(Date.now() - 2 * 3_600_000));
        await ingest([{ ...stash, items: [] }]);
        await mature();
        expect((await events())[0].status).toBe("unobserved");
    });
    it("applies a stash's repeated changes within one page in order", async () => {
        await seed();
        await ingest([
            { ...stash, items: [item] },
            { ...stash, items: [] },
        ]);
        expect(
            await queryAll(
                db.conn,
                "SELECT item_id, removed_at IS NULL AS active FROM ps_listing WHERE stash_id = 'stash-0'",
            ),
        ).toEqual([{ item_id: "item-0", active: false }]);
        // Removed, relisted and removed again under one timestamp: still one sale candidate.
        await ingest([
            { ...stash, items: [item] },
            { ...stash, items: [] },
            { ...stash, items: [item] },
            { ...stash, items: [] },
        ]);
        expect(
            await queryAll(
                db.conn,
                "SELECT count(*)::INTEGER AS n FROM ps_sale GROUP BY removed_at ORDER BY removed_at",
            ),
        ).toEqual([{ n: 1 }, { n: 1 }, { n: 1 }]);
    });
    it("does not duplicate a removal when a source page is replayed", async () => {
        await seed();
        await ingest([{ ...stash, items: [] }]);
        expect(await events()).toHaveLength(1);
    });
});

it("counts listings first seen in the rolled-up hour as new", async () => {
    await ingest([{ ...stash, items: [item, { ...item, id: "item-old" }] }]);
    await db.conn.run(`UPDATE ps_listing_hour SET first_seen_at = first_seen_at - INTERVAL 2 HOUR
        WHERE item_id = 'item-old'`);
    const network = vi.fn().mockResolvedValue(Response.json({ written: 1 }));
    vi.stubGlobal("fetch", network);
    await rollupPs(db.conn, { hour: Math.floor(Date.now() / 3600000) * 3600 });
    expect(JSON.parse(network.mock.calls[0][1].body).rows[0]).toMatchObject({
        listingCount: 2,
        newCount: 1,
    });
});

it("leaves the earlier hour of a listing still in the stash but no longer captured", async () => {
    await ingest([stash]);
    // Captured yesterday; the item is still listed but now falls outside the capture policy.
    await db.conn.run(`INSERT INTO ps_listing BY NAME
        SELECT * REPLACE ('stale' AS item_id,
            last_seen_at - INTERVAL 1 DAY AS last_seen_at, first_seen_at - INTERVAL 1 DAY AS first_seen_at)
        FROM ps_listing WHERE item_id = 'item-0'`);
    await db.conn.run(`INSERT INTO ps_listing_hour BY NAME
        SELECT * EXCLUDE (removed_at, raw_item), epoch(date_trunc('hour', last_seen_at))::BIGINT AS observed_hour
        FROM ps_listing WHERE item_id = 'stale'`);
    const magic = { ...item, id: "stale", frameType: 1, rarity: "Magic", name: "" };
    await ingest([{ ...stash, items: [item, magic] }]);
    expect(
        await queryAll(
            db.conn,
            `SELECT item_id, observed_hour = epoch(date_trunc('hour', current_timestamp))::BIGINT AS current_hour
            FROM ps_listing_hour ORDER BY item_id`,
        ),
    ).toEqual([
        { item_id: "item-0", current_hour: true },
        { item_id: "stale", current_hour: false },
    ]);
});

it("re-observes a stash within the same hour after the database is reopened", async () => {
    // Index entries loaded from disk reject a key deleted and reinserted in one transaction.
    const dir = await mkdtemp(join(tmpdir(), "ingest-reopen-"));
    const path = join(dir, "market.duckdb");
    try {
        await db.close();
        db = await openDb(path);
        await ingest([stash]);
        await db.close();
        db = await openDb(path);
        await ingest([{ ...stash, items: [{ ...item, note: "~price 11 divine" }] }]);
        expect(
            await queryAll(db.conn, "SELECT item_id, price_amount FROM ps_listing_hour"),
        ).toEqual([{ item_id: "item-0", price_amount: 11 }]);
    } finally {
        await db.close();
        db = await openDb(":memory:");
        await rm(dir, { recursive: true, force: true });
    }
});

it("filters ingestion by season and refuses to reuse its cursor for another scope", async () => {
    await ingest([stash, { ...stash, id: "other", league: "Season B" }], { league: "Season A" });
    expect(await queryAll(db.conn, "SELECT DISTINCT league FROM ps_listing")).toEqual([
        { league: "Season A" },
    ]);
    await expect(ingest([], { league: "Season B" })).rejects.toThrow("another realm or season");
});

it("delivers market hours before older re-dirtied equipment hours", async () => {
    await ingest([stash]);
    await db.conn.run("UPDATE ps_listing_hour SET observed_hour = observed_hour - 3600");
    const [{ hour }] = await queryAll(db.conn, "SELECT observed_hour AS hour FROM ps_listing_hour");
    await db.conn.run(
        "INSERT INTO ps_equipment_cohort_hour VALUES ('rev', 'Season A', $1, 'cohort', current_timestamp)",
        [Number(hour) - 3600],
    );
    const network = vi
        .fn()
        .mockImplementation((_url, request) =>
            Promise.resolve(Response.json({ written: JSON.parse(request.body).rows.length })),
        );
    vi.stubGlobal("fetch", network);
    expect(await flushRollups(db.conn, { limit: 1 })).toEqual({ hours: 1, rows: 1 });
    expect(network.mock.calls.map(([, request]) => JSON.parse(request.body).stream)).toEqual([
        "psapi",
    ]);
});

it("retries failed delivery and does not resend unchanged completed hours", async () => {
    await ingest([stash]);
    await db.conn.run("UPDATE ps_listing_hour SET observed_hour = observed_hour - 3600");
    const network = vi
        .fn()
        .mockResolvedValueOnce(new Response("failed", { status: 503 }))
        .mockImplementation(() => Promise.resolve(Response.json({ written: 1 })));
    vi.stubGlobal("fetch", network);
    await expect(flushRollups(db.conn)).rejects.toMatchObject({
        message: expect.stringMatching(/^psapi rollup for hour \d+ failed$/),
        cause: expect.objectContaining({ message: expect.stringContaining("503") }),
    });
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

it("captures and rolls up essence asking prices per item regardless of stack size", async () => {
    const essenceName = "Screaming Essence of Rage";
    await ingest(
        [20, 1].map((stackSize, index) => ({
            ...stash,
            id: `essence-stash-${index}`,
            accountName: `essence-seller-${index}`,
            items: [
                {
                    ...item,
                    id: `essence-${index}`,
                    name: "",
                    baseType: essenceName,
                    typeLine: essenceName,
                    frameType: 5,
                    stackSize,
                    note: index === 0 ? "~price 10/5 chaos" : "~price 4 chaos",
                },
            ],
        })),
    );
    expect(
        await queryAll(db.conn, "SELECT price_amount FROM ps_listing ORDER BY price_amount"),
    ).toEqual([{ price_amount: 2 }, { price_amount: 4 }]);
    const network = vi.fn().mockResolvedValue(Response.json({ written: 1 }));
    vi.stubGlobal("fetch", network);
    await rollupPs(db.conn, { hour: Math.floor(Date.now() / 3600000) * 3600 });
    expect(JSON.parse(network.mock.calls[0][1].body).rows).toEqual([
        expect.objectContaining({
            itemKey: essenceName,
            baseType: essenceName,
            name: "",
            frameType: 5,
            listingCount: 2,
            uniqueSellers: 2,
            prices: {
                chaos: {
                    count: 2,
                    min: 2,
                    mean: 3,
                    p10: expect.closeTo(2.2, 9),
                    p25: 2.5,
                    median: 3,
                    p75: 3.5,
                    p90: expect.closeTo(3.8, 9),
                    max: 4,
                },
            },
        }),
    ]);
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

it.each([
    200, 503,
])("still delivers pending hours when upstream fails and checkpoints return %s", async (status) => {
    await ingest([stash]);
    await db.conn.run("UPDATE ps_listing_hour SET observed_hour = observed_hour - 3600");
    client.public.stashTabs.mockRejectedValueOnce(new Error("upstream unavailable"));
    const network = vi.fn().mockImplementation((_url, request) => {
        const payload = JSON.parse(request.body);
        return Promise.resolve(
            Response.json(
                { written: payload.rows.length },
                { status: payload.stream === "stash-checkpoints" ? status : 200 },
            ),
        );
    });
    vi.stubGlobal("fetch", network);
    await expect(runPipeline(db.conn, client, { pages: 1, currency: false })).rejects.toThrow(
        "pipeline stages failed",
    );
    expect(await queryAll(db.conn, "SELECT * FROM rollup_state")).toHaveLength(1);
    expect(network.mock.calls.map(([, request]) => JSON.parse(request.body).stream)).toEqual([
        "stash-checkpoints",
        "psapi",
    ]);
    expect(await queryAll(db.conn, "SELECT delivered FROM ps_checkpoint")).toEqual([
        { delivered: status === 200 },
    ]);
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
