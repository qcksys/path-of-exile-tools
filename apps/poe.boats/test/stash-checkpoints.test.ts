// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve upstream field names.
import { gunzipSync } from "node:zlib";
import { expect, it } from "vite-plus/test";
import {
    compareSampleStashes,
    recordCheckpoint,
    responseHash,
} from "../../../packages/poe-stash-ingest/src/ps/checkpoints";
import {
    openDb,
    queryAll,
    withTransaction,
} from "../../../packages/poe-stash-ingest/src/shared/db";

const page = {
    next_change_id: "next",
    stashes: [{ id: "stash", public: false, stashType: "PremiumStash", items: [] }],
};

it("compares all page contents without depending on JSON object key order", () => {
    expect(responseHash(page)).toBe(
        responseHash({
            stashes: page.stashes.map(({ items, ...stash }) => ({ items, ...stash })),
            next_change_id: "next",
        }),
    );
    expect(responseHash(page)).not.toBe(responseHash({ ...page, stashes: [] }));
    expect(responseHash(page)).not.toBe(responseHash({ ...page, next_change_id: "different" }));
});

it("distinguishes changed stash contents from missing records and changed page boundaries", () => {
    const original = {
        ...page,
        stashes: [
            page.stashes[0]!,
            { ...page.stashes[0]!, id: "changed" },
            { ...page.stashes[0]!, id: "missing" },
        ],
    };
    const fetched = {
        ...page,
        next_change_id: "different",
        stashes: [
            page.stashes[0]!,
            { ...page.stashes[0]!, id: "changed", public: true },
            { ...page.stashes[0]!, id: "added" },
        ],
    };
    expect(compareSampleStashes(original, fetched)).toEqual({
        unchanged: 1,
        changed: 1,
        missing: 1,
        added: 1,
    });
});

it("keeps one lossless compressed sample per UTC day and commits it atomically", async () => {
    const db = await openDb(":memory:");
    const scope = {
        realm: "pc" as const,
        league: "Standard",
        cursor: "start",
        capturedAt: Date.parse("2026-10-01T23:59:58Z"),
    };
    try {
        await expect(
            withTransaction(db.conn, async () => {
                await recordCheckpoint(db.conn, page, scope);
                throw new Error("page failed");
            }),
        ).rejects.toThrow("page failed");
        expect(await queryAll(db.conn, "SELECT * FROM ps_checkpoint")).toEqual([]);
        expect(await queryAll(db.conn, "SELECT * FROM ps_daily_sample")).toEqual([]);
        for (const delta of [0, 1000, 2000])
            await withTransaction(db.conn, () =>
                recordCheckpoint(db.conn, page, { ...scope, capturedAt: scope.capturedAt + delta }),
            );
        const rows = await queryAll<{ payload: string }>(
            db.conn,
            "SELECT payload::VARCHAR AS payload FROM ps_checkpoint ORDER BY captured_at",
        );
        const samples = rows.map(({ payload }) => JSON.parse(payload).responseGzip);
        expect(samples[1]).toBeNull();
        for (const sample of [samples[0], samples[2]])
            expect(JSON.parse(gunzipSync(Buffer.from(sample, "base64")).toString())).toEqual(page);
        expect(await queryAll(db.conn, "SELECT * FROM ps_daily_sample")).toHaveLength(2);
        await recordCheckpoint(db.conn, { next_change_id: "start", stashes: [] }, scope);
        expect(await queryAll(db.conn, "SELECT * FROM ps_checkpoint")).toHaveLength(3);
    } finally {
        await db.close();
    }
});
