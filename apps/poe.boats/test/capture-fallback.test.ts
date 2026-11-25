// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve upstream field names.
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { PoeApiClient } from "../../../packages/poe-api-client/src/client";
import {
    CAPTURE_SEGMENT_HEADER,
    type CaptureLeaseState,
    type CaptureSegment,
    captureLeaseRequestSchema,
    captureSegmentEpoch,
    captureSegmentSchema,
    checkCaptureLease,
    decideCaptureLease,
    initialCaptureLeaseState,
} from "../../../packages/poe-market/src/capture-lease";
import { runCapture, writeCaptureState } from "../../../packages/poe-stash-ingest/src/ps/capture";
import {
    createSegmentWriter,
    runFallbackCapture,
} from "../../../packages/poe-stash-ingest/src/ps/capture-fallback";
import {
    createHomeLease,
    createLeaseApi,
    importSegments,
} from "../../../packages/poe-stash-ingest/src/ps/capture-lease";
import {
    appendRawLines,
    appendRawPage,
    RawPageReader,
    rawLine,
    sealRawHours,
} from "../../../packages/poe-stash-ingest/src/ps/raw-archive";

vi.mock("../../../packages/poe-stash-ingest/src/shared/auth", () => ({ REALM: undefined }));

type Page = Parameters<typeof appendRawPage>[1]["page"];
const page = (next: string, item: string) =>
    ({
        next_change_id: next,
        stashes: [
            {
                id: "stash",
                public: true,
                accountName: "seller",
                league: "Standard",
                stashType: "TradeStash",
                items: [{ id: item, name: "Headhunter", typeLine: "Leather Belt", frameType: 3 }],
            },
        ],
    }) as unknown as Page;
const head = (cursor: string) => ({ next_change_id: cursor, stashes: [] }) as unknown as Page;
const at = (h: number, minute = 0) => Date.UTC(2026, 10, 25, h, minute);

let dir: string;
let fallbackDir: string;
beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "capture-home-"));
    fallbackDir = await mkdtemp(join(tmpdir(), "capture-fallback-"));
});
afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(fallbackDir, { recursive: true, force: true });
});

async function until(condition: () => boolean | Promise<boolean>, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    while (!(await condition())) {
        if (Date.now() > deadline) throw new Error("Timed out waiting for the condition.");
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

/** psapi as a stream of `length` pages: cursor `sK` returns page K, whose next cursor is sK+1. */
function stream(length: number) {
    const requested: (string | undefined)[] = [];
    const client = {
        public: {
            stashTabs: async ({ id }: { id?: string }) => {
                requested.push(id);
                const k = id ? Number(id.slice(1)) : 0;
                return k >= length ? head(`s${length}`) : page(`s${k + 1}`, `item-${k}`);
            },
        },
    } as unknown as PoeApiClient;
    return { client, requested };
}

/** The lease Worker's routes over the same state machine, with a clock that can be moved on. */
function fakeLeaseWorker() {
    let state: CaptureLeaseState = initialCaptureLeaseState;
    let offset = 0;
    const segments = new Map<string, { segment: CaptureSegment; body: Uint8Array<ArrayBuffer> }>();
    const now = () => Date.now() + offset;
    const sorted = () => [...segments.keys()].sort();
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        const method = init?.method ?? "GET";
        if (url.pathname === "/lease") {
            const request = captureLeaseRequestSchema.parse(JSON.parse(String(init?.body)));
            const result = decideCaptureLease(state, request, now());
            state = result.state;
            if (result.stopFallback)
                for (const key of sorted())
                    if (state.segment === null || key > state.segment) segments.delete(key);
            return Response.json(result.response);
        }
        if (url.pathname === "/segments") {
            const after = url.searchParams.get("after");
            const listed = sorted()
                .filter((key) => after === null || key > after)
                .map((key) => segments.get(key)!.segment);
            return Response.json({ segments: listed, more: false });
        }
        const key = /^\/segments\/(\d{10}\/\d{6})$/.exec(url.pathname)?.[1];
        if (!key) return new Response(null, { status: 404 });
        if (method === "PUT") {
            if (
                state.holder !== "fallback" ||
                state.released ||
                state.epoch !== captureSegmentEpoch(key)
            )
                return new Response(null, { status: 409 });
            const header = new Headers(init?.headers).get(CAPTURE_SEGMENT_HEADER);
            const segment = captureSegmentSchema.parse(JSON.parse(header ?? "null"));
            const body = new Uint8Array(await new Response(init?.body).arrayBuffer());
            segments.set(key, { segment, body });
            return new Response(null, { status: 201 });
        }
        if (method === "DELETE") {
            if (state.imported === null || key > state.imported)
                return new Response(null, { status: 409 });
            segments.delete(key);
            return new Response(null, { status: 204 });
        }
        const stored = segments.get(key);
        return stored ? new Response(stored.body) : new Response(null, { status: 404 });
    }) as typeof fetch;
    return {
        api: createLeaseApi({ url: "http://lease.test/", token: "test-token", fetch: fetchFn }),
        state: () => state,
        segments,
        /** Moves the Worker's clock on, then runs its timer. */
        check(advanceMs: number, fallbackRunning: boolean) {
            offset += advanceMs;
            const result = checkCaptureLease(state, now(), fallbackRunning);
            state = result.state;
            return result;
        },
    };
}

/** Every archived page in order: its cursors, capture time and the item it holds. */
async function archived(from = dir) {
    const reader = new RawPageReader(from, { hour: "", offset: 0, capturedAt: 0 });
    const pages: { cursor: string | null; next: string; item?: string; capturedAt: number }[] = [];
    for (;;) {
        const record = await reader.peek();
        if (!record) return pages;
        const items = record.page.stashes[0]?.items ?? [];
        pages.push({
            cursor: record.cursor,
            next: record.page.next_change_id,
            item: items[0]?.id,
            capturedAt: record.capturedAt,
        });
        reader.advance();
    }
}

const position = (cursor: string | null) => Number(cursor?.slice(1) ?? 0);

const fast = { requestSpacingMs: 1, headPollMs: 5, errorDelayMs: 1, leasePollMs: 2 };

describe("the raw archive", () => {
    it("keeps the latest spooled hour open while another holder may add to it", async () => {
        await appendRawPage(dir, { capturedAt: at(10, 1), page: page("a", "one") });
        await appendRawPage(dir, { capturedAt: at(11, 1), cursor: "a", page: page("b", "two") });
        expect(await sealRawHours(dir, at(12), 1, { keepLatest: true })).toMatchObject([
            { hour: "2026-11-25T10" },
        ]);
        expect(await readdir(join(dir, "spool"))).toEqual(["2026-11-25T11.ndjson"]);
    });

    it("appends imported lines after the archive and refuses any that go back", async () => {
        await appendRawPage(dir, { capturedAt: at(10, 1), page: page("a", "one") });
        const lines = async function* (...entries: [number, string, string][]) {
            for (const [capturedAt, cursor, next] of entries)
                yield rawLine(capturedAt, cursor, page(next, `item-${next}`));
        };
        expect(await appendRawLines(dir, lines([at(10, 5), "a", "b"], [at(11, 1), "b", "c"]))).toBe(
            2,
        );
        expect((await archived()).map((p) => p.cursor)).toEqual([null, "a", "b"]);
        await expect(appendRawLines(dir, lines([at(10, 50), "c", "d"]))).rejects.toThrow(
            /older than the archived 2026-11-25T11/,
        );
        await sealRawHours(dir, at(12));
        await expect(appendRawLines(dir, lines([at(11, 30), "c", "d"]))).rejects.toThrow(
            /already sealed/,
        );
    });
});

describe("home's lease", () => {
    it("fetches only while it holds the lease, and continues from a handed-over cursor", async () => {
        await writeCaptureState(dir, { cursor: "s0" });
        const { client, requested } = stream(100);
        let holding = true;
        let handover: string | null | undefined;
        const synced: (string | null)[] = [];
        const stop = new AbortController();
        const run = runCapture(client, {
            archive: { dir },
            signal: stop.signal,
            ...fast,
            maintain: async () => ({ sealed: [], uploaded: 0 }),
            lease: {
                holding: () => holding,
                takeHandover: () => {
                    const next = handover;
                    handover = undefined;
                    return next;
                },
                synced: (cursor) => synced.push(cursor),
            },
        });
        await until(() => requested.length >= 2);
        holding = false;
        const paused = requested.length;
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(requested.length).toBeLessThanOrEqual(paused + 1);

        handover = "s50";
        holding = true;
        await until(() => requested.includes("s51"));
        stop.abort();
        await run;
        expect(requested.slice(0, 2)).toEqual(["s0", "s1"]);
        expect(requested).toContain("s50");
        expect(synced[0]).toBe("s0");
        expect(synced).toContain("s51");
    });

    it("reports a failed stash stage while the lease cannot be reached", async () => {
        await writeCaptureState(dir, { cursor: "s0" });
        const unreachable = createLeaseApi({
            url: "http://lease.test",
            token: "test-token",
            fetch: (async () => new Response(null, { status: 503 })) as typeof fetch,
        });
        const lease = createHomeLease({ api: unreachable, dir, renewMs: 5 });
        const { client, requested } = stream(5);
        const reports: { state?: string; failedStages?: string[] }[] = [];
        const stop = new AbortController();
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        const renewing = lease.run(stop.signal);
        const run = runCapture(client, {
            archive: { dir },
            signal: stop.signal,
            ...fast,
            lease,
            onStatus: async (patch) => {
                reports.push(patch);
            },
        });
        await until(() => reports.some((r) => r.state === "error"));
        stop.abort();
        await Promise.all([run, renewing]);
        log.mockRestore();
        expect(requested).toEqual([]);
        expect(reports.find((r) => r.state === "error")?.failedStages).toEqual(["stash"]);
    });

    it("waits for sealing before importing more, so a long outage cannot fill the disk", async () => {
        const worker = fakeLeaseWorker();
        await worker.api.lease({ holder: "home", cursor: "s0" });
        worker.check(120_000, false);
        const { epoch } = (await worker.api.lease({ holder: "fallback" })) as { epoch: number };
        const writer = createSegmentWriter({
            dir: fallbackDir,
            epoch,
            api: worker.api,
            maxBytes: 1,
        });
        await writer.append({ capturedAt: at(14, 1), cursor: "s0", page: page("s1", "x") });
        await writer.flush();

        for (const hour of [10, 11, 12, 13])
            await appendRawPage(dir, { capturedAt: at(hour, 1), page: page("p", `h${hour}`) });
        const stop = new AbortController();
        const importing = importSegments({
            api: worker.api,
            dir,
            after: null,
            upTo: writer.durable()!.segment,
            signal: stop.signal,
            maxSpooledHours: 4,
            waitMs: 5,
        });
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect((await archived()).map((p) => p.item)).toEqual(["h10", "h11", "h12", "h13"]);
        await sealRawHours(dir, at(12));
        expect(await importing).toBe(writer.durable()!.segment);
        expect((await archived()).map((p) => p.item)).toEqual(["h10", "h11", "h12", "h13", "x"]);
    });
});

describe("the fallback", () => {
    it("starts from home's last cursor and reports a cursor only once its segment is uploaded", async () => {
        const worker = fakeLeaseWorker();
        await worker.api.lease({ holder: "home", cursor: "s3" });
        expect(worker.check(120_000, false).start).toBe(true);

        const { client, requested } = stream(6);
        const stop = new AbortController();
        const run = runFallbackCapture(client, {
            dir: fallbackDir,
            api: worker.api,
            signal: stop.signal,
            renewMs: 5,
            segmentBytes: 1,
            ...fast,
            // At the stream's head it waits, so the head page is the last one fetched.
            headPollMs: 60_000,
        });
        await until(() => worker.state().cursor === "s6");
        stop.abort();
        expect(await run).toMatchObject({ released: false });

        expect(requested).toEqual(["s3", "s4", "s5", "s6"]);
        expect(worker.state()).toMatchObject({ holder: "fallback", epoch: 2, cursor: "s6" });
        // Stopped by the platform, it still uploaded every page it fetched.
        const uploaded = [...worker.segments.keys()].sort();
        expect(uploaded).toEqual([
            "0000000002/000000",
            "0000000002/000001",
            "0000000002/000002",
            "0000000002/000003",
        ]);
        expect(uploaded.map((key) => worker.segments.get(key)!.segment.lastCursor)).toEqual([
            "s4",
            "s5",
            "s6",
            "s6",
        ]);
        expect(worker.state().segment).toBe("0000000002/000003");
        // Nothing is left on the Container's disk.
        expect(await readdir(join(fallbackDir, "segments"))).toEqual([]);
    });

    it("exits without uploading when it no longer holds the lease", async () => {
        const worker = fakeLeaseWorker();
        await worker.api.lease({ holder: "home", cursor: "s0" });
        const { client, requested } = stream(5);
        const result = await runFallbackCapture(client, {
            dir: fallbackDir,
            api: worker.api,
            signal: new AbortController().signal,
            renewMs: 5,
            ...fast,
        });
        expect(result).toEqual({ pages: 0, released: false });
        expect(requested).toEqual([]);
    });
});

it("keeps one unbroken stream in the archive across a failover and a handback", async () => {
    const worker = fakeLeaseWorker();
    const options = { renewMs: 5, leaseMs: 200, importPollMs: 5, importWaitMs: 5 };

    // Home captures the first pages, then goes silent.
    await writeCaptureState(dir, { cursor: "s0" });
    const homeStopped = new AbortController();
    const firstLease = createHomeLease({ api: worker.api, dir, ...options });
    const firstRenewal = firstLease.run(homeStopped.signal);
    const firstRun = runCapture(stream(12).client, {
        archive: { dir },
        signal: homeStopped.signal,
        lease: firstLease,
        ...fast,
    });
    await until(async () => (await archived()).length >= 3);
    homeStopped.abort();
    await Promise.all([firstRun, firstRenewal]);

    // The Worker starts the fallback, which captures while home is away.
    expect(worker.check(120_000, false).start).toBe(true);
    const fallbackStopped = new AbortController();
    const fallback = runFallbackCapture(stream(12).client, {
        dir: fallbackDir,
        api: worker.api,
        signal: fallbackStopped.signal,
        renewMs: 5,
        segmentBytes: 1,
        ...fast,
        headPollMs: 50,
    });
    await until(() => worker.segments.size >= 3);

    // Home returns: it imports the fallback's pages, then holds the lease again.
    const homeBack = new AbortController();
    const secondLease = createHomeLease({ api: worker.api, dir, ...options });
    const secondRenewal = secondLease.run(homeBack.signal);
    const again = stream(12);
    const secondRun = runCapture(again.client, {
        archive: { dir },
        signal: homeBack.signal,
        lease: secondLease,
        ...fast,
        headPollMs: 50,
    });
    expect(await fallback).toMatchObject({ released: true });
    await until(() => again.requested.length >= 1);
    // Home deletes what it imported once a renewal has recorded it.
    await until(() => worker.segments.size === 0);
    homeBack.abort();
    await Promise.all([secondRun, secondRenewal]);
    fallbackStopped.abort();

    // Home continues where the fallback stopped: the stream's head.
    expect(again.requested[0]).toBe("s12");
    expect(worker.state()).toMatchObject({ holder: "home", homeWaiting: false, released: false });
    const pages = await archived();
    // Every page is there, in capture order. A new holder may fetch again a page its predecessor
    // had not yet reported, but no page is ever requested past the one before it.
    expect(new Set(pages.map((p) => p.item).filter(Boolean))).toEqual(
        new Set(Array.from({ length: 12 }, (_, k) => `item-${k}`)),
    );
    for (let i = 1; i < pages.length; i++) {
        expect(pages[i]!.capturedAt).toBeGreaterThanOrEqual(pages[i - 1]!.capturedAt);
        expect(position(pages[i]!.cursor)).toBeLessThanOrEqual(position(pages[i - 1]!.next));
    }
});

it("refuses a segment from a fallback that has lost the lease", async () => {
    const worker = fakeLeaseWorker();
    await worker.api.lease({ holder: "home", cursor: "s0" });
    worker.check(120_000, false);
    const { epoch } = (await worker.api.lease({ holder: "fallback" })) as { epoch: number };
    // The fallback stops renewing; home returns, and the Worker counts the fallback as gone.
    await worker.api.lease({ holder: "home", imported: null });
    worker.check(120_000, false);
    await worker.api.lease({ holder: "home", imported: null });
    expect(worker.state().holder).toBe("home");

    const writer = createSegmentWriter({ dir: fallbackDir, epoch, api: worker.api, maxBytes: 1 });
    await writer.append({ capturedAt: at(14, 1), cursor: "s0", page: page("s1", "x") });
    await expect(writer.flush()).rejects.toThrow(/HTTP 409/);
    expect(writer.durable()).toBeUndefined();
    expect(worker.segments.size).toBe(0);
});
