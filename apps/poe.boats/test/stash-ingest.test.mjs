// biome-ignore-all lint/style/useNamingConvention: Fixtures use the upstream API's field names.
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createClient } from "../../../packages/poe-api-client/src/client.ts";
import { ingestCx } from "../../../packages/poe-stash-ingest/src/cx/ingest.ts";
import { rollupCx } from "../../../packages/poe-stash-ingest/src/cx/rollup.ts";
import { flushRollups } from "../../../packages/poe-stash-ingest/src/pipeline.ts";
import { ingestPs } from "../../../packages/poe-stash-ingest/src/ps/ingest.ts";
import { rollupPs } from "../../../packages/poe-stash-ingest/src/ps/rollup.ts";
import {
    isUniqueItem,
    shouldCapture,
} from "../../../packages/poe-stash-ingest/src/shared/capture.ts";
import { getCursor } from "../../../packages/poe-stash-ingest/src/shared/cursor.ts";
import { openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db.ts";
import {
    extractModSignature,
    signatureValue,
} from "../../../packages/poe-stash-ingest/src/shared/mod-extractors/index.ts";
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
    market_id:
        "Metadata/Items/Currency/CurrencyRerollRare|Metadata/Items/Currency/CurrencyModValues",
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
    it("preserves unique identity, raw frames and basemap learning without a legacy frame", async () => {
        const current = {
            ...item,
            frameType: undefined,
            frameTypeId: "opaque-source-frame",
            rarity: "Unique",
        };
        page([
            {
                ...stash,
                items: [current, { ...current, id: "unidentified", identified: false, name: "" }],
            },
        ]);
        expect((await ingestPs(db.conn, client, { pages: 1 })).inserted).toBe(2);
        const rows = await queryAll(
            db.conn,
            "SELECT item_id, item_key, frame_type, raw_item FROM ps_listing ORDER BY item_id",
        );
        expect(
            rows.map(({ item_id, item_key, frame_type }) => ({ item_id, item_key, frame_type })),
        ).toEqual([
            { item_id: "item-1", item_key: "Headhunter", frame_type: -1 },
            { item_id: "unidentified", item_key: "unid:2DItems/Belts/Headhunter", frame_type: -1 },
        ]);
        expect(JSON.parse(rows[0].raw_item)).toMatchObject({
            frameTypeId: "opaque-source-frame",
            rarity: "Unique",
        });
        expect(await queryAll(db.conn, "SELECT name, base_type FROM icon_basemap")).toEqual([
            { name: "Headhunter", base_type: "Leather Belt" },
        ]);
        network.mockImplementationOnce(async (_url, init) =>
            receive(JSON.parse(String(init?.body))),
        );
        expect((await rollupPs(db.conn, { hour })).rows).toBe(2);
        page([{ ...stash, items: [item] }], "legacy-update");
        expect((await ingestPs(db.conn, client, { pages: 1 })).updated).toBe(1);
        expect(
            await queryAll(
                db.conn,
                "SELECT item_key, frame_type FROM ps_listing WHERE item_id = 'item-1'",
            ),
        ).toEqual([{ item_key: "Headhunter", frame_type: 3 }]);
    });
    it("prefers explicit rarity and does not infer an opaque frame's meaning", () => {
        expect(isUniqueItem({ frameType: 3 })).toBe(true);
        expect(isUniqueItem({ rarity: "Rare", frameType: 3 })).toBe(false);
        expect(
            shouldCapture({ ...item, frameType: undefined, frameTypeId: "opaque-source-frame" }),
        ).toBe(false);
        expect(shouldCapture({ ...item, frameType: undefined, rarity: "Currency" })).toBe(true);
    });
    it.each([
        [
            "Forbidden Flame",
            "Allocates Unstoppable if you have the matching modifier on Forbidden Flesh",
        ],
        ["Forbidden Shako", "Socketed Gems are Supported by Level 35 Ice Bite"],
        [
            "Impossible Escape",
            "Passive Skills in Radius of Iron Reflexes can be Allocated\nwithout being connected to your tree",
        ],
        ["Watcher's Eye", "20% increased Fire Damage while affected by Anger"],
    ])("preserves %s signatures across current and legacy payloads", (name, mod) => {
        const legacy = { ...item, name, explicitMods: [mod] };
        const signature = extractModSignature(legacy);
        expect(signature).not.toBeNull();
        expect(
            extractModSignature({
                ...legacy,
                frameType: undefined,
                frameTypeId: "opaque-source-frame",
                rarity: "Unique",
            }),
        ).toEqual(signature);
    });
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
    it("checkpoints committed pages before fetching another page, without checkpointing the last", async () => {
        const checkpoints = [];
        const run = db.conn.run.bind(db.conn);
        const spy = vi.spyOn(db.conn, "run").mockImplementation(async (sql, ...args) => {
            if (sql === "CHECKPOINT") {
                checkpoints.push({
                    requests: network.mock.calls.length,
                    cursor: await getCursor(db.conn, "psapi"),
                    price: (await queryAll(db.conn, "SELECT price_amount FROM ps_listing"))[0]
                        ?.price_amount,
                });
            }
            return run(sql, ...args);
        });
        try {
            for (const amount of [10, 20, 30])
                page(
                    [{ ...stash, items: [{ ...item, note: `~price ${amount} divine` }] }],
                    `cursor-${amount}`,
                );
            expect(await ingestPs(db.conn, client, { pages: 3 })).toMatchObject({
                pages: 3,
                inserted: 1,
                updated: 2,
                finalCursor: "cursor-30",
            });
            expect(checkpoints).toEqual([
                { requests: 1, cursor: "cursor-10", price: 10 },
                { requests: 2, cursor: "cursor-20", price: 20 },
            ]);
            expect(await queryAll(db.conn, "SELECT price_amount FROM ps_listing")).toEqual([
                { price_amount: 30 },
            ]);
        } finally {
            spy.mockRestore();
        }
    });
    it("retains the committed cursor when a page checkpoint fails and retries the unfetched page", async () => {
        const failure = new Error("Checkpoint failed");
        const run = db.conn.run.bind(db.conn);
        const spy = vi.spyOn(db.conn, "run").mockImplementation(async (sql, ...args) => {
            if (sql === "CHECKPOINT") throw failure;
            return run(sql, ...args);
        });
        try {
            page();
            page([{ ...stash, items: [{ ...item, note: "~price 20 divine" }] }], "cursor-2");
            await expect(ingestPs(db.conn, client, { pages: 2 })).rejects.toBe(failure);
            expect(network).toHaveBeenCalledOnce();
            expect(await getCursor(db.conn, "psapi")).toBe("cursor-1");
            expect(await queryAll(db.conn, "SELECT price_amount FROM ps_listing")).toEqual([
                { price_amount: 10 },
            ]);
            spy.mockRestore();
            expect(await ingestPs(db.conn, client, { pages: 1 })).toMatchObject({
                pages: 1,
                updated: 1,
                finalCursor: "cursor-2",
            });
            expect(network).toHaveBeenCalledTimes(2);
            const retry = new Request(network.mock.calls[1][0]);
            expect(new URL(retry.url).searchParams.get("id")).toBe("cursor-1");
            expect(await queryAll(db.conn, "SELECT price_amount FROM ps_listing")).toEqual([
                { price_amount: 20 },
            ]);
        } finally {
            spy.mockRestore();
        }
    });
    it("leaves checkpoints to DuckDB's WAL threshold when PS_CHECKPOINT_THRESHOLD is set", async () => {
        vi.stubEnv("PS_CHECKPOINT_THRESHOLD", "64MB");
        const tuned = await openDb(":memory:");
        const spy = vi.spyOn(tuned.conn, "run");
        try {
            expect(
                await queryAll(
                    tuned.conn,
                    "SELECT current_setting('checkpoint_threshold') AS threshold",
                ),
            ).toEqual([{ threshold: "61.0 MiB" }]);
            for (const amount of [10, 20, 30])
                page(
                    [{ ...stash, items: [{ ...item, note: `~price ${amount} divine` }] }],
                    `cursor-${amount}`,
                );
            expect(await ingestPs(tuned.conn, client, { pages: 3 })).toMatchObject({ pages: 3 });
            expect(spy.mock.calls.filter(([sql]) => sql === "CHECKPOINT")).toEqual([]);
        } finally {
            spy.mockRestore();
            await tuned.close();
        }
    });
    it("does not checkpoint after a caught-up page", async () => {
        const spy = vi.spyOn(db.conn, "run");
        try {
            page();
            expect(await ingestPs(db.conn, client, { pages: 3, cursor: "cursor-1" })).toMatchObject(
                { pages: 1, caughtUp: true },
            );
            expect(network).toHaveBeenCalledOnce();
            expect(spy.mock.calls.filter(([sql]) => sql === "CHECKPOINT")).toEqual([]);
        } finally {
            spy.mockRestore();
        }
    });
    it("preserves the checkpointed first page when the next page rolls back", async () => {
        const spy = vi.spyOn(db.conn, "run");
        try {
            page();
            page(
                [
                    { ...stash, items: [{ ...item, note: "~price 20 divine" }] },
                    {
                        ...stash,
                        id: "invalid-stash",
                        items: [{ ...item, id: "invalid", baseType: null }],
                    },
                ],
                "cursor-2",
            );
            await expect(ingestPs(db.conn, client, { pages: 3 })).rejects.toThrow();
            expect(network).toHaveBeenCalledTimes(2);
            expect(spy.mock.calls.filter(([sql]) => sql === "CHECKPOINT")).toHaveLength(1);
            expect(await getCursor(db.conn, "psapi")).toBe("cursor-1");
            expect(await queryAll(db.conn, "SELECT item_id, price_amount FROM ps_listing")).toEqual(
                [{ item_id: "item-1", price_amount: 10 }],
            );
        } finally {
            spy.mockRestore();
        }
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
    it("stores only markets with one of the game's price currencies", async () => {
        network.mockResolvedValueOnce(
            Response.json({
                next_change_id: hour,
                markets: [
                    market,
                    {
                        ...market,
                        market_id:
                            "Metadata/Items/Currency/CurrencyDuplicate|Metadata/Items/Currency/CurrencyAfflictionShardDelirium",
                    },
                ],
            }),
        );
        await ingestCx(db.conn, client, { fromHour: hour - 3600, catchUp: false });
        expect(await queryAll(db.conn, "SELECT market_id FROM cx_market_hour")).toEqual([
            { market_id: market.market_id },
        ]);
    });
    it("captures and delivers every league's exchange whatever the database's season", async () => {
        network.mockResolvedValueOnce(
            Response.json({
                next_change_id: hour,
                markets: [market, { ...market, league: "Hardcore" }],
            }),
        );
        await ingestCx(db.conn, client, { fromHour: hour - 3600, catchUp: false, league: "Keep" });
        const leagues = await queryAll(
            db.conn,
            "SELECT league FROM cx_market_hour ORDER BY league",
        );
        expect(leagues.map((row) => row.league)).toEqual(["Hardcore", "Standard"]);
        const delivered = [];
        network.mockImplementation(async (_url, init) => {
            const body = JSON.parse(String(init?.body));
            delivered.push(...body.rows.map((row) => row.league));
            return receive(body);
        });
        await flushRollups(db.conn, { league: "Keep" });
        expect(delivered.sort()).toEqual(["Hardcore", "Standard"]);
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
            "Metadata/Items/DivinationCards/DivinationCardTheMetalsmithsGift|Metadata/Items/Currency/CurrencyRerollRare";
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
        const progress = vi.fn(async () => {});
        network.mockImplementation(async (_url, init) =>
            Response.json({ written: JSON.parse(init.body).rows.length }),
        );
        const row = { iconAsset: "icon", name: "name", baseType: "base", seenCount: 1 };
        await push(
            { stream: "basemap", rows: Array.from({ length: 1001 }, () => row) },
            { onBatch: progress },
        );
        expect(
            network.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).rows.length),
        ).toEqual([500, 500, 1]);
        expect(progress).toHaveBeenCalledTimes(3);
    });
    it("reports only acknowledged batches when a later upload is incomplete", async () => {
        const progress = vi.fn(async () => {});
        const row = { iconAsset: "icon", name: "name", baseType: "base", seenCount: 1 };
        network.mockResolvedValueOnce(Response.json({ written: 500 }));
        network.mockResolvedValueOnce(Response.json({ written: 0 }));
        await expect(
            push(
                { stream: "basemap", rows: Array.from({ length: 501 }, () => row) },
                { onBatch: progress },
            ),
        ).rejects.toThrow("did not acknowledge the full batch");
        expect(progress).toHaveBeenCalledTimes(1);
    });
    it("does not report remote progress for a dry run", async () => {
        const progress = vi.fn(async () => {});
        const row = { iconAsset: "icon", name: "name", baseType: "base", seenCount: 1 };
        await push({ stream: "basemap", rows: [row] }, { dryRun: true, onBatch: progress });
        expect(network).not.toHaveBeenCalled();
        expect(progress).not.toHaveBeenCalled();
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
        ).toEqual({
            kind: "watchers-eye",
            mods: ["Anger: Gain #% of Physical Damage as Extra Fire Damage"],
        });
    });
    it("records a PoE 2 Loreweave's pooled mods without markup or rolls", () => {
        const signature = extractModSignature({
            ...item,
            name: "Loreweave",
            baseType: "Ornate Ringmail",
            explicitMods: [
                "25% chance to [Intimidate|Intimidate] Enemies for 4 seconds on Hit",
                "+15% of [Armour] also applies to [Chaos|Chaos] Damage",
            ],
        });
        expect(signature).toEqual({
            kind: "loreweave",
            mods: [
                "#% chance to Intimidate Enemies for # seconds on Hit",
                "+#% of Armour also applies to Chaos Damage",
            ],
        });
        expect(signatureValue(signature)).toBe(signature.mods.join(" / "));
    });
    it("leaves PoE 1's fixed-mod Loreweave as one ordinary market", () => {
        expect(
            extractModSignature({
                ...item,
                name: "Loreweave",
                baseType: "Elegant Ringmail",
                explicitMods: [
                    "Has 6 Sockets",
                    "+16 to all Attributes",
                    "Your Maximum Resistances are 78%",
                ],
            }),
        ).toBeNull();
    });
    it("trades every roll of the same Watcher's Eye modifiers as one readable market", () => {
        const eye = (explicitMods) =>
            extractModSignature({ ...item, name: "Watcher's Eye", explicitMods });
        const low = eye([
            "While affected by Haste, 10% increased Movement Speed",
            "Regenerate 1.5% of Energy Shield per Second while affected by Discipline",
        ]);
        const high = eye([
            "While affected by Haste, 15% increased Movement Speed",
            "Regenerate 2% of Energy Shield per Second while affected by Discipline",
        ]);
        expect(high).toEqual(low);
        expect(signatureValue(low)).toBe(
            "Discipline: Regenerate #% of Energy Shield per Second / Haste: #% increased Movement Speed",
        );
        const long = eye(
            ["Anger", "Hatred", "Wrath"].map(
                (aura) =>
                    `While affected by ${aura}, ${"Adds 1 to 2 Damage to Attacks and Spells ".repeat(3)}`,
            ),
        );
        expect(signatureValue(long)).toMatch(/^[0-9a-f]{64}$/);
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
        // The item's market and one per mod.
        await expect(rollupPs(db.conn, { hour })).resolves.toMatchObject({ rows: 4 });
    });
});
