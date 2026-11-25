// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve upstream field names.
import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { createClient, type PoeApiClient } from "../../../packages/poe-api-client/src/client";
import type { RateLimitInfo, RateLimitRule } from "../../../packages/poe-api-client/src/rate-limit";
import { flushRollups } from "../../../packages/poe-stash-ingest/src/pipeline";
import {
    openCaptureSource,
    rateLimitSpacingMs,
    readCaptureState,
    runCapture,
    writeCaptureState,
} from "../../../packages/poe-stash-ingest/src/ps/capture";
import { HEAD_PAGE_BYTES, ingestPs } from "../../../packages/poe-stash-ingest/src/ps/ingest";
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

// The seller's stash and three other sellers of the same item at the same price.
const market = (next: string, ...items: string[]) => {
    const listed = page(next, ...items);
    const peers = ["peer-1", "peer-2", "peer-3"].map((peer) => ({
        ...listed.stashes[0],
        id: `${peer}-stash`,
        accountName: peer,
        items: [item(peer)],
    }));
    return { ...listed, stashes: [...listed.stashes, ...peers] } as unknown as Page;
};
// A page the API cut off at its size limit: capture was behind the stream's head.
const cutOff = (listed: Page) =>
    ({ ...listed, padding: "x".repeat(HEAD_PAGE_BYTES) }) as unknown as Page;

async function saleAfterBusyStream(wrap: (listed: Page) => Page) {
    // Every request finds new changes, so no page echoes its cursor.
    await appendRawPage(dir, {
        capturedAt: at(10, 0),
        cursor: "z",
        page: wrap(market("a", "kept", "sold")),
    });
    const db = await openDb(":memory:");
    try {
        const spool = seeded();
        await ingestPs(db.conn, inertClient(), { pages: 10, spool });
        await appendRawPage(dir, {
            capturedAt: at(10, 1),
            cursor: "a",
            page: wrap(page("b", "kept")),
        });
        await appendRawPage(dir, {
            capturedAt: at(11, 2),
            cursor: "b",
            page: wrap(page("c", "kept")),
        });
        const result = await ingestPs(db.conn, inertClient(), { pages: 10, spool });
        expect(result.caughtUp).toBe(false);
        const [sale] = await queryAll<{ status: string }>(db.conn, "SELECT status FROM ps_sale");
        return sale?.status;
    } finally {
        await db.close();
    }
}

it("judges sales while capture keeps up with a stream that never echoes its cursor", async () => {
    expect(await saleAfterBusyStream((listed) => listed)).toBe("likely-sold");
});

it("does not count a page the API cut off as the stream's head", async () => {
    expect(await saleAfterBusyStream(cutOff)).toBe("unobserved");
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

function capture(
    responses: (Page | Error)[],
    options: { onStatus?: () => Promise<void>; rateLimits?: RateLimitInfo[] } = {},
) {
    const stop = new AbortController();
    const requested: (string | undefined)[] = [];
    const startedAt: number[] = [];
    // The rate-limit headers of the latest response, as the real client reports them.
    let latest: RateLimitInfo | undefined;
    const client = {
        public: {
            stashTabs: async (request: { id?: string }) => {
                startedAt.push(Date.now());
                latest = options.rateLimits?.[requested.length] ?? latest;
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
        startedAt,
        done: runCapture(client, {
            archive: { dir },
            signal: stop.signal,
            onStatus: options.onStatus,
            rateLimit: () => latest,
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

const rule = (maxHits: number, periodSeconds: number, currentHits = 1): RateLimitRule => ({
    rule: "ip",
    maxHits,
    periodSeconds,
    restrictionSeconds: 60,
    currentHits,
    currentPeriodSeconds: periodSeconds,
    currentRestrictionSeconds: 0,
});

it("spends 90% of the strictest rate-limit rule, less other clients' hits", () => {
    const now = 100_000;
    const own = [now - 300];
    expect(rateLimitSpacingMs(undefined)).toBe(0);
    // 2 hits per second at 90% is a request every 556 ms.
    expect(rateLimitSpacingMs({ rules: [rule(2, 1)] }, own, now)).toBe(556);
    expect(rateLimitSpacingMs({ rules: [rule(2, 1), rule(45, 60)] }, own, now)).toBe(1482);
    // Capture's own two requests fill the window without slowing it to a request per period.
    expect(rateLimitSpacingMs({ rules: [rule(2, 1, 2)] }, [now - 800, now - 300], now)).toBe(556);
    // Only one of the two hits is capture's: another client on the IP has the other.
    expect(rateLimitSpacingMs({ rules: [rule(2, 1, 2)] }, own, now)).toBe(1250);
    // A request older than the rule's period no longer counts as capture's.
    expect(rateLimitSpacingMs({ rules: [rule(2, 1, 2)] }, [now - 1500], now)).toBe(1000);
    // 20 of the 30 hits in the minute are another client's; capture keeps to the remaining 20.5.
    const minute = Array.from({ length: 10 }, (_, i) => now - 1000 - i * 5000);
    expect(rateLimitSpacingMs({ rules: [rule(45, 60, 30)] }, minute, now)).toBe(2927);
});

it("spaces requests as the rate-limit headers allow, and logs each new set of rules", async () => {
    await writeCaptureState(dir, { cursor: "a" });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const run = capture([page("b"), page("c"), page("d")], {
        rateLimits: [{ rules: [rule(15, 1)] }, { rules: [rule(15, 1), rule(60, 5)] }],
    });
    await run.done;
    const lines = log.mock.calls.map(([line]) => line);
    log.mockRestore();
    const [first = 0, second = 0, third = 0] = run.startedAt;
    // 15 hits per second at 90% is 75 ms apart; then 60 per 5 s at 90% is 93 ms.
    expect(second - first).toBeGreaterThanOrEqual(74);
    expect(third - second).toBeGreaterThanOrEqual(92);
    expect(lines).toEqual([
        "psapi rate limits: ip 15:1:60",
        "psapi rate limits: ip 15:1:60, ip 60:5:60",
    ]);
    expect(await readCaptureState(dir)).toEqual({ cursor: "d" });
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
