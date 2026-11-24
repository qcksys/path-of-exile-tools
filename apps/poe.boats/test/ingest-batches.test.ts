// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve the public-stash wire format.
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type {
    PublicStashChange,
    PublicStashPage,
} from "../../../packages/poe-api-client/src/types";
import {
    captureEquipmentPage,
    defaultEquipmentClassifier,
} from "../../../packages/poe-stash-ingest/src/ps/equipment";
import {
    holdsTooManyUpdates,
    ingestPs,
    settingBytes,
} from "../../../packages/poe-stash-ingest/src/ps/ingest";
import { ListingBatch } from "../../../packages/poe-stash-ingest/src/ps/listing-batch";
import { loadListingState, NONE } from "../../../packages/poe-stash-ingest/src/ps/listing-state";
import {
    equipmentState,
    listingState,
    reconcileEquipmentState,
    reconcileListingState,
} from "../../../packages/poe-stash-ingest/src/ps/listing-state-cache";
import {
    appendRawPage,
    RawPageReader,
} from "../../../packages/poe-stash-ingest/src/ps/raw-archive";
import { type DbHandle, openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db";
import { Laps } from "../../../packages/poe-stash-ingest/src/shared/laps";

type DuckDBConnection = DbHandle["conn"];

const failure = vi.hoisted(() => ({ onCheckpoint: 0, calls: 0 }));
vi.mock("../../../packages/poe-stash-ingest/src/shared/auth", () => ({ REALM: undefined }));
vi.mock("../../../packages/poe-stash-ingest/src/ps/checkpoints", async (importOriginal) => {
    const original =
        await importOriginal<
            typeof import("../../../packages/poe-stash-ingest/src/ps/checkpoints")
        >();
    return {
        ...original,
        recordCheckpoint: async (...args: Parameters<typeof original.recordCheckpoint>) => {
            if (++failure.calls === failure.onCheckpoint) throw new Error("checkpoint failed");
            return original.recordCheckpoint(...args);
        },
    };
});

type Item = PublicStashChange["items"][number];
const unique = (id: string, note: string) =>
    ({
        id,
        verified: true,
        w: 1,
        h: 1,
        icon: "",
        name: "Headhunter",
        typeLine: "Leather Belt",
        baseType: "Leather Belt",
        identified: true,
        rarity: "Unique",
        frameType: 3,
        note,
    }) as Item;
const stash = (id: string, account: string, items: Item[]) =>
    ({
        id,
        public: true,
        accountName: account,
        league: "Standard",
        stash: "Sales",
        stashType: "TradeStash",
        items,
    }) as PublicStashChange;

// Twelve pages, eight minutes apart, across an hour: listings come, change price and go.
const START = Date.UTC(2026, 10, 10, 10, 20);
const PAGES = Array.from({ length: 12 }, (_, n) => ({
    capturedAt: START + n * 8 * 60_000,
    stashes: ["a", "b", "c", "d"].map((account, s) =>
        stash(
            `stash-${s}`,
            account,
            Array.from({ length: 3 }, (_, i) => i)
                .filter((i) => (n + s + i) % 4 !== 0)
                .map((i) => unique(`item-${s}-${i}`, `~price ${5 + ((n + i) % 3)} chaos`)),
        ),
    ),
}));

let dir: string;
beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ingest-batches-"));
    for (const [n, page] of PAGES.entries())
        await appendRawPage(dir, {
            capturedAt: page.capturedAt,
            cursor: `page-${n}`,
            page: { next_change_id: `page-${n + 1}`, stashes: page.stashes } as PublicStashPage,
        });
    failure.onCheckpoint = 0;
    failure.calls = 0;
});
afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
});

const reader = () =>
    new RawPageReader(dir, {
        hour: new Date(START).toISOString().slice(0, 13),
        offset: 0,
        capturedAt: 0,
    });

async function snapshot(conn: DuckDBConnection) {
    const read = async (sql: string) => (await conn.runAndReadAll(sql)).getRowObjectsJson();
    return {
        listings: await read(
            "SELECT * EXCLUDE (listing_id) FROM ps_listing ORDER BY account_name, stash_id, item_id",
        ),
        hours: await read(
            "SELECT * FROM ps_listing_hour ORDER BY observed_hour, account_name, stash_id, item_id",
        ),
        sales: await read(
            "SELECT * EXCLUDE (updated_at) FROM ps_sale ORDER BY removed_at, item_id",
        ),
        checkpoints: await read(
            "SELECT payload->>'cursor' AS cursor FROM ps_checkpoint ORDER BY captured_at",
        ),
        cursors: await read(
            "SELECT stream_name, cursor FROM stream_cursor WHERE stream_name LIKE 'psapi%' ORDER BY 1",
        ),
    };
}

async function ingest(batchPages: number, source = reader()) {
    vi.stubEnv("PS_BATCH_PAGES", String(batchPages));
    const db = await openDb(":memory:");
    const result = await ingestPs(db.conn, {} as never, {
        pages: 20,
        league: "Standard",
        spool: source,
    });
    return { db, result };
}

it("writes the same tables in batches of pages as one page at a time", async () => {
    const single = await ingest(1);
    const flush = vi.spyOn(ListingBatch.prototype, "flush");
    const batched = await ingest(4);
    try {
        expect(batched.result.pages).toBe(12);
        // Four-page batches, cut at 11:00: pages 1–4, 5 (10:52), 6–9 and 10–12.
        expect(flush).toHaveBeenCalledTimes(4);
        const expected = await snapshot(single.db.conn);
        expect(await snapshot(batched.db.conn)).toEqual(expected);
        expect(expected.sales.length).toBeGreaterThan(0);
        expect(
            new Set(expected.hours.map((row: Record<string, unknown>) => row.observed_hour)).size,
        ).toBe(2);
        // A batch's temporary tables hold their rows in memory, so none outlives its flush.
        expect(
            await queryAll(
                batched.db.conn,
                "SELECT table_name FROM duckdb_tables() WHERE temporary",
            ),
        ).toEqual([]);
    } finally {
        await single.db.close();
        await batched.db.close();
    }
});

it("updates a listing in place when identifying it changes its item key", async () => {
    const pagesDir = await mkdtemp(join(tmpdir(), "ingest-rekey-"));
    try {
        // An unidentified unique is keyed by its base type, then by its name once identified.
        const seen = [
            { ...unique("rekeyed", "~price 5 chaos"), name: "", identified: false } as Item,
            unique("rekeyed", "~price 6 chaos"),
        ];
        for (const [n, item] of seen.entries())
            await appendRawPage(pagesDir, {
                capturedAt: START + n * 60_000,
                cursor: `rekey-${n}`,
                page: {
                    next_change_id: `rekey-${n + 1}`,
                    stashes: [stash("stash-r", "r", [item])],
                } as PublicStashPage,
            });
        vi.stubEnv("PS_BATCH_PAGES", "1");
        const db = await openDb(":memory:");
        try {
            const source = new RawPageReader(pagesDir, {
                hour: new Date(START).toISOString().slice(0, 13),
                offset: 0,
                capturedAt: 0,
            });
            const listing = () =>
                queryAll<{ row: string; key: string }>(
                    db.conn,
                    "SELECT rowid::VARCHAR AS row, item_key AS key FROM ps_listing WHERE item_id = 'rekeyed'",
                );
            await ingestPs(db.conn, {} as never, { pages: 1, league: "Standard", spool: source });
            const [before] = await listing();
            expect(before?.key).toBe("unid:Leather Belt");
            await ingestPs(db.conn, {} as never, { pages: 1, league: "Standard", spool: source });
            // A rewritten row would get a new row ID, and could collide with its own key.
            expect(await listing()).toEqual([{ row: before!.row, key: "Headhunter" }]);
            expect(
                await queryAll(
                    db.conn,
                    "SELECT index_name FROM duckdb_indexes() WHERE table_name = 'ps_listing'",
                ),
            ).toEqual([]);
        } finally {
            await db.close();
        }
    } finally {
        await rm(pagesDir, { recursive: true, force: true });
    }
});

it("checkpoints once held updates pass a quarter of DuckDB's memory limit", () => {
    expect(settingBytes("7.4 GiB")).toBeCloseTo(7.4 * 1024 ** 3);
    expect(settingBytes("953.6 MiB")).toBeCloseTo(953.6 * 1024 ** 2);
    expect(settingBytes("0 bytes")).toBe(0);
    expect(settingBytes("unlimited")).toBeUndefined();
    expect(holdsTooManyUpdates(1.8 * 1024 ** 3, "7.4 GiB")).toBe(false);
    expect(holdsTooManyUpdates(1.9 * 1024 ** 3, "7.4 GiB")).toBe(true);
    expect(holdsTooManyUpdates(1.9 * 1024 ** 3, "unlimited")).toBe(false);
});

it("checks held updates after each commit when checkpoints are left to the WAL", async () => {
    vi.stubEnv("PS_CHECKPOINT_THRESHOLD", "4GB");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, result } = await ingest(4);
    try {
        expect(result.pages).toBe(12);
        // A few test pages hold far less than a quarter of the limit.
        expect(log.mock.calls.some(([line]) => String(line).startsWith("checkpointed "))).toBe(
            false,
        );
        expect(error).not.toHaveBeenCalled();
    } finally {
        await db.close();
    }
});

it("logs how long each part of every batch's write took, and DuckDB's memory after it", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { db } = await ingest(4);
    try {
        const writes = log.mock.calls
            .map(([line]) => String(line))
            .filter((line) => line.startsWith("batch write of "));
        // The four batches above: pages 1–4, 5, 6–9 and 10–12.
        expect(writes.map((line) => line.split(" ")[3])).toEqual(["4", "1", "4", "3"]);
        const n = "[\\d.]+";
        expect(writes[0]).toMatch(
            new RegExp(
                `^batch write of 4 pages: listings ${n} s \\(withdrawn ${n}, sales ${n}, seen ${n}, changed ${n}, new ${n}, keys ${n}, hours read ${n}, hours updated ${n}, hours inserted ${n}, basemap ${n}\\), equipment ${n} s \\(cohorts ${n}, seen ${n}, changed ${n}, new ${n}, keys ${n}, hours ${n}, other ${n}\\), ${n} s \\(commit ${n}\\); DuckDB memory ${n} of ${n} [KMG]iB: (nothing above 0.05 GiB|[A-Z_]+ ${n}(, [a-zA-Z_]+ ${n})*)$`,
            ),
        );
    } finally {
        await db.close();
    }
});

it("adds up the time of a section reached more than once", () => {
    const laps = new Laps();
    laps.lap("sales");
    laps.lap("hours");
    laps.lap("sales");
    expect(String(laps)).toMatch(/^[\d.]+ s \(sales [\d.]+, hours [\d.]+\)$/);
});

it("rolls back a failed batch whole, and reads its pages again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const clean = await ingest(1);
    const source = reader();
    // The third page of the first batch fails after its listings were applied in memory.
    failure.calls = 0;
    failure.onCheckpoint = 3;
    vi.stubEnv("PS_BATCH_PAGES", "5");
    const db = await openDb(":memory:");
    try {
        await expect(
            ingestPs(db.conn, {} as never, { pages: 20, league: "Standard", spool: source }),
        ).rejects.toThrow("checkpoint failed");
        expect(await queryAll(db.conn, "SELECT * FROM ps_listing")).toEqual([]);
        expect(await queryAll(db.conn, "SELECT * FROM ps_checkpoint")).toEqual([]);
        expect(source.position.offset).toBe(0);

        const retried = await ingestPs(db.conn, {} as never, {
            pages: 20,
            league: "Standard",
            spool: source,
        });
        expect(retried.pages).toBe(12);
        expect(await snapshot(db.conn)).toEqual(await snapshot(clean.db.conn));
    } finally {
        await db.close();
        await clean.db.close();
    }
});

it("forgets removed listings archiving moved out, so one listed again is inserted", async () => {
    const { db } = await ingest(1);
    try {
        const state = await listingState(db.conn);
        const [removed] = await queryAll<{
            stash_id: string;
            account_name: string;
            item_id: string;
        }>(
            db.conn,
            "SELECT stash_id, account_name, item_id FROM ps_listing WHERE removed_at IS NOT NULL LIMIT 1",
        );
        expect(removed).toBeDefined();
        await db.conn.run("DELETE FROM ps_listing WHERE removed_at IS NOT NULL");
        await reconcileListingState(db.conn);
        expect(state.find(removed!.stash_id, removed!.account_name, removed!.item_id)).toBe(NONE);
        // Reconciled, the cached state matches the table and is kept.
        expect(await listingState(db.conn)).toBe(state);
        expect(state.size).toBe((await loadListingState(db.conn)).size);
    } finally {
        await db.close();
    }
});

it("forgets equipment rows archiving moved out", async () => {
    const classifier = await defaultEquipmentClassifier();
    const rare = (id: string) =>
        ({
            id,
            verified: true,
            w: 2,
            h: 2,
            icon: "",
            name: "Doom Shell",
            typeLine: "Plate Vest",
            baseType: "Plate Vest",
            ilvl: 84,
            identified: true,
            frameType: 2,
            explicitMods: ["+80 to maximum Life", "+40% to Fire Resistance"],
            note: "~price 5 chaos",
        }) as Item;
    const db = await openDb(":memory:");
    try {
        const at = new Date(START);
        await captureEquipmentPage(
            db.conn,
            [stash("vests", "a", [rare("kept"), rare("sold")])],
            classifier,
            at,
        );
        await captureEquipmentPage(db.conn, [stash("vests", "a", [rare("kept")])], classifier, at);
        const state = await equipmentState(db.conn);
        expect(state.find("a", "sold")).not.toBe(NONE);
        await db.conn.run("DELETE FROM ps_equipment_listing WHERE removed_at IS NOT NULL");
        await reconcileEquipmentState(db.conn);
        expect(state.find("a", "sold")).toBe(NONE);
        expect(state.find("a", "kept")).not.toBe(NONE);
        expect(await equipmentState(db.conn)).toBe(state);
    } finally {
        await db.close();
    }
}, 60_000);

it("loads under Node's type stripping, as the worker runs it", () => {
    // Tests compile TypeScript fully; the worker image runs the sources as they are, so syntax
    // that needs compiling (parameter properties, enums) would only fail in production.
    const sources = ["listing-batch.ts", "listing-state-cache.ts", "equipment-batch.ts"].map(
        (file) =>
            new URL(`../../../packages/poe-stash-ingest/src/ps/${file}`, import.meta.url).href,
    );
    const script = sources.map((url) => `await import(${JSON.stringify(url)});`).join("");
    expect(
        execFileSync(
            process.execPath,
            ["--input-type=module", "-e", `${script}console.log("ok")`],
            {
                encoding: "utf8",
            },
        ).trim(),
    ).toBe("ok");
});
