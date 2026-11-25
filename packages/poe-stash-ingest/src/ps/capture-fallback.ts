import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { type FileHandle, mkdir, open, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { setTimeout } from "node:timers/promises";
import { constants, createZstdCompress } from "node:zlib";
import type { PoeApiClient, RateLimitInfo, Realm } from "@poe-tools/api-client";
import type { IngestStatus } from "@poe-tools/market";
import {
    CAPTURE_LEASE_MS,
    CAPTURE_LEASE_RENEW_MS,
    type CaptureLeaseRequest,
    type CaptureLeaseResponse,
    type CaptureSegment,
    captureSegmentKey,
} from "@poe-tools/market/capture-lease";
import { type CapturedPage, runCapture, writeCaptureState } from "#src/ps/capture.ts";
import { CaptureLeaseError, type LeaseApi } from "#src/ps/capture-lease.ts";
import { rawLine } from "#src/ps/raw-archive.ts";
import { failureMessage } from "#src/shared/watch.ts";

/**
 * Capture in the fallback Container, which runs while home is silent. It fetches only while it
 * holds the lease. The Container's disk does not outlive it, so pages go to short segments: each
 * is compressed and uploaded to the lease Worker, and only then is its last cursor reported as the
 * place to continue. A Container that dies loses at most the segments it had not uploaded; the
 * next holder fetches those stream positions again.
 */

const SEGMENT_BYTES = 256 * 1024 * 1024;
const SEGMENT_MS = 5 * 60_000;
// Fast, with sealed hours' long window: home recompresses the pages when it seals their hour.
const SEGMENT_ZSTD = {
    [constants.ZSTD_c_compressionLevel]: 3,
    [constants.ZSTD_c_enableLongDistanceMatching]: 1,
    [constants.ZSTD_c_windowLog]: 27,
    [constants.ZSTD_c_checksumFlag]: 1,
};
const RETRY_MS = 1000;
const MAX_RETRY_MS = 30_000;

interface OpenSegment {
    path: string;
    fh: FileHandle;
    bytes: number;
    pages: number;
    firstCapturedAt: number;
    lastCapturedAt: number;
    lastCursor: string;
    startedAt: number;
}

/**
 * Writes pages to numbered segments, cut at `maxBytes` or `maxAgeMs`, and uploads them one at a
 * time in order. `durable` is the latest uploaded segment and the cursor after its last page.
 */
export function createSegmentWriter(options: {
    dir: string;
    epoch: number;
    api: LeaseApi;
    maxBytes?: number;
    maxAgeMs?: number;
    retryMs?: number;
}) {
    const { dir, epoch, api } = options;
    const maxBytes = options.maxBytes ?? SEGMENT_BYTES;
    const maxAgeMs = options.maxAgeMs ?? SEGMENT_MS;
    const retryMs = options.retryMs ?? RETRY_MS;
    let sequence = 0;
    let current: OpenSegment | undefined;
    let uploads = Promise.resolve();
    let failure: unknown;
    let durable: { cursor: string; segment: string } | undefined;

    async function upload(done: OpenSegment, key: string) {
        const compressed = `${done.path}.zst`;
        await pipeline(
            createReadStream(done.path),
            createZstdCompress({ params: SEGMENT_ZSTD }),
            createWriteStream(compressed),
        );
        // A copy backed by a plain ArrayBuffer, which every fetch body type accepts.
        const body = new Uint8Array(await readFile(compressed));
        const segment: CaptureSegment = {
            key,
            sha256: createHash("sha256").update(body).digest("hex"),
            bytes: body.length,
            pages: done.pages,
            firstCapturedAt: done.firstCapturedAt,
            lastCapturedAt: done.lastCapturedAt,
            lastCursor: done.lastCursor,
        };
        for (let attempt = 0; ; attempt++) {
            try {
                await api.upload(segment, body);
                break;
            } catch (error) {
                // The lease moved on: nothing this process uploads will be accepted.
                if (error instanceof CaptureLeaseError && error.status === 409) throw error;
                const delay = Math.min(retryMs * 2 ** attempt, MAX_RETRY_MS);
                console.error(
                    `capture fallback: upload of ${key} failed; retrying in ${delay} ms: ${failureMessage(error)}`,
                );
                await setTimeout(delay);
            }
        }
        durable = { cursor: done.lastCursor, segment: key };
        await rm(done.path, { force: true });
        await rm(compressed, { force: true });
        console.log(
            `capture fallback: uploaded ${key} (${done.pages} pages, ${body.length} bytes)`,
        );
    }

    async function cut() {
        const done = current;
        if (!done) return;
        current = undefined;
        await done.fh.close();
        const key = captureSegmentKey(epoch, sequence++);
        uploads = uploads
            .then(() => (failure === undefined ? upload(done, key) : undefined))
            .catch((error: unknown) => {
                failure ??= error;
            });
    }

    return {
        async append({ capturedAt, cursor, page }: CapturedPage) {
            if (failure !== undefined) throw failure;
            const line = `${rawLine(capturedAt, cursor ?? null, page)}\n`;
            if (!current) {
                const path = join(dir, "segments", `${sequence}.ndjson`);
                await mkdir(join(dir, "segments"), { recursive: true });
                current = {
                    path,
                    // No sync: the disk does not outlive the Container, only uploads count.
                    fh: await open(path, "w"),
                    bytes: 0,
                    pages: 0,
                    firstCapturedAt: capturedAt,
                    lastCapturedAt: capturedAt,
                    lastCursor: page.next_change_id,
                    startedAt: Date.now(),
                };
            }
            await current.fh.write(line);
            current.bytes += Buffer.byteLength(line);
            current.pages++;
            current.lastCapturedAt = capturedAt;
            current.lastCursor = page.next_change_id;
            if (current.bytes >= maxBytes) await cut();
        },
        /** Cuts a segment that has been open for `maxAgeMs`. */
        async tick() {
            if (current && Date.now() - current.startedAt >= maxAgeMs) await cut();
            if (failure !== undefined) throw failure;
        },
        /** Cuts the open segment and waits until every segment is uploaded. */
        async flush() {
            await cut();
            await uploads;
            if (failure !== undefined) throw failure;
        },
        durable: () => durable,
    };
}

export async function runFallbackCapture(
    client: PoeApiClient,
    opts: {
        dir: string;
        api: LeaseApi;
        signal: AbortSignal;
        realm?: Realm;
        onStatus?: (patch: Partial<IngestStatus>) => Promise<void>;
        rateLimit?: () => RateLimitInfo | undefined;
        renewMs?: number;
        leaseMs?: number;
        segmentBytes?: number;
        segmentMs?: number;
        retryMs?: number;
        requestSpacingMs?: number;
        headPollMs?: number;
        errorDelayMs?: number;
        leasePollMs?: number;
    },
) {
    const { api, dir, signal } = opts;
    const renewMs = opts.renewMs ?? CAPTURE_LEASE_RENEW_MS;
    const leaseMs = opts.leaseMs ?? CAPTURE_LEASE_MS;
    const retryMs = opts.retryMs ?? RETRY_MS;
    const pause = (ms: number) => setTimeout(ms, undefined, { signal }).catch(() => undefined);

    // A new process gets a new epoch and the last cursor its predecessor made durable.
    let taken: { response: CaptureLeaseResponse; sentAt: number } | undefined;
    while (!signal.aborted && !taken) {
        const sentAt = Date.now();
        try {
            taken = { response: await api.lease({ holder: "fallback" }), sentAt };
        } catch (error) {
            console.error(`capture fallback: could not reach the lease: ${failureMessage(error)}`);
            await pause(renewMs);
        }
    }
    if (taken?.response.state !== "hold") {
        console.log("capture fallback: the lease is not this process's to hold; exiting");
        return { pages: 0, released: false };
    }
    const { epoch } = taken.response;
    let expiresAt = taken.sentAt + leaseMs;
    await writeCaptureState(dir, { cursor: taken.response.from ?? null });
    console.log(`capture fallback: holding the lease in epoch ${epoch}`);

    const segments = createSegmentWriter({
        dir,
        epoch,
        api,
        maxBytes: opts.segmentBytes,
        maxAgeMs: opts.segmentMs,
        retryMs,
    });
    const fetching = new AbortController();
    const stopFetching = () => fetching.abort();
    signal.addEventListener("abort", stopFetching, { once: true });
    let releasing = false;
    const capture = runCapture(client, {
        archive: { dir },
        realm: opts.realm,
        signal: fetching.signal,
        onStatus: opts.onStatus,
        rateLimit: opts.rateLimit,
        requestSpacingMs: opts.requestSpacingMs,
        headPollMs: opts.headPollMs,
        errorDelayMs: opts.errorDelayMs,
        leasePollMs: opts.leasePollMs,
        lease: {
            holding: () => !releasing && Date.now() < expiresAt,
            takeHandover: () => undefined,
            synced: () => {},
        },
        store: (page) => segments.append(page),
        maintain: async () => {
            await segments.tick();
            return { sealed: [], uploaded: 0 };
        },
    });

    const progress = (): CaptureLeaseRequest => {
        const durable = segments.durable();
        return {
            holder: "fallback",
            epoch,
            ...(durable && { cursor: durable.cursor, segment: durable.segment }),
        };
    };

    // Renew until home wants the stream back, the lease is lost, or the Container is stopped.
    let outcome: "release" | "stop" | "signal" = "signal";
    let failing = false;
    while (!signal.aborted) {
        await pause(renewMs);
        if (signal.aborted) break;
        const sentAt = Date.now();
        let response: CaptureLeaseResponse;
        try {
            response = await api.lease(progress());
            failing = false;
        } catch (error) {
            if (!failing)
                console.error(
                    `capture fallback: renewal failed; fetching stops once the lease lapses: ${failureMessage(error)}`,
                );
            failing = true;
            continue;
        }
        if (response.state === "hold") {
            expiresAt = sentAt + leaseMs;
            continue;
        }
        outcome = response.state === "release" ? "release" : "stop";
        break;
    }
    releasing = true;
    fetching.abort();
    signal.removeEventListener("abort", stopFetching);
    const { pages } = await capture;
    if (outcome === "stop") {
        console.log("capture fallback: home holds the lease again; exiting");
        return { pages, released: false };
    }

    // Upload every page fetched, then report where the next holder continues.
    await segments.flush();
    for (let attempt = 0; ; attempt++) {
        try {
            await api.lease({ ...progress(), ...(outcome === "release" && { released: true }) });
            break;
        } catch (error) {
            // Stopped by the platform, a later process continues from the last report anyway.
            if (outcome === "signal" && attempt >= 4) throw error;
            await setTimeout(Math.min(retryMs * 2 ** attempt, MAX_RETRY_MS));
        }
    }
    console.log(
        outcome === "release"
            ? "capture fallback: handed the stream back to home"
            : "capture fallback: stopped after uploading every page",
    );
    return { pages, released: outcome === "release" };
}
