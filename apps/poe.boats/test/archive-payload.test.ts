// biome-ignore-all lint/style/useNamingConvention: Preserve upstream and SQL fields in fixtures.
import { randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { readArchivedPage } from "../../../packages/poe-stash-ingest/src/ps/archive-payload";
import {
    archivePage,
    captureArchiveStatus,
} from "../../../packages/poe-stash-ingest/src/ps/capture-archive";
import { responseHash } from "../../../packages/poe-stash-ingest/src/ps/checkpoints";
import { type DbHandle, openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db";

let db: DbHandle;
beforeEach(async () => {
    db = await openDb(":memory:");
});
afterEach(async () => {
    await db.close();
});
const scope = { realm: "pc", league: "Standard", capturedAt: 1000 };
const page = (note: string) => ({
    next_change_id: "next",
    stashes: [
        {
            id: "stash",
            public: true,
            league: "Standard",
            stashType: "PremiumStash",
            items: [
                {
                    id: "item",
                    name: "",
                    typeLine: "Plate Vest",
                    baseType: "Plate Vest",
                    verified: true,
                    identified: true,
                    frameType: 0,
                    w: 2,
                    h: 3,
                    icon: "",
                    note,
                },
            ],
        },
    ],
});

it("stores bounded parts atomically and deduplicates mixed legacy and chunked payloads", async () => {
    const legacy = page("legacy");
    const json = JSON.stringify(legacy);
    const compressed = gzipSync(json);
    await db.conn.run("INSERT INTO ps_capture_payload VALUES ($1, from_base64($2), $3)", [
        responseHash(legacy),
        compressed.toString("base64"),
        Buffer.byteLength(json),
    ]);
    await archivePage(db.conn, legacy, scope, () => true);
    const current = page(randomBytes(100_000).toString("base64"));
    await archivePage(db.conn, current, scope, () => true);
    await archivePage(db.conn, current, { ...scope, capturedAt: 2000 }, () => true);
    expect(await readArchivedPage(db.conn, responseHash(current))).toEqual(current);
    expect(await readArchivedPage(db.conn, responseHash(legacy))).toEqual(legacy);
    expect(
        await queryAll(db.conn, "SELECT count(*)::INTEGER AS count FROM ps_capture_payload"),
    ).toEqual([{ count: 1 }]);
    const [meta] = await queryAll<{ bytes: number; chunks: number }>(
        db.conn,
        "SELECT compressed_bytes::DOUBLE AS bytes, chunk_count AS chunks FROM ps_capture_payload_meta",
    );
    const parts = await queryAll<{ index: number; bytes: number }>(
        db.conn,
        "SELECT chunk_index AS index, octet_length(response_gzip)::INTEGER AS bytes FROM ps_capture_payload_chunk ORDER BY chunk_index",
    );
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.map((part) => part.index)).toEqual(
        Array.from({ length: meta!.chunks }, (_, index) => index),
    );
    expect(parts.every((part) => part.bytes <= 16 * 1024)).toBe(true);
    expect(parts.reduce((sum, part) => sum + part.bytes, 0)).toBe(meta!.bytes);
    expect(await captureArchiveStatus(db.conn)).toMatchObject({
        pages: 3,
        payloads: 2,
        compressedBytes: compressed.length + meta!.bytes,
        originalBytes: Buffer.byteLength(json) + Buffer.byteLength(JSON.stringify(current)),
    });
});

it("rolls back metadata, earlier chunks, page and tracking rows when a later chunk fails", async () => {
    const run = db.conn.run.bind(db.conn);
    let chunks = 0;
    const fault = vi.spyOn(db.conn, "run").mockImplementation((sql, ...args) => {
        if (sql.startsWith("INSERT INTO ps_capture_payload_chunk") && ++chunks === 2)
            return Promise.reject(new Error("fixture chunk failure"));
        return run(sql, ...args);
    });
    try {
        await expect(
            archivePage(db.conn, page(randomBytes(50_000).toString("base64")), scope, () => true),
        ).rejects.toThrow("fixture chunk failure");
    } finally {
        fault.mockRestore();
    }
    expect(chunks).toBe(2);
    for (const table of [
        "ps_capture_payload_meta",
        "ps_capture_payload_chunk",
        "ps_capture_page",
        "ps_capture_stash",
    ])
        expect(await queryAll(db.conn, `SELECT * FROM ${table}`)).toEqual([]);
});
