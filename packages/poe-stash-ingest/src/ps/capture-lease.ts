import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import {
    CAPTURE_LEASE_MS,
    CAPTURE_LEASE_RENEW_MS,
    CAPTURE_SEGMENT_HEADER,
    type CaptureLeaseRequest,
    type CaptureSegment,
    captureLeaseResponseSchema,
    captureSegmentListSchema,
    captureSegmentSchema,
} from "@poe-tools/market/capture-lease";
import { writeCaptureState } from "#src/ps/capture.ts";
import { appendRawLines, spooledHourCount, zstdLines } from "#src/ps/raw-archive.ts";
import { failureMessage } from "#src/shared/watch.ts";

/**
 * Home's side of the capture lease (`@poe-tools/market/capture-lease`, served by
 * `apps/capture-lease`). Home fetches only while it holds the lease. When a fallback has held it,
 * home appends the fallback's segments to its spool, in order, before it fetches again, so the
 * archive stays one stream in capture order.
 */

const IMPORT_STATE_FILE = "import-state.json";
const IMPORT_POLL_MS = 2000;
// Import stops while this many hours wait to be sealed, so a long outage cannot fill the disk.
const IMPORT_MAX_SPOOLED_HOURS = 4;
const IMPORT_WAIT_MS = 5000;
const REQUEST_TIMEOUT_MS = 30_000;
const TRANSFER_TIMEOUT_MS = 300_000;

export class CaptureLeaseError extends Error {
    readonly status: number | undefined;
    constructor(message: string, status?: number) {
        super(message);
        this.status = status;
    }
}

export type LeaseApi = ReturnType<typeof createLeaseApi>;

export function createLeaseApi(options: { url: string; token: string; fetch?: typeof fetch }) {
    const base = options.url.replace(/\/+$/, "");
    const fetchFn = options.fetch ?? fetch;
    const call = async (path: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS) => {
        const res = await fetchFn(`${base}${path}`, {
            ...init,
            headers: { authorization: `Bearer ${options.token}`, ...init.headers },
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok)
            throw new CaptureLeaseError(
                `Capture lease ${init.method ?? "GET"} ${path} failed: HTTP ${res.status}`,
                res.status,
            );
        return res;
    };
    return {
        async lease(request: CaptureLeaseRequest) {
            const res = await call("/lease", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(request),
            });
            return captureLeaseResponseSchema.parse(await res.json());
        },
        /** Segments after `after`, oldest first, a page at a time. */
        async list(after: string | null) {
            const query = after === null ? "" : `?after=${encodeURIComponent(after)}`;
            const res = await call(`/segments${query}`, { method: "GET" });
            return captureSegmentListSchema.parse(await res.json());
        },
        async download(segment: CaptureSegment) {
            const res = await call(
                `/segments/${segment.key}`,
                { method: "GET" },
                TRANSFER_TIMEOUT_MS,
            );
            const body = Buffer.from(await res.arrayBuffer());
            if (
                body.length !== segment.bytes ||
                createHash("sha256").update(body).digest("hex") !== segment.sha256
            )
                throw new CaptureLeaseError(`Segment ${segment.key} does not match its checksum.`);
            return body;
        },
        /** `body` is backed by a plain ArrayBuffer, which every fetch body type accepts. */
        async upload(segment: CaptureSegment, body: Uint8Array<ArrayBuffer>) {
            await call(
                `/segments/${segment.key}`,
                {
                    method: "PUT",
                    headers: {
                        "content-type": "application/zstd",
                        [CAPTURE_SEGMENT_HEADER]: JSON.stringify(
                            captureSegmentSchema.parse(segment),
                        ),
                    },
                    body,
                },
                TRANSFER_TIMEOUT_MS,
            );
        },
        async remove(key: string) {
            await call(`/segments/${key}`, { method: "DELETE" });
        },
    };
}

/** CAPTURE_LEASE_URL turns the lease on; it needs CAPTURE_LEASE_TOKEN. */
export function captureLeaseSettings(env = process.env) {
    if (!env.CAPTURE_LEASE_URL) return undefined;
    if (!env.CAPTURE_LEASE_TOKEN) throw new Error("CAPTURE_LEASE_URL needs CAPTURE_LEASE_TOKEN.");
    const role = env.CAPTURE_LEASE_ROLE ?? "home";
    if (role !== "home" && role !== "fallback")
        throw new Error("CAPTURE_LEASE_ROLE must be home or fallback.");
    return { url: env.CAPTURE_LEASE_URL, token: env.CAPTURE_LEASE_TOKEN, role };
}

interface ImportState {
    imported: string | null;
}

async function readImportState(dir: string): Promise<ImportState> {
    const text = await readFile(join(dir, IMPORT_STATE_FILE), "utf8").catch(
        (error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return undefined;
            throw error;
        },
    );
    return text === undefined ? { imported: null } : (JSON.parse(text) as ImportState);
}

async function writeImportState(dir: string, state: ImportState) {
    const path = join(dir, IMPORT_STATE_FILE);
    await mkdir(dir, { recursive: true });
    const fh = await open(`${path}.tmp`, "w");
    try {
        await fh.write(JSON.stringify(state));
        await fh.datasync();
    } finally {
        await fh.close();
    }
    await rename(`${path}.tmp`, path);
}

/**
 * Appends every segment after `after`, up to and including `upTo`, to the spool, oldest first,
 * and returns the last one appended. A segment is recorded as imported only once all its pages
 * are synced, so a crash part-way repeats at most that segment's pages.
 */
export async function importSegments(options: {
    api: LeaseApi;
    dir: string;
    after: string | null;
    upTo: string;
    signal: AbortSignal;
    onImported?: (key: string) => void;
    maxSpooledHours?: number;
    waitMs?: number;
}) {
    const { api, dir, upTo, signal } = options;
    const maxSpooledHours = options.maxSpooledHours ?? IMPORT_MAX_SPOOLED_HOURS;
    let last = options.after;
    while (!signal.aborted && (last === null || last < upTo)) {
        const { segments, more } = await api.list(last);
        for (const segment of segments) {
            if (segment.key > upTo || signal.aborted) return last;
            // Sealing runs alongside; wait for it rather than spool the whole outage at once.
            while (!signal.aborted && (await spooledHourCount(dir)) >= maxSpooledHours)
                await setTimeout(options.waitMs ?? IMPORT_WAIT_MS, undefined, { signal }).catch(
                    () => undefined,
                );
            if (signal.aborted) return last;
            const body = await api.download(segment);
            const pages = await appendRawLines(dir, zstdLines([body]));
            if (pages !== segment.pages)
                throw new CaptureLeaseError(
                    `Segment ${segment.key} had ${pages} pages; it was uploaded with ${segment.pages}.`,
                );
            await writeImportState(dir, { imported: segment.key });
            last = segment.key;
            options.onImported?.(segment.key);
            console.log(`capture lease: imported segment ${segment.key} (${pages} pages)`);
        }
        if (!more || !segments.length) return last;
    }
    return last;
}

export type HomeLease = ReturnType<typeof createHomeLease>;

/**
 * Renews home's lease while `run` runs. `holding` says whether capture may fetch; it turns false
 * once a renewal is `leaseMs` old, before anyone else can be given the lease.
 */
export function createHomeLease(options: {
    api: LeaseApi;
    dir: string;
    renewMs?: number;
    leaseMs?: number;
    importPollMs?: number;
    maxSpooledHours?: number;
    importWaitMs?: number;
}) {
    const { api, dir } = options;
    const renewMs = options.renewMs ?? CAPTURE_LEASE_RENEW_MS;
    const leaseMs = options.leaseMs ?? CAPTURE_LEASE_MS;
    let epoch: number | undefined;
    let expiresAt = 0;
    let cursor: string | null | undefined;
    let handover: string | null | undefined;
    let state: "unknown" | "hold" | "import" = "unknown";
    // Imported segments are deleted once a renewal has reported them; the Worker refuses earlier.
    let toDelete: string[] = [];

    const holding = () => epoch !== undefined && Date.now() < expiresAt;
    let failing = false;

    async function run(signal: AbortSignal) {
        const pause = (ms: number) => setTimeout(ms, undefined, { signal }).catch(() => undefined);
        let imported = (await readImportState(dir)).imported;
        const request = () => ({
            holder: "home" as const,
            ...(epoch !== undefined && { epoch }),
            ...(cursor !== undefined && { cursor }),
            imported,
        });
        const hold = async (response: { epoch: number; from?: string | null }, sentAt: number) => {
            if (response.from !== undefined) {
                // The fallback handed the stream back: continue where it stopped.
                await writeCaptureState(dir, { cursor: response.from });
                handover = response.from;
                cursor = response.from;
                console.log(`capture lease: holding again from the fallback's last page`);
            } else if (state !== "hold") console.log("capture lease: holding");
            epoch = response.epoch;
            expiresAt = sentAt + leaseMs;
            state = "hold";
        };
        while (!signal.aborted) {
            const sentAt = Date.now();
            let response: Awaited<ReturnType<LeaseApi["lease"]>>;
            try {
                response = await api.lease(request());
                if (failing) console.log("capture lease: renewals resumed");
                failing = false;
            } catch (error) {
                if (!failing)
                    console.error(
                        `capture lease: renewal failed; capture stops once the lease lapses: ${failureMessage(error)}`,
                    );
                failing = true;
                await pause(renewMs);
                continue;
            }
            const reported = imported;
            const deletable = toDelete.filter((key) => reported !== null && key <= reported);
            toDelete = toDelete.filter((key) => !deletable.includes(key));
            for (const key of deletable)
                await api.remove(key).catch((error: unknown) => {
                    console.error(
                        `capture lease: could not delete ${key}: ${failureMessage(error)}`,
                    );
                });

            if (response.state === "hold") {
                await hold(response, sentAt);
                await pause(renewMs);
                continue;
            }
            epoch = undefined;
            if (response.state !== "import") {
                await pause(renewMs);
                continue;
            }
            if (state !== "import")
                console.log("capture lease: a fallback holds the lease; importing its pages");
            state = "import";
            const before = imported;
            if (response.segment !== null) {
                // An import can wait minutes for sealing. Home keeps asking meanwhile, so the Worker
                // knows it is still here; it answers `hold` once home has imported every segment.
                const importing = new AbortController();
                const stopImport = () => importing.abort();
                signal.addEventListener("abort", stopImport, { once: true });
                let held: { epoch: number; from?: string | null; sentAt: number } | undefined;
                const checkIns = (async () => {
                    while (!importing.signal.aborted) {
                        await setTimeout(renewMs, undefined, { signal: importing.signal }).catch(
                            () => undefined,
                        );
                        if (importing.signal.aborted) return;
                        const askedAt = Date.now();
                        const answer = await api.lease(request()).catch(() => undefined);
                        if (answer?.state !== "hold") continue;
                        held = { ...answer, sentAt: askedAt };
                        importing.abort();
                    }
                })();
                try {
                    imported = await importSegments({
                        api,
                        dir,
                        after: imported,
                        upTo: response.segment,
                        signal: importing.signal,
                        onImported: (key) => {
                            imported = key;
                            toDelete.push(key);
                        },
                        maxSpooledHours: options.maxSpooledHours,
                        waitMs: options.importWaitMs,
                    });
                } catch (error) {
                    console.error(`capture lease: import failed: ${failureMessage(error)}`);
                    await pause(renewMs);
                } finally {
                    importing.abort();
                    signal.removeEventListener("abort", stopImport);
                    // A check-in still in flight may bring the lease back.
                    await checkIns;
                }
                if (held) {
                    await hold(held, held.sentAt);
                    await pause(renewMs);
                    continue;
                }
            }
            await pause(imported !== before ? 0 : (options.importPollMs ?? IMPORT_POLL_MS));
        }
    }

    return {
        run,
        holding,
        failing: () => failing,
        /** A cursor to continue from, once, after the fallback handed the stream back. */
        takeHandover() {
            const next = handover;
            handover = undefined;
            return next;
        },
        /** The cursor after the latest synced page: where a fallback would continue. */
        synced(next: string | null) {
            cursor = next;
        },
    };
}
