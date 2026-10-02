// biome-ignore-all lint/style/useNamingConvention: Fixtures use the upstream API's field names.
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createClient } from "../../../packages/poe-api-client/src/client.ts";
import { ingestCx } from "../../../packages/poe-stash-ingest/src/cx/ingest.ts";
import { rollupCx } from "../../../packages/poe-stash-ingest/src/cx/rollup.ts";
import { ingestPs } from "../../../packages/poe-stash-ingest/src/ps/ingest.ts";
import { rollupPs } from "../../../packages/poe-stash-ingest/src/ps/rollup.ts";
import { getCursor } from "../../../packages/poe-stash-ingest/src/shared/cursor.ts";
import { openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db.ts";
import { extractModSignature } from "../../../packages/poe-stash-ingest/src/shared/mod-extractors/index.ts";
import { push } from "../../../packages/poe-stash-ingest/src/shared/remote/push.ts";
import { action } from "../app/routes/api.stash-ingest.ts";

vi.mock("../../../packages/poe-stash-ingest/src/shared/auth.ts", () => ({ REALM: undefined }));
vi.mock("../app/context.ts", () => ({ envContext: "env", dbContext: "db" }));
vi.mock("../app/services/logger.ts", () => ({
    logger: { info: vi.fn(), error: vi.fn() },
}));
vi.mock("../app/db/queries/stash-ingest.queries.ts", () => ({
    upsertStashUniqueHourly: async (_db, rows) => rows.length,
    upsertStashCurrencyHourly: async (_db, rows) => rows.length,
    upsertStashBasemapSnapshot: async (_db, rows) => rows.length,
}));

const hour = Math.floor(Date.now() / 3_600_000) * 3600;
const icon = `https://web.poecdn.com/gen/image/${Buffer.from(
    JSON.stringify([1, 2, { f: "2DItems/Belts/Headhunter" }]),
).toString("base64url")}`;
const item = {
    id: "item-1",
    verified: true,
    w: 2,
    h: 1,
    icon,
    name: "Headhunter",
    typeLine: "Leather Belt",
    baseType: "Leather Belt",
    ilvl: 85,
    identified: true,
    frameType: 3,
    note: "~price 10 divine",
};
const stash = {
    id: "stash-1",
    public: true,
    accountName: "seller-1",
    league: "Standard",
    stash: "~price 12 divine",
    stashType: "PremiumStash",
    items: [item],
};
const market = {
    league: "Standard",
    market_id: "chaos|divine",
    lowest_ratio: { chaos: 100, divine: 1 },
    highest_ratio: { chaos: 110, divine: 1 },
    volume_traded: { chaos: 1000, divine: 10 },
    lowest_stock: { chaos: 100, divine: 1 },
    highest_stock: { chaos: 1000, divine: 10 },
};
let db;
const network = vi.fn();
const client = createClient({ userAgent: "ingest-validation", token: "inert-test-token" });

function page(stashes = [stash], next = "cursor-1") {
    network.mockResolvedValueOnce(Response.json({ stashes, next_change_id: next }));
}

async function receive(payload, authorization = "Bearer inert-test-token") {
    return action({
        request: new Request("https://example.invalid/api/stash-ingest", {
            method: "POST",
            headers: { authorization, "content-type": "application/json" },
            body: JSON.stringify(payload),
        }),
        context: {
            get: (key) => (key === "env" ? { STASH_INGEST_TOKEN: "inert-test-token" } : {}),
        },
    });
}

beforeEach(async () => {
    network.mockReset();
    network.mockImplementation(async () => {
        throw new Error("Unexpected network call");
    });
    vi.stubGlobal("fetch", network);
    vi.stubEnv("POE_BOATS_INGEST_URL", "https://example.invalid/api/stash-ingest");
    vi.stubEnv("POE_BOATS_INGEST_TOKEN", "inert-test-token");
    db = await openDb(":memory:");
});
afterEach(async () => {
    await db?.close();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe("public stash lifecycle", () => {
    it("inserts, updates price, removes missing items, and saves the cursor", async () => {
        page();
        expect((await ingestPs(db.conn, client, { pages: 1 })).inserted).toBe(1);
        page([{ ...stash, items: [{ ...item, note: "~price 20 divine" }] }], "cursor-2");
        expect((await ingestPs(db.conn, client, { pages: 1 })).updated).toBe(1);
        expect(
            (await queryAll(db.conn, "SELECT price_amount FROM ps_listing"))[0]?.price_amount,
        ).toBe(20);
        page([{ ...stash, items: [] }], "cursor-3");
        expect((await ingestPs(db.conn, client, { pages: 1 })).removed).toBe(1);
        expect(await getCursor(db.conn, "psapi")).toBe("cursor-3");
    });
    it("removes listings when a stash is unlisted", async () => {
        page();
        await ingestPs(db.conn, client, { pages: 1 });
        network.mockResolvedValueOnce(
            Response.json({
                next_change_id: "cursor-2",
                stashes: [{ id: stash.id, public: false }],
            }),
        );
        expect((await ingestPs(db.conn, client, { pages: 1 })).removed).toBe(1);
    });
    it("preserves the previous hour when a listing is updated before rollup", async () => {
        page();
        await ingestPs(db.conn, client, { pages: 1 });
        await db.conn.run(
            "UPDATE ps_listing SET first_seen_at = to_timestamp($1), last_seen_at = to_timestamp($1)",
            [hour - 60],
        );
        await db.conn.run(
            "UPDATE ps_listing_hour SET observed_hour = $1, first_seen_at = to_timestamp($2), last_seen_at = to_timestamp($2)",
            [hour - 3600, hour - 60],
        );
        expect((await rollupPs(db.conn, { hour: hour - 3600, dryRun: true })).rows).toBe(1);
        page([{ ...stash, items: [{ ...item, note: "~price 20 divine" }] }], "cursor-2");
        await ingestPs(db.conn, client, { pages: 1 });
        expect((await rollupPs(db.conn, { hour: hour - 3600, dryRun: true })).rows).toBe(1);
    });
    it("does not advance the cursor when a page fails partway through", async () => {
        page();
        await ingestPs(db.conn, client, { pages: 1 });
        page([{ ...stash, items: [{ ...item, id: "invalid", baseType: null }] }], "cursor-2");
        await expect(ingestPs(db.conn, client, { pages: 1 })).rejects.toThrow();
        expect(await getCursor(db.conn, "psapi")).toBe("cursor-1");
    });
    it("rolls back listing changes when a later stash fails in the same page", async () => {
        page([
            stash,
            {
                ...stash,
                id: "stash-2",
                items: [{ ...item, id: "invalid", frameType: 3, baseType: null }],
            },
        ]);
        await expect(ingestPs(db.conn, client, { pages: 1 })).rejects.toThrow();
        expect(await queryAll(db.conn, "SELECT item_id FROM ps_listing")).toEqual([]);
    });
});

describe("currency ingestion and delivery", () => {
    it("stores the requested hour and is idempotent when fetched again", async () => {
        for (let i = 0; i < 2; i++) {
            network.mockResolvedValueOnce(
                Response.json({ next_change_id: hour, markets: [market] }),
            );
            await ingestCx(db.conn, client, { fromHour: hour - 3600, catchUp: false });
        }
        const rows = await queryAll(db.conn, "SELECT observed_hour FROM cx_market_hour");
        expect(rows).toHaveLength(1);
        expect(Number(rows[0]?.observed_hour)).toBe(hour - 3600);
        expect(await getCursor(db.conn, "cxapi")).toBe(String(hour));
    });
    it("sends a real DuckDB rollup accepted by the receiver", async () => {
        page();
        await ingestPs(db.conn, client, { pages: 1 });
        network.mockImplementationOnce(async (_url, init) =>
            receive(JSON.parse(String(init?.body))),
        );
        expect((await rollupPs(db.conn, { hour })).rows).toBe(1);
        expect(await queryAll(db.conn, "SELECT * FROM rollup_state")).toHaveLength(1);
    });
    it("does not mark a failed remote push as delivered", async () => {
        network.mockResolvedValueOnce(Response.json({ next_change_id: hour, markets: [market] }));
        await ingestCx(db.conn, client, { fromHour: hour - 3600, catchUp: false });
        network.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
        await expect(rollupCx(db.conn, { hour: hour - 3600 })).rejects.toThrow("503");
        expect(await queryAll(db.conn, "SELECT * FROM rollup_state")).toEqual([]);
    });
    it("delivers market IDs observed in the public currency-exchange feed", async () => {
        const liveMarketId =
            "Metadata/Items/DivinationCards/DivinationCardTheMetalsmithsGift|Metadata/Items/DivinationCards/DivinationCardTheEnlightened";
        network.mockResolvedValueOnce(
            Response.json({
                next_change_id: hour,
                markets: [{ ...market, market_id: liveMarketId }],
            }),
        );
        await ingestCx(db.conn, client, { fromHour: hour - 3600, catchUp: false });
        network.mockImplementationOnce(async (_url, init) =>
            receive(JSON.parse(String(init?.body))),
        );
        await expect(rollupCx(db.conn, { hour: hour - 3600 })).resolves.toMatchObject({ rows: 1 });
    });
    it("splits remote pushes into batches of at most 500 rows", async () => {
        network.mockImplementation(async (_url, init) =>
            Response.json({ written: JSON.parse(init.body).rows.length }),
        );
        const row = { iconAsset: "icon", name: "name", baseType: "base", seenCount: 1 };
        await push({ stream: "basemap", rows: Array.from({ length: 1001 }, () => row) });
        expect(
            network.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).rows.length),
        ).toEqual([500, 500, 1]);
    });
    it("retries a transient 503 from the upstream API", async () => {
        network.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
        page();
        await expect(client.public.stashTabs()).resolves.toMatchObject({
            next_change_id: "cursor-1",
        });
        expect(network).toHaveBeenCalledTimes(2);
    });
});

describe("API error reporting", () => {
    it.each([401, 503])("preserves the response body after HTTP %s fails", async (status) => {
        const body = { error: { code: 1, message: "Seeded upstream failure" } };
        network.mockImplementation(async () => Response.json(body, { status }));
        await expect(client.public.stashTabs()).rejects.toMatchObject({
            name: "PoeApiError",
            status,
            body,
        });
        expect(network).toHaveBeenCalledTimes(status === 503 ? 3 : 1);
    });
});

describe("receiver validation and mod extraction", () => {
    it("rejects unauthorized and malformed payloads", async () => {
        expect((await receive({ stream: "psapi", rows: [] }, "Bearer wrong")).status).toBe(401);
        expect((await receive({ stream: "unknown", rows: [] })).status).toBe(400);
        expect((await receive({ stream: "psapi", rows: [{}] })).status).toBe(400);
    });
    it("extracts the aura from the suffix form of a Watcher's Eye modifier", () => {
        expect(
            extractModSignature({
                ...item,
                name: "Watcher's Eye",
                explicitMods: [
                    "Gain 15% of Physical Damage as Extra Fire Damage while affected by Anger",
                ],
            }),
        ).toMatchObject({ kind: "watchers-eye", mods: [{ aura: "Anger" }] });
    });
    it("accepts the full signature emitted by a supported three-mod Watcher's Eye", async () => {
        page([
            {
                ...stash,
                items: [
                    {
                        ...item,
                        name: "Watcher's Eye",
                        explicitMods: [
                            "While affected by Anger, Gain 15% of Physical Damage as Extra Fire Damage",
                            "While affected by Hatred, Damage Penetrates 15% Cold Resistance",
                            "While affected by Discipline, Regenerate 2.5% of Energy Shield per Second",
                        ],
                    },
                ],
            },
        ]);
        await ingestPs(db.conn, client, { pages: 1 });
        network.mockImplementationOnce(async (_url, init) =>
            receive(JSON.parse(String(init?.body))),
        );
        await expect(rollupPs(db.conn, { hour })).resolves.toMatchObject({ rows: 1 });
    });
});
