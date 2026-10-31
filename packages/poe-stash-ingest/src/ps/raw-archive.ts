import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
    type FileHandle,
    mkdir,
    open,
    readdir,
    readFile,
    rename,
    rm,
    stat,
    writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { pipeline } from "node:stream/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { constants, createZstdCompress, createZstdDecompress } from "node:zlib";
import type { PublicStashPage } from "@poe-tools/api-client";

/**
 * Every fetched psapi page, unfiltered, as one NDJSON line per page:
 * `{"capturedAt":<ms>,"cursor":<requested id>,"sha256":<of page JSON>,"page":<page>}`.
 * Lines append to `spool/<hour>.ndjson`; each finished UTC hour is sealed into
 * `<YYYY>/<MM>/<DD>/<HH>.ndjson.zst` with a `.json` manifest, then uploaded to B2.
 */

export interface B2Options {
    keyId: string;
    applicationKey: string;
    bucketName: string;
    /** Prepended to each file's path below the archive directory. */
    prefix: string;
}

export interface RawArchiveOptions {
    dir: string;
    b2?: B2Options;
}

export interface RawManifest {
    hour: string;
    pages: number;
    rawBytes: number;
    bytes: number;
    sha256: string;
    sha1: string;
    firstCapturedAt: number;
    lastCapturedAt: number;
    firstCursor: string | null;
    lastCursor: string | null;
    b2?: { fileName: string; fileId: string; uploadedAt: number };
}

export interface RawRecord {
    capturedAt: number;
    cursor: string | null;
    page: PublicStashPage;
}

/**
 * How far a database has read the raw archive: bytes into one hour's uncompressed NDJSON, which a
 * spool and its sealed file share, and the capture time of the last page read.
 */
export interface RawPosition {
    hour: string;
    offset: number;
    capturedAt: number;
}

export class RawArchiveError extends Error {}

/** `stream_cursor` row holding the database's `RawPosition`. */
export const RAW_POSITION_STREAM = "psapi-raw";

const SPOOL = "spool";
const PAGE_FIELD = ',"page":';
// Level 19 with a 128 MB window measured within 3% of a 2 GB window, and default decoders
// accept a 128 MB window without extra flags.
const ZSTD_PARAMS = {
    [constants.ZSTD_c_compressionLevel]: 19,
    [constants.ZSTD_c_enableLongDistanceMatching]: 1,
    [constants.ZSTD_c_windowLog]: 27,
    [constants.ZSTD_c_checksumFlag]: 1,
};

/** Raw archiving is off unless `PS_RAW_ARCHIVE_DIR` is set; B2 upload is off unless `B2_KEY_ID` is. */
export function rawArchiveSettings(env = process.env): RawArchiveOptions | undefined {
    if (!env.PS_RAW_ARCHIVE_DIR) return undefined;
    if (!env.B2_KEY_ID) return { dir: env.PS_RAW_ARCHIVE_DIR };
    if (!env.B2_APPLICATION_KEY || !env.B2_BUCKET)
        throw new Error("B2_KEY_ID needs B2_APPLICATION_KEY and B2_BUCKET.");
    return {
        dir: env.PS_RAW_ARCHIVE_DIR,
        b2: {
            keyId: env.B2_KEY_ID,
            applicationKey: env.B2_APPLICATION_KEY,
            bucketName: env.B2_BUCKET,
            prefix: env.B2_PREFIX ?? "",
        },
    };
}

const hourKey = (millis: number) => new Date(millis).toISOString().slice(0, 13);
const digest = (algorithm: string, data: string | Uint8Array) =>
    createHash(algorithm).update(data).digest("hex");

function sealedPath(dir: string, hour: string) {
    const [date, hh] = hour.split("T");
    const [year, month, day] = date!.split("-");
    return join(dir, year!, month!, day!, `${hh}.ndjson.zst`);
}

/** Bytes of the file up to and including its last newline. */
async function completeBytes(fh: FileHandle) {
    const { size } = await fh.stat();
    const chunk = Buffer.alloc(64 * 1024);
    let end = size;
    while (end > 0) {
        const start = Math.max(0, end - chunk.length);
        await fh.read(chunk, 0, end - start, start);
        const newline = chunk.subarray(0, end - start).lastIndexOf(0x0a);
        if (newline >= 0) return start + newline + 1;
        end = start;
    }
    return 0;
}

const openExisting = (path: string, flags: string) =>
    open(path, flags).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined;
        throw error;
    });

/** Cuts a line left unfinished by a crash, so the next append starts on a clean line. */
async function trimPartialLine(path: string) {
    const fh = await openExisting(path, "r+");
    if (!fh) return;
    try {
        const { size } = await fh.stat();
        const complete = await completeBytes(fh);
        if (complete < size) await fh.truncate(complete);
    } finally {
        await fh.close();
    }
}

/** Appends one fetched page and syncs it to disk before returning. */
export async function appendRawPage(
    dir: string,
    entry: { capturedAt: number; cursor?: string; page: PublicStashPage },
) {
    const pageJson = JSON.stringify(entry.page);
    const header = JSON.stringify({
        capturedAt: entry.capturedAt,
        cursor: entry.cursor ?? null,
        sha256: digest("sha256", pageJson),
    });
    const path = join(dir, SPOOL, `${hourKey(entry.capturedAt)}.ndjson`);
    await mkdir(dirname(path), { recursive: true });
    await trimPartialLine(path);
    const fh = await open(path, "a");
    try {
        await fh.write(`${header.slice(0, -1)}${PAGE_FIELD}${pageJson}}\n`);
        await fh.datasync();
    } finally {
        await fh.close();
    }
}

async function fileDigests(path: string) {
    const sha256 = createHash("sha256");
    const sha1 = createHash("sha1");
    for await (const chunk of createReadStream(path)) {
        sha256.update(chunk);
        sha1.update(chunk);
    }
    return { sha256: sha256.digest("hex"), sha1: sha1.digest("hex") };
}

interface RawLineHeader {
    capturedAt: number;
    cursor: string | null;
    sha256: string;
}

function parseRawLine(path: string, line: string, record: number | string) {
    const split = line.indexOf(PAGE_FIELD);
    if (split < 0 || !line.endsWith("}"))
        throw new RawArchiveError(`${path} record ${record} is malformed.`);
    const header = JSON.parse(`${line.slice(0, split)}}`) as RawLineHeader;
    const pageJson = line.slice(split + PAGE_FIELD.length, -1);
    if (digest("sha256", pageJson) !== header.sha256)
        throw new RawArchiveError(`${path} record ${record} does not match its checksum.`);
    return { header, pageJson };
}

/**
 * Streams one sealed hour's records, checking each page against its recorded SHA-256. With a
 * manifest, the whole file's SHA-256 is checked first, so a damaged file yields no records.
 */
async function* readRawFile(path: string, manifest?: RawManifest) {
    if (manifest && (await fileDigests(path)).sha256 !== manifest.sha256)
        throw new RawArchiveError(`${path} does not match its manifest checksum.`);
    let pages = 0;
    const lines = createInterface({
        input: createReadStream(path).pipe(createZstdDecompress()),
        crlfDelay: Number.POSITIVE_INFINITY,
    });
    for await (const line of lines) {
        const { header, pageJson } = parseRawLine(path, line, pages + 1);
        pages++;
        yield { line, header, pageJson };
    }
    if (manifest && pages !== manifest.pages)
        throw new RawArchiveError(
            `${path} has ${pages} records; its manifest lists ${manifest.pages}.`,
        );
}

async function syncDirectory(path: string) {
    // Windows cannot open a directory for fsync; renames there are durable without it.
    if (process.platform === "win32") return;
    const fh = await open(path, "r");
    try {
        await fh.sync();
    } finally {
        await fh.close();
    }
}

async function writeManifest(path: string, manifest: RawManifest) {
    await writeFile(`${path}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`);
    await rename(`${path}.tmp`, path);
}

async function sealHour(dir: string, hour: string): Promise<RawManifest> {
    const spool = join(dir, SPOOL, `${hour}.ndjson`);
    const target = sealedPath(dir, hour);
    if (await stat(`${target}.json`).catch(() => undefined))
        throw new RawArchiveError(`${hour} is already sealed; its spool stays at ${spool}.`);
    await trimPartialLine(spool);
    await mkdir(dirname(target), { recursive: true });
    const temp = `${target}.tmp`;
    await pipeline(
        createReadStream(spool),
        createZstdCompress({ params: ZSTD_PARAMS }),
        createWriteStream(temp),
    );

    // Decompress what was written and compare it with the spool before the spool is removed.
    const expected = createHash("sha256");
    for await (const chunk of createReadStream(spool)) expected.update(chunk);
    const actual = createHash("sha256");
    let manifest: Omit<RawManifest, "bytes" | "sha256" | "sha1"> | undefined;
    for await (const { line, header } of readRawFile(temp)) {
        actual.update(`${line}\n`);
        manifest = manifest
            ? {
                  ...manifest,
                  pages: manifest.pages + 1,
                  rawBytes: manifest.rawBytes + Buffer.byteLength(line) + 1,
                  lastCapturedAt: header.capturedAt,
                  lastCursor: header.cursor,
              }
            : {
                  hour,
                  pages: 1,
                  rawBytes: Buffer.byteLength(line) + 1,
                  firstCapturedAt: header.capturedAt,
                  lastCapturedAt: header.capturedAt,
                  firstCursor: header.cursor,
                  lastCursor: header.cursor,
              };
    }
    if (!manifest || actual.digest("hex") !== expected.digest("hex")) {
        await rm(temp, { force: true });
        throw new RawArchiveError(`${hour} did not decompress to its spool; the spool is kept.`);
    }
    // Windows refuses fsync on a read-only handle.
    const fh = await open(temp, "r+");
    try {
        await fh.sync();
    } finally {
        await fh.close();
    }
    const sealed: RawManifest = {
        ...manifest,
        bytes: (await stat(temp)).size,
        ...(await fileDigests(temp)),
    };
    await rename(temp, target);
    await writeManifest(`${target}.json`, sealed);
    await syncDirectory(dirname(target));
    await rm(spool);
    return sealed;
}

/** Seals every spooled hour before the current UTC hour. */
export async function sealRawHours(dir: string, now = Date.now()): Promise<RawManifest[]> {
    const current = hourKey(now);
    const hours = (await readdir(join(dir, SPOOL)).catch(() => [] as string[]))
        .filter((name) => name.endsWith(".ndjson"))
        .map((name) => name.slice(0, -".ndjson".length))
        .filter((hour) => hour < current)
        .sort();
    const sealed: RawManifest[] = [];
    for (const hour of hours) sealed.push(await sealHour(dir, hour));
    return sealed;
}

async function sealedHours(dir: string) {
    const names = await readdir(dir, { recursive: true }).catch(() => [] as string[]);
    return names
        .filter((name) => name.endsWith(".ndjson.zst.json") && !name.startsWith(SPOOL))
        .map((name) => join(dir, name.slice(0, -".json".length)))
        .sort();
}

const readManifest = async (file: string) =>
    JSON.parse(await readFile(`${file}.json`, "utf8")) as RawManifest;

/** Replays sealed hours in order; `from` and `to` are inclusive UTC hours (`YYYY-MM-DDTHH`). */
export async function* replayRawArchive(
    dir: string,
    range: { from?: string; to?: string } = {},
): AsyncGenerator<RawRecord> {
    for (const file of await sealedHours(dir)) {
        const manifest = await readManifest(file);
        if ((range.from && manifest.hour < range.from) || (range.to && manifest.hour > range.to))
            continue;
        for await (const { header, pageJson } of readRawFile(file, manifest))
            yield {
                capturedAt: header.capturedAt,
                cursor: header.cursor,
                page: JSON.parse(pageJson) as PublicStashPage,
            };
    }
}

/** Hours with a spool or a sealed file, sorted. */
async function rawHours(dir: string) {
    const spooled = (await readdir(join(dir, SPOOL)).catch(() => [] as string[]))
        .filter((name) => name.endsWith(".ndjson"))
        .map((name) => name.slice(0, -".ndjson".length));
    const sealed = (await sealedHours(dir)).flatMap((file) => {
        const match = /(\d{4})[\\/](\d{2})[\\/](\d{2})[\\/](\d{2})\.ndjson\.zst$/.exec(file);
        return match ? [`${match[1]}-${match[2]}-${match[3]}T${match[4]}`] : [];
    });
    return [...new Set([...spooled, ...sealed])].sort();
}

/** The end of everything archived so far, without its unfinished last line. */
export async function rawEndPosition(dir: string): Promise<Omit<RawPosition, "capturedAt">> {
    const hour = (await rawHours(dir)).at(-1);
    if (!hour) return { hour: "", offset: 0 };
    const fh = await openExisting(join(dir, SPOOL, `${hour}.ndjson`), "r");
    if (!fh) return { hour, offset: (await readManifest(sealedPath(dir, hour))).rawBytes };
    try {
        return { hour, offset: await completeBytes(fh) };
    } finally {
        await fh.close();
    }
}

/** Yields the complete lines of a file being appended to, from a byte offset. */
async function* spoolLines(path: string, start: number) {
    let partial: Buffer[] = [];
    for await (const chunk of createReadStream(path, { start }) as AsyncIterable<Buffer>) {
        let from = 0;
        for (let newline = chunk.indexOf(0x0a); newline >= 0; newline = chunk.indexOf(0x0a, from)) {
            yield Buffer.concat([...partial, chunk.subarray(from, newline)]).toString();
            partial = [];
            from = newline + 1;
        }
        if (from < chunk.length) partial.push(chunk.subarray(from));
    }
}

/**
 * Reads pages in capture order from a position, following the spool as capture appends to it and
 * moving to the sealed file when capture seals an hour first. `advance` passes the page `peek`
 * returned, so a page that fails to process is read again.
 */
export class RawPageReader {
    position: RawPosition;
    private readonly dir: string;
    private lines?: AsyncGenerator<{ header: RawLineHeader; pageJson: string; bytes: number }>;
    private current?: RawRecord & { end: RawPosition };

    constructor(dir: string, position: RawPosition) {
        this.dir = dir;
        this.position = position;
    }

    private async *openHour({ hour, offset }: RawPosition) {
        if (!hour) return;
        const spool = join(this.dir, SPOOL, `${hour}.ndjson`);
        if (await stat(spool).catch(() => undefined)) {
            for await (const line of spoolLines(spool, offset)) {
                const parsed = parseRawLine(spool, line, `at byte ${offset}`);
                yield { ...parsed, bytes: Buffer.byteLength(line) + 1 };
            }
            return;
        }
        const sealed = sealedPath(this.dir, hour);
        if (!(await stat(`${sealed}.json`).catch(() => undefined))) return;
        let read = 0;
        for await (const { line, header, pageJson } of readRawFile(
            sealed,
            await readManifest(sealed),
        )) {
            const bytes = Buffer.byteLength(line) + 1;
            read += bytes;
            if (read > offset) yield { header, pageJson, bytes };
        }
    }

    /** The next page, or null until capture archives another. */
    async peek() {
        if (this.current) return this.current;
        let later: string | undefined;
        for (;;) {
            this.lines ??= this.openHour(this.position);
            const next = await this.lines.next().catch((error: NodeJS.ErrnoException) => {
                // Capture sealed this hour between the check and the read; its file is there now.
                if (error.code === "ENOENT") return undefined;
                throw error;
            });
            if (next && !next.done) {
                const { hour, offset } = this.position;
                this.current = {
                    capturedAt: next.value.header.capturedAt,
                    cursor: next.value.header.cursor,
                    page: JSON.parse(next.value.pageJson) as PublicStashPage,
                    end: {
                        hour,
                        offset: offset + next.value.bytes,
                        capturedAt: next.value.header.capturedAt,
                    },
                };
                return this.current;
            }
            this.lines = undefined;
            if (!next) continue;
            if (later) {
                this.position = { ...this.position, hour: later, offset: 0 };
                later = undefined;
                continue;
            }
            // Capture finishes an hour before it starts the next, so read this hour once more
            // after seeing a later one: pages may have arrived since the last read.
            later = (await rawHours(this.dir)).find((hour) => hour > this.position.hour);
            if (!later) return null;
        }
    }

    advance() {
        if (this.current) this.position = this.current.end;
        this.current = undefined;
    }
}

// The upload URL's 401, 408, 429 and 5xx responses ask for a new upload URL and a retry.
const retryable = (status: number) =>
    status === 401 || status === 408 || status === 429 || status >= 500;

class B2Uploader {
    private auth?: { apiUrl: string; token: string; bucketId: string };
    private target?: { uploadUrl: string; authorizationToken: string };
    private readonly opts: B2Options;
    private readonly fetchFn: typeof fetch;
    private readonly retryDelayMs: number;

    // Plain fields: Node's type stripping, which runs the worker, rejects parameter properties.
    constructor(opts: B2Options, fetchFn: typeof fetch, retryDelayMs: number) {
        this.opts = opts;
        this.fetchFn = fetchFn;
        this.retryDelayMs = retryDelayMs;
    }

    private async authorize() {
        const basic = Buffer.from(`${this.opts.keyId}:${this.opts.applicationKey}`).toString(
            "base64",
        );
        const res = await this.fetchFn(
            "https://api.backblazeb2.com/b2api/v4/b2_authorize_account",
            {
                headers: { authorization: `Basic ${basic}` },
            },
        );
        if (!res.ok) throw new RawArchiveError(`B2 authorization failed: HTTP ${res.status}`);
        const body = (await res.json()) as {
            accountId: string;
            authorizationToken: string;
            apiInfo: { storageApi: { apiUrl: string } };
        };
        const apiUrl = body.apiInfo.storageApi.apiUrl;
        // A key limited to one bucket may list that bucket only when it is named.
        const buckets = await this.fetchFn(`${apiUrl}/b2api/v4/b2_list_buckets`, {
            method: "POST",
            headers: { authorization: body.authorizationToken, "content-type": "application/json" },
            body: JSON.stringify({ accountId: body.accountId, bucketName: this.opts.bucketName }),
        });
        if (!buckets.ok)
            throw new RawArchiveError(`B2 bucket lookup failed: HTTP ${buckets.status}`);
        const { buckets: found } = (await buckets.json()) as {
            buckets: { bucketId: string; bucketName: string }[];
        };
        const bucket = found.find((b) => b.bucketName === this.opts.bucketName);
        if (!bucket)
            throw new RawArchiveError(
                `B2 bucket ${this.opts.bucketName} is not visible to this key.`,
            );
        return { apiUrl, token: body.authorizationToken, bucketId: bucket.bucketId };
    }

    private async uploadTarget() {
        for (let attempt = 0; attempt < 2; attempt++) {
            this.auth ??= await this.authorize();
            const res = await this.fetchFn(
                `${this.auth.apiUrl}/b2api/v4/b2_get_upload_url?bucketId=${encodeURIComponent(this.auth.bucketId)}`,
                { headers: { authorization: this.auth.token } },
            );
            if (res.ok)
                return (await res.json()) as { uploadUrl: string; authorizationToken: string };
            if (res.status !== 401)
                throw new RawArchiveError(`B2 upload URL failed: HTTP ${res.status}`);
            this.auth = undefined;
        }
        throw new RawArchiveError("B2 rejected a fresh authorization token.");
    }

    async upload(fileName: string, body: Uint8Array<ArrayBuffer>, manifest: RawManifest) {
        for (let attempt = 1; ; attempt++) {
            try {
                this.target ??= await this.uploadTarget();
                const res = await this.fetchFn(this.target.uploadUrl, {
                    method: "POST",
                    headers: {
                        authorization: this.target.authorizationToken,
                        "x-bz-file-name": fileName.split("/").map(encodeURIComponent).join("/"),
                        "content-type": "application/zstd",
                        "x-bz-content-sha1": manifest.sha1,
                        "x-bz-info-sha256": manifest.sha256,
                        "x-bz-info-pages": String(manifest.pages),
                    },
                    body,
                });
                if (res.ok) {
                    const stored = (await res.json()) as { fileId: string; contentSha1: string };
                    if (stored.contentSha1 !== manifest.sha1)
                        throw new RawArchiveError(`B2 stored ${fileName} with a different SHA-1.`);
                    return stored.fileId;
                }
                if (!retryable(res.status) || attempt >= 4)
                    throw new RawArchiveError(
                        `B2 upload of ${fileName} failed: HTTP ${res.status}`,
                    );
            } catch (error) {
                // fetch throws TypeError for network failures, which are worth another attempt.
                if (error instanceof RawArchiveError || attempt >= 4) throw error;
            }
            this.target = undefined;
            await sleep(this.retryDelayMs * 2 ** (attempt - 1));
        }
    }
}

/** Uploads sealed hours that have no B2 copy yet, oldest first, and records each in its manifest. */
export async function uploadRawHours(
    dir: string,
    b2: B2Options,
    opts: { fetch?: typeof fetch; retryDelayMs?: number } = {},
) {
    const uploader = new B2Uploader(b2, opts.fetch ?? fetch, opts.retryDelayMs ?? 1000);
    let uploaded = 0;
    for (const file of await sealedHours(dir)) {
        const manifest = await readManifest(file);
        if (manifest.b2) continue;
        // A copy backed by a plain ArrayBuffer, which every fetch body type accepts.
        const body = new Uint8Array(await readFile(file));
        if (digest("sha256", body) !== manifest.sha256)
            throw new RawArchiveError(
                `${file} does not match its manifest checksum; not uploaded.`,
            );
        const fileName = `${b2.prefix}${file.slice(dir.length + 1).replaceAll("\\", "/")}`;
        const fileId = await uploader.upload(fileName, body, manifest);
        await writeManifest(`${file}.json`, {
            ...manifest,
            b2: { fileName, fileId, uploadedAt: Date.now() },
        });
        uploaded++;
    }
    return uploaded;
}

/** Seals finished hours, then uploads any sealed hour without a B2 copy. */
export async function maintainRawArchive(opts: RawArchiveOptions, now = Date.now()) {
    const sealed = await sealRawHours(opts.dir, now);
    const uploaded = opts.b2 ? await uploadRawHours(opts.dir, opts.b2) : 0;
    return { sealed: sealed.map((m) => m.hour), uploaded };
}
