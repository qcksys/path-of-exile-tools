// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve upstream field names.
import { appendFile, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { createClient } from "../../../packages/poe-api-client/src/client";
import { ingestPs } from "../../../packages/poe-stash-ingest/src/ps/ingest";
import {
    appendRawPage,
    RawArchiveError,
    type RawManifest,
    replayRawArchive,
    sealRawHours,
    uploadRawHours,
} from "../../../packages/poe-stash-ingest/src/ps/raw-archive";
import { openDb } from "../../../packages/poe-stash-ingest/src/shared/db";

vi.mock("../../../packages/poe-stash-ingest/src/shared/auth", () => ({ REALM: undefined }));

const hour = (h: number, minute = 0) => Date.UTC(2026, 9, 28, h, minute);
type Page = Parameters<typeof appendRawPage>[1]["page"];
// Partial items keep the fixture short; the archive stores pages without reading their fields.
const page = (next: string, note = "~b/o 1 chaos") =>
    ({
        next_change_id: next,
        stashes: [
            {
                id: "stash",
                public: true,
                accountName: "seller",
                league: "Standard",
                stashType: "PremiumStash",
                items: [{ id: "item", typeLine: "Plate Vest", note, futureField: [1, null] }],
            },
        ],
    }) as unknown as Page;

let dir: string;
beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "raw-archive-"));
});
afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

async function collect(range?: { from?: string; to?: string }) {
    const records = [];
    for await (const record of replayRawArchive(dir, range)) records.push(record);
    return records;
}

const manifest = async (hourPath: string) =>
    JSON.parse(await readFile(join(dir, `${hourPath}.ndjson.zst.json`), "utf8")) as RawManifest;

it("seals each finished hour and replays every page with its capture time and cursor", async () => {
    await appendRawPage(dir, { capturedAt: hour(10, 1), page: page("a") });
    await appendRawPage(dir, { capturedAt: hour(10, 59), cursor: "a", page: page("b") });
    await appendRawPage(dir, { capturedAt: hour(11, 30), cursor: "b", page: page("c") });
    await appendRawPage(dir, { capturedAt: hour(12, 5), cursor: "c", page: page("d") });

    const sealed = await sealRawHours(dir, hour(12, 30));
    expect(sealed.map((m) => m.hour)).toEqual(["2026-10-28T10", "2026-10-28T11"]);
    expect(await readdir(join(dir, "spool"))).toEqual(["2026-10-28T12.ndjson"]);
    expect(await manifest("2026/10/28/10")).toMatchObject({
        pages: 2,
        firstCapturedAt: hour(10, 1),
        lastCapturedAt: hour(10, 59),
        firstCursor: null,
        lastCursor: "a",
    });

    expect(await collect()).toEqual([
        { capturedAt: hour(10, 1), cursor: null, page: page("a") },
        { capturedAt: hour(10, 59), cursor: "a", page: page("b") },
        { capturedAt: hour(11, 30), cursor: "b", page: page("c") },
    ]);
    expect((await collect({ from: "2026-10-28T11" })).map((r) => r.cursor)).toEqual(["b"]);
});

it("drops a line a crash left unfinished instead of joining it to the next page", async () => {
    await appendRawPage(dir, { capturedAt: hour(10, 1), page: page("a") });
    await appendFile(join(dir, "spool", "2026-10-28T10.ndjson"), '{"capturedAt":1,"cur');
    await appendRawPage(dir, { capturedAt: hour(10, 2), cursor: "a", page: page("b") });

    await sealRawHours(dir, hour(11));
    expect((await collect()).map((r) => r.page.next_change_id)).toEqual(["a", "b"]);
});

it("rejects a damaged file before replaying any of its pages", async () => {
    for (let n = 0; n < 20; n++)
        await appendRawPage(dir, { capturedAt: hour(10, n), page: page(`p${n}`, `note ${n}`) });
    await sealRawHours(dir, hour(11));
    const file = join(dir, "2026/10/28/10.ndjson.zst");
    const bytes = await readFile(file);
    bytes[Math.floor(bytes.length / 2)]! ^= 1;
    await writeFile(file, bytes);

    const seen: unknown[] = [];
    await expect(
        (async () => {
            for await (const record of replayRawArchive(dir)) seen.push(record);
        })(),
    ).rejects.toThrow(RawArchiveError);
    expect(seen).toEqual([]);
});

it("refuses to seal over an hour that is already sealed", async () => {
    await appendRawPage(dir, { capturedAt: hour(10), page: page("a") });
    await sealRawHours(dir, hour(11));
    await appendRawPage(dir, { capturedAt: hour(10, 5), page: page("late") });
    await expect(sealRawHours(dir, hour(11))).rejects.toThrow("already sealed");
    expect(await readdir(join(dir, "spool"))).toEqual(["2026-10-28T10.ndjson"]);
});

const b2 = {
    keyId: "key",
    applicationKey: "secret",
    bucketName: "poe-ingest-dev",
    prefix: "psapi/pc/",
};

/** Answers B2's authorize, bucket lookup and upload URL calls; `upload` answers each upload. */
function fakeB2(upload: (headers: Headers) => Response, buckets = [b2.bucketName]) {
    return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        const headers = new Headers(init?.headers);
        if (target === "https://api.backblazeb2.com/b2api/v4/b2_authorize_account") {
            expect(headers.get("authorization")).toBe(
                `Basic ${Buffer.from("key:secret").toString("base64")}`,
            );
            return Response.json({
                accountId: "account",
                authorizationToken: "account-token",
                apiInfo: { storageApi: { apiUrl: "https://api.example" } },
            });
        }
        if (target === "https://api.example/b2api/v4/b2_list_buckets") {
            expect(headers.get("authorization")).toBe("account-token");
            expect(JSON.parse(String(init?.body))).toEqual({
                accountId: "account",
                bucketName: b2.bucketName,
            });
            return Response.json({
                buckets: buckets.map((name) => ({ bucketId: `${name}-id`, bucketName: name })),
            });
        }
        if (target === "https://api.example/b2api/v4/b2_get_upload_url?bucketId=poe-ingest-dev-id")
            return Response.json({
                uploadUrl: "https://pod.example/upload",
                authorizationToken: "upload-token",
            });
        expect(target).toBe("https://pod.example/upload");
        return upload(headers);
    }) as unknown as typeof fetch;
}

it("uploads each sealed hour once, with B2 checking its SHA-1, after retrying a busy pod", async () => {
    await appendRawPage(dir, { capturedAt: hour(10), page: page("a") });
    await sealRawHours(dir, hour(11));
    const sealed = await manifest("2026/10/28/10");
    const uploads: Headers[] = [];
    const fetchFn = fakeB2((headers) => {
        uploads.push(headers);
        if (uploads.length === 1) return new Response("busy", { status: 503 });
        return Response.json({ fileId: "file-1", contentSha1: headers.get("x-bz-content-sha1") });
    });

    expect(await uploadRawHours(dir, b2, { fetch: fetchFn, retryDelayMs: 0 })).toBe(1);
    expect(uploads).toHaveLength(2);
    expect(uploads[1]!.get("x-bz-file-name")).toBe("psapi/pc/2026/10/28/10.ndjson.zst");
    expect(uploads[1]!.get("x-bz-content-sha1")).toBe(sealed.sha1);
    expect(uploads[1]!.get("x-bz-info-sha256")).toBe(sealed.sha256);
    expect((await manifest("2026/10/28/10")).b2).toMatchObject({
        fileName: "psapi/pc/2026/10/28/10.ndjson.zst",
        fileId: "file-1",
    });

    const calls = vi.mocked(fetchFn).mock.calls.length;
    expect(await uploadRawHours(dir, b2, { fetch: fetchFn, retryDelayMs: 0 })).toBe(0);
    expect(vi.mocked(fetchFn).mock.calls.length).toBe(calls);
});

it("fails an upload B2 stored with a different SHA-1", async () => {
    await appendRawPage(dir, { capturedAt: hour(10), page: page("a") });
    await sealRawHours(dir, hour(11));
    const fetchFn = fakeB2(() => Response.json({ fileId: "file-1", contentSha1: "0".repeat(40) }));
    await expect(uploadRawHours(dir, b2, { fetch: fetchFn, retryDelayMs: 0 })).rejects.toThrow(
        "different SHA-1",
    );
    expect((await manifest("2026/10/28/10")).b2).toBeUndefined();
});

it("names the bucket when the key cannot see it", async () => {
    await appendRawPage(dir, { capturedAt: hour(10), page: page("a") });
    await sealRawHours(dir, hour(11));
    const fetchFn = fakeB2(() => Response.json({}), []);
    await expect(uploadRawHours(dir, b2, { fetch: fetchFn, retryDelayMs: 0 })).rejects.toThrow(
        "B2 bucket poe-ingest-dev is not visible to this key.",
    );
});

it("keeps every fetched page, unfiltered, before live capture processes it", async () => {
    const db = await openDb(":memory:");
    const client = createClient({ userAgent: "raw-archive-test", token: "inert" });
    const fetched = {
        ...page("next"),
        stashes: [
            ...page("next").stashes,
            { ...page("next").stashes[0]!, id: "other", league: "Other" },
        ],
    };
    vi.spyOn(client.public, "stashTabs").mockResolvedValue(fetched as never);
    try {
        await ingestPs(db.conn, client, {
            pages: 1,
            league: "Standard",
            cursor: "start",
            rawArchiveDir: dir,
        });
    } finally {
        await db.close();
    }
    const spool = await readdir(join(dir, "spool"));
    expect(spool).toHaveLength(1);
    const [line] = (await readFile(join(dir, "spool", spool[0]!), "utf8")).trim().split("\n");
    const record = JSON.parse(line!);
    expect(record).toMatchObject({ cursor: "start", page: fetched });
    expect(record.capturedAt).toBeGreaterThan(Date.now() - 60_000);
});
