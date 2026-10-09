// biome-ignore-all lint/style/useNamingConvention: Fixtures and SQL preserve source field names.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { expect, it, vi } from "vite-plus/test";
import { createClient } from "../../../packages/poe-api-client/src/client";
import {
    archivePage,
    captureArchiveStatus,
} from "../../../packages/poe-stash-ingest/src/ps/capture-archive";
import { defaultCraftingCapture } from "../../../packages/poe-stash-ingest/src/ps/crafting-capture";
import { defaultEquipmentClassifier } from "../../../packages/poe-stash-ingest/src/ps/equipment";
import { ingestPs } from "../../../packages/poe-stash-ingest/src/ps/ingest";
import { getCursor } from "../../../packages/poe-stash-ingest/src/shared/cursor";
import { openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db";
import { prune } from "../../../packages/poe-stash-ingest/src/shared/prune";

vi.mock("../../../packages/poe-stash-ingest/src/shared/auth", () => ({ REALM: undefined }));

const item = {
    id: "unique-item",
    name: "",
    typeLine: "Unknown Base",
    baseType: "Unknown Base",
    verified: true,
    identified: false,
    frameType: 3,
    w: 1,
    h: 1,
    icon: "https://example.invalid/item",
    futureField: { preserve: [1, "unknown", null] },
};
const stash = {
    id: "stash",
    public: true,
    accountName: "seller",
    league: "Standard",
    stashType: "PremiumStash",
    items: [item, { ...item, id: undefined }],
};
const page = {
    next_change_id: "next",
    stashes: [
        stash,
        { ...stash, id: "other-league", league: "Other" },
        { id: "private", public: false, stashType: "PremiumStash", items: [] },
    ],
    futureEnvelopeField: "preserved",
};

it("archives only crafting candidates in the selected league, retaining unpriced items and later versions", async () => {
    const db = await openDb(":memory:");
    const client = createClient({ userAgent: "archive-test", token: "inert" });
    const irrelevant = { ...item, id: "irrelevant", frameType: 0 };
    const upstream = vi.spyOn(client.public, "stashTabs").mockResolvedValue({
        ...page,
        stashes: [{ ...stash, items: [...stash.items, irrelevant] }, ...page.stashes.slice(1)],
    });
    try {
        await ingestPs(db.conn, client, { pages: 1, league: "Standard" });
        const changed = {
            ...page,
            next_change_id: "later",
            stashes: [{ ...stash, items: [{ ...item, note: "~price 50 chaos" }] }],
        };
        upstream.mockResolvedValue(changed);
        await ingestPs(db.conn, client, { pages: 1, league: "Standard" });
        const rows = await queryAll<{ body: string }>(
            db.conn,
            "SELECT to_base64(response_gzip) AS body FROM ps_capture_payload",
        );
        const saved = rows.map(({ body }) =>
            JSON.parse(gunzipSync(Buffer.from(body, "base64")).toString()),
        );
        expect(saved).toEqual(
            expect.arrayContaining([
                JSON.parse(
                    JSON.stringify({ next_change_id: page.next_change_id, stashes: [stash] }),
                ),
                { next_change_id: changed.next_change_id, stashes: changed.stashes },
            ]),
        );
        expect(await captureArchiveStatus(db.conn)).toMatchObject({
            pages: 2,
            payloads: 2,
            unprocessed: 0,
        });
        expect(await queryAll(db.conn, "SELECT * FROM ps_listing")).toHaveLength(1);
        expect(await queryAll(db.conn, "SELECT * FROM ps_equipment_listing")).toEqual([]);
        expect(await getCursor(db.conn, "psapi")).toBe("later");
        const before = await captureArchiveStatus(db.conn);
        await prune(db.conn, { maxRows: 0, keepDays: 1 });
        expect(await captureArchiveStatus(db.conn)).toEqual(before);
    } finally {
        await db.close();
    }
});

it("refuses to advance the cursor or write prices when archiving fails", async () => {
    const db = await openDb(":memory:");
    const client = createClient({ userAgent: "archive-failure-test", token: "inert" });
    vi.spyOn(client.public, "stashTabs").mockResolvedValue(page);
    try {
        await db.conn.run("DROP TABLE ps_capture_payload");
        await expect(ingestPs(db.conn, client, { pages: 1 })).rejects.toThrow("ps_capture_payload");
        expect(await getCursor(db.conn, "psapi")).toBeUndefined();
        expect(await queryAll(db.conn, "SELECT * FROM ps_listing")).toEqual([]);
        expect(await queryAll(db.conn, "SELECT * FROM ps_capture_page")).toEqual([]);
    } finally {
        await db.close();
    }
});

it("persists observations across reopening and deduplicates payloads without losing capture times", async () => {
    const directory = await mkdtemp(join(tmpdir(), "poe-capture-test-"));
    const path = join(directory, "capture.duckdb");
    const scope = { realm: "pc", league: "Standard", cursor: "first", capturedAt: 1000 };
    const accepts = await defaultCraftingCapture((await defaultEquipmentClassifier()).manifest);
    const first = await openDb(path);
    try {
        await archivePage(first.conn, page, scope, accepts);
        await archivePage(first.conn, page, { ...scope, capturedAt: 2000 }, accepts);
        expect(
            await archivePage(first.conn, { next_change_id: "first", stashes: [] }, scope, accepts),
        ).toBeNull();
    } finally {
        await first.close();
    }
    const second = await openDb(path);
    try {
        expect(await captureArchiveStatus(second.conn)).toMatchObject({
            pages: 2,
            payloads: 1,
            unprocessed: 2,
            firstCapturedAt: 1000,
            lastCapturedAt: 2000,
        });
        const [row] = await queryAll<{ body: string }>(
            second.conn,
            "SELECT to_base64(response_gzip) AS body FROM ps_capture_payload",
        );
        expect(JSON.parse(gunzipSync(Buffer.from(row!.body, "base64")).toString())).toEqual(
            JSON.parse(JSON.stringify({ next_change_id: page.next_change_id, stashes: [stash] })),
        );
    } finally {
        await second.close();
        await rm(directory, { recursive: true });
    }
});

it("retains crafting bases and special donors without retaining ordinary low-tier equipment", async () => {
    const accepts = await defaultCraftingCapture((await defaultEquipmentClassifier()).manifest);
    const ordinary = { ...item, frameType: 0, baseType: "Wool Gloves", typeLine: "Wool Gloves" };
    expect(accepts(ordinary)).toBe(false);
    expect(accepts({ ...ordinary, baseType: "Twilight Regalia" })).toBe(true);
    expect(accepts({ ...ordinary, baseType: "Large Cluster Jewel" })).toBe(true);
    expect(accepts({ ...ordinary, baseType: "Cobalt Jewel" })).toBe(true);
    expect(accepts({ ...ordinary, fractured: true })).toBe(true);
    expect(accepts({ ...ordinary, synthesised: true })).toBe(true);
    expect(accepts({ ...ordinary, influences: { shaper: true } })).toBe(true);
    expect(
        accepts({
            ...ordinary,
            frameType: 2,
            explicitMods: [
                { description: "+47% to Fire Resistance" },
                { description: "50 to 77 added Fire Damage against Burning Enemies" },
            ],
        }),
    ).toBe(true);
    expect(accepts({ ...ordinary, explicitMods: ["+10 to maximum Life"] })).toBe(false);
    expect(
        accepts({
            ...ordinary,
            explicitMods: [
                "+90% to Fire Resistance",
                "60 to 94 added Fire Damage against Burning Enemies",
            ],
        }),
    ).toBe(true);
    expect(
        accepts({
            ...ordinary,
            explicitMods: [{ description: "new modifier", flags: { desecrated: true } }],
        }),
    ).toBe(true);
    expect(accepts({ ...ordinary, baseType: "Chaos Orb", frameType: 5 })).toBe(true);
    expect(accepts({ ...ordinary, baseType: "Essence of Horror", rarity: "Currency" })).toBe(true);
    expect(accepts({ ...ordinary, baseType: "A Divination Card", frameType: 6 })).toBe(true);
    expect(accepts({ ...ordinary, baseType: "Fireball", frameType: 4 })).toBe(false);
    expect(accepts({ ...ordinary, baseType: "Unknown Base" })).toBe(false);
    expect(accepts(item)).toBe(true);
});

it("preserves relevant empty/private stash changes and skips unrelated pages", async () => {
    const db = await openDb(":memory:");
    const accepts = await defaultCraftingCapture((await defaultEquipmentClassifier()).manifest);
    const scope = { realm: "pc", league: "Standard", capturedAt: 1000 };
    try {
        await archivePage(db.conn, page, scope, accepts);
        const empty = { next_change_id: "empty", stashes: [{ ...stash, items: [] }] };
        expect(await archivePage(db.conn, empty, scope, accepts)).not.toBeNull();
        expect(await archivePage(db.conn, empty, scope, accepts)).toBeNull();
        await archivePage(db.conn, page, scope, accepts);
        const privatePage = {
            next_change_id: "private",
            stashes: [{ id: stash.id, public: false, items: [], stashType: "PremiumStash" }],
        };
        expect(await archivePage(db.conn, privatePage, scope, accepts)).not.toBeNull();
        expect(
            await archivePage(
                db.conn,
                {
                    next_change_id: "unrelated",
                    stashes: [{ ...stash, items: [{ ...item, frameType: 0 }] }],
                },
                scope,
                accepts,
            ),
        ).toBeNull();
        expect(await captureArchiveStatus(db.conn)).toMatchObject({ pages: 4, payloads: 3 });
        const rows = await queryAll<{ body: string }>(
            db.conn,
            "SELECT to_base64(response_gzip) AS body FROM ps_capture_payload",
        );
        const saved = rows.map(({ body }) =>
            JSON.parse(gunzipSync(Buffer.from(body, "base64")).toString()),
        );
        expect(saved).toEqual(expect.arrayContaining([empty, privatePage]));
    } finally {
        await db.close();
    }
});
