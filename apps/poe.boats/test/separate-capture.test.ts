// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve upstream field names.
import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { createClient, type PoeApiClient } from "../../../packages/poe-api-client/src/client";
import { flushRollups } from "../../../packages/poe-stash-ingest/src/pipeline";
import {
    openCaptureSource,
    readCaptureState,
    runCapture,
    writeCaptureState,
} from "../../../packages/poe-stash-ingest/src/ps/capture";
import { ingestPs } from "../../../packages/poe-stash-ingest/src/ps/ingest";
import {
    appendRawPage,
    RawPageReader,
    replayRawArchive,
    sealRawHours,
} from "../../../packages/poe-stash-ingest/src/ps/raw-archive";
import { getCursor, setCursor } from "../../../packages/poe-stash-ingest/src/shared/cursor";
import { openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db";

vi.mock("../../../packages/poe-stash-ingest/src/shared/auth", () => ({ REALM: undefined }));

const at = (h: number, minute = 0) => Date.UTC(2026, 9, 28, h, minute);
type Page = Parameters<typeof appendRawPage>[1]["page"];
const item = (id: string) => ({
    id,
    verified: true,
    w: 2,
    h: 1,
    icon: "https://example.invalid/fixture.png",
    name: "Headhunter",
    typeLine: "Leather Belt",
    baseType: "Leather Belt",
    frameType: 3,
    identified: true,
    ilvl: 86,
    note: "~price 10 divine",
});
const page = (next: string, ...items: string[]) =>
    ({
        next_change_id: next,
        stashes: [
            {
                id: "stash",
                public: true,
                accountName: "seller",
                league: "Standard",
                stashType: "TradeStash",
                items: items.map(item),
            },
        ],
    }) as unknown as Page;
const empty = (next: string) => ({ next_change_id: next, stashes: [] }) as unknown as Page;

const inertClient = () => createClient({ userAgent: "capture-test", token: "inert" });

let dir: string;
beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "separate-capture-"));
});
afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

const seeded = (position = { hour: "", offset: 0, capturedAt: 0 }) =>
    new RawPageReader(dir, position);

async function readAll(reader: RawPageReader) {
    const cursors: (string | null)[] = [];
    for (;;) {
        const record = await reader.peek();
        if (!record) return cursors;
        cursors.push(record.cursor);
        reader.advance();
    }
}

it("reads pages in order across sealed and spooled hours, and follows new ones", async () => {
    await appendRawPage(dir, { capturedAt: at(10, 1), page: page("a") });
    await appendRawPage(dir, { capturedAt: at(10, 2), cursor: "a", page: page("b") });
    await appendRawPage(dir, { capturedAt: at(11, 1), cursor: "b", page: page("c") });
    await sealRawHours(dir, at(11, 30));

    const reader = seeded();
    expect(await readAll(reader)).toEqual([null, "a", "b"]);

    await appendRawPage(dir, { capturedAt: at(11, 2), cursor: "c", page: page("d") });
    await appendRawPage(dir, { capturedAt: at(12, 1), cursor: "d", page: page("e") });
    expect(await readAll(reader)).toEqual(["c", "d"]);
    expect(reader.position).toMatchObject({ hour: "2026-10-28T12", capturedAt: at(12, 1) });
});

it("returns a page until it is advanced, and resumes from a saved position", async () => {
    await appendRawPage(dir, { capturedAt: at(10, 1), page: page("a") });
    await appendRawPage(dir, { capturedAt: at(10, 2), cursor: "a", page: page("b") });

    const reader = seeded();
    const first = await reader.peek();
    expect((await reader.peek())?.cursor).toBe(first?.cursor);
    reader.advance();
    const saved = reader.position;

    // The same byte position works once the hour is sealed.
    await sealRawHours(dir, at(11));
    expect(await readAll(new RawPageReader(dir, saved))).toEqual(["a"]);
});

it("does not read a line capture has not finished", async () => {
    await appendRawPage(dir, { capturedAt: at(10, 1), page: page("a") });
    await appendFile(join(dir, "spool", "2026-10-28T10.ndjson"), '{"capturedAt":1,"curs');
    const reader = seeded();
    expect(await readAll(reader)).toEqual([null]);
});

it("reads the pages capture added to an hour before it started the next", async () => {
    await appendRawPage(dir, { capturedAt: at(10, 1), page: page("a") });
    const reader = seeded();
    expect(await readAll(reader)).toEqual([null]);
    await appendRawPage(dir, { capturedAt: at(10, 59), cursor: "a", page: page("b") });
    await appendRawPage(dir, { capturedAt: at(11, 1), cursor: "b", page: page("c") });
    expect(await readAll(reader)).toEqual(["a", "b"]);
});

it("hands the database's cursor to capture, starting after what is already archived", async () => {
    await appendRawPage(dir, { capturedAt: at(10, 1), page: page("old") });
    const db = await openDb(":memory:");
    try {
        await setCursor(db.conn, "psapi", "saved");
        const reader = await openCaptureSource(db.conn, dir);
        expect(await readCaptureState(dir)).toEqual({ cursor: "saved" });
        expect(await reader.peek()).toBeNull();

        // Capture's progress is not overwritten, and the position survives a restart.
        await writeCaptureState(dir, { cursor: "newer" });
        await appendRawPage(dir, { capturedAt: at(10, 2), cursor: "newer", page: page("next") });
        const reopened = await openCaptureSource(db.conn, dir);
        expect(await readCaptureState(dir)).toEqual({ cursor: "newer" });
        expect(await readAll(reopened)).toEqual(["newer"]);
    } finally {
        await db.close();
    }
});

it("stores pages at their capture times, even when read much later", async () => {
    await appendRawPage(dir, { capturedAt: at(10, 5), page: page("a", "kept", "sold") });
    await appendRawPage(dir, { capturedAt: at(11, 5), cursor: "a", page: page("b", "kept") });
    const db = await openDb(":memory:");
    try {
        const spool = seeded();
        const result = await ingestPs(db.conn, inertClient(), { pages: 10, spool });
        expect(result).toMatchObject({ pages: 2, drained: true, caughtUp: false });

        const seen = (time: string) => `strftime(${time}, '%Y-%m-%dT%H:%M')`;
        expect(
            await queryAll(
                db.conn,
                `SELECT item_id AS id, ${seen("first_seen_at")} AS first, ${seen("last_seen_at")} AS last,
                    ${seen("removed_at")} AS removed FROM ps_listing ORDER BY item_id`,
            ),
        ).toEqual([
            { id: "kept", first: "2026-10-28T10:05", last: "2026-10-28T11:05", removed: null },
            {
                id: "sold",
                first: "2026-10-28T10:05",
                last: "2026-10-28T10:05",
                removed: "2026-10-28T11:05",
            },
        ]);
        const hours = await queryAll<{ hour: number; n: number }>(
            db.conn,
            `SELECT observed_hour::DOUBLE AS hour, count(*)::DOUBLE AS n FROM ps_listing_hour
            GROUP BY observed_hour ORDER BY observed_hour`,
        );
        expect(hours).toEqual([
            { hour: at(10) / 1000, n: 2 },
            { hour: at(11) / 1000, n: 1 },
        ]);
        // `updated_at` is the real time: delivery compares it with when an hour was pushed.
        const [sale] = await queryAll<{ removed: string; status: string; touchedNow: boolean }>(
            db.conn,
            `SELECT ${seen("removed_at")} AS removed, status,
                updated_at >= current_timestamp::TIMESTAMP - INTERVAL 1 HOUR AS "touchedNow"
            FROM ps_sale`,
        );
        expect(sale).toEqual({
            removed: "2026-10-28T11:05",
            status: "unobserved",
            touchedNow: true,
        });
    } finally {
        await db.close();
    }
});

it("holds back a stash hour until a later hour's page has been read", async () => {
    await appendRawPage(dir, { capturedAt: at(10, 5), page: page("a", "one") });
    await appendRawPage(dir, { capturedAt: at(11, 5), cursor: "a", page: page("b", "one") });
    const db = await openDb(":memory:");
    try {
        const spool = seeded();
        const stashBeforeHour = () => Math.floor(spool.position.capturedAt / 3_600_000) * 3600;
        const log = vi.spyOn(console, "log").mockImplementation(() => {});

        await ingestPs(db.conn, inertClient(), { pages: 1, spool });
        const partial = await flushRollups(db.conn, {
            dryRun: true,
            stashBeforeHour: stashBeforeHour(),
        });
        expect(partial.hours).toBe(0);

        await ingestPs(db.conn, inertClient(), { pages: 1, spool });
        const whole = await flushRollups(db.conn, {
            dryRun: true,
            stashBeforeHour: stashBeforeHour(),
        });
        log.mockRestore();
        // The 10:00 hour's market row; 11:00 still waits for a later page.
        expect(whole).toMatchObject({ hours: 1, rows: 1 });
    } finally {
        await db.close();
    }
});

it("judges sales by the capture clock, so falling behind does not make them unobserved", async () => {
    await appendRawPage(dir, { capturedAt: at(10, 0), page: page("a", "kept", "sold") });
    await appendRawPage(dir, { capturedAt: at(10, 1), cursor: "a", page: empty("a") });
    const db = await openDb(":memory:");
    try {
        const spool = seeded();
        await ingestPs(db.conn, inertClient(), { pages: 10, spool });
        await appendRawPage(dir, { capturedAt: at(10, 2), cursor: "a", page: page("b", "kept") });
        const result = await ingestPs(db.conn, inertClient(), { pages: 10, spool });
        expect(result.caughtUp).toBe(false);
        const [sale] = await queryAll<{ status: string }>(db.conn, "SELECT status FROM ps_sale");
        expect(sale?.status).toBe("pending");
    } finally {
        await db.close();
    }
});

it("does not move past a page that fails, and leaves the position unchanged", async () => {
    await appendRawPage(dir, { capturedAt: at(10, 1), page: page("a", "one") });
    const db = await openDb(":memory:");
    try {
        const spool = seeded();
        const applied = vi.spyOn(db.conn, "run");
        applied.mockRejectedValueOnce(new Error("disk full"));
        await expect(ingestPs(db.conn, inertClient(), { pages: 1, spool })).rejects.toThrow();
        applied.mockRestore();
        expect(spool.position.offset).toBe(0);

        await ingestPs(db.conn, inertClient(), { pages: 1, spool });
        expect(spool.position.offset).toBeGreaterThan(0);
        expect(JSON.parse((await getCursor(db.conn, "psapi-raw")) ?? "{}")).toEqual(spool.position);
        expect(await getCursor(db.conn, "psapi")).toBe("a");
    } finally {
        await db.close();
    }
});

function capture(responses: (Page | Error)[], options: { onStatus?: () => Promise<void> } = {}) {
    const stop = new AbortController();
    const requested: (string | undefined)[] = [];
    const client = {
        public: {
            stashTabs: async (request: { id?: string }) => {
                requested.push(request.id);
                const next = responses.shift();
                if (!responses.length) stop.abort();
                if (next instanceof Error) throw next;
                return next ?? empty("end");
            },
        },
    } as unknown as PoeApiClient;
    return {
        requested,
        done: runCapture(client, {
            archive: { dir },
            signal: stop.signal,
            onStatus: options.onStatus,
            requestSpacingMs: 1,
            headPollMs: 1,
            errorDelayMs: 1,
            maintain: async () => ({ sealed: [], uploaded: 0 }),
        }),
    };
}

async function archivedCursors() {
    await sealRawHours(dir, Date.now() + 7_200_000);
    const cursors = [];
    for await (const record of replayRawArchive(dir)) cursors.push(record.cursor);
    return cursors;
}

it("waits for its state, then archives pages and saves its cursor without a database", async () => {
    const run = capture([page("b"), page("c")]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(run.requested).toEqual([]);
    await writeCaptureState(dir, { cursor: "a" });
    await run.done;
    expect(run.requested).toEqual(["a", "b"]);
    expect(await readCaptureState(dir)).toEqual({ cursor: "c" });
    expect(await archivedCursors()).toEqual(["a", "b"]);
});

it("retries the same cursor after a failed fetch and keeps going", async () => {
    await writeCaptureState(dir, { cursor: "a" });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const run = capture([new Error("Bad gateway"), page("b")]);
    await run.done;
    log.mockRestore();
    expect(run.requested).toEqual(["a", "a"]);
    expect(await readCaptureState(dir)).toEqual({ cursor: "b" });
});

it("keeps capturing when status reports fail", async () => {
    await writeCaptureState(dir, { cursor: "a" });
    const run = capture([page("b"), page("c")], {
        onStatus: async () => {
            throw new Error("Receiver down");
        },
    });
    await run.done;
    expect(await readCaptureState(dir)).toEqual({ cursor: "c" });
});
