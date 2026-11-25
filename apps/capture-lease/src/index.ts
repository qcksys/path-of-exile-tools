import { DurableObject } from "cloudflare:workers";
import {
    CAPTURE_SEGMENT_HEADER,
    type CaptureLeaseState,
    type CaptureSegment,
    captureLeaseRequestSchema,
    captureLeaseStateSchema,
    captureSegmentEpoch,
    captureSegmentKeySchema,
    captureSegmentSchema,
    checkCaptureLease,
    decideCaptureLease,
    initialCaptureLeaseState,
} from "@poe-tools/market/capture-lease";

interface Secrets {
    CAPTURE_LEASE_TOKEN?: string;
    POE_CLIENT_ID: string;
    POE_CLIENT_SECRET: string;
    POE_USER_AGENT_CONTACT: string;
    POE_CLIENT_VERSION?: string;
    POE_BOATS_INGEST_TOKEN: string;
}
type LeaseEnv = Env & Secrets;

const CHECK_MS = 30_000;
// Renewals arrive every 10 s; this only stops a Container whose Durable Object went quiet.
const INACTIVITY_MS = 10 * 60_000;
const SIGTERM = 15;
const STATE_KEY = "lease";
const ORIGIN_KEY = "origin";
const SEGMENT_PREFIX = "segments/";
const SEGMENT_PATH = /^\/segments\/(\d{10}\/\d{6})$/;
const LIST_LIMIT = 500;

const sha256Hex = async (data: ArrayBuffer | ArrayBufferView) =>
    [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");

async function authorized(request: Request, token: string) {
    const given = request.headers.get("authorization") ?? "";
    const encoder = new TextEncoder();
    // Digests have the same length, which timingSafeEqual requires.
    const [a, b] = await Promise.all([
        crypto.subtle.digest("SHA-256", encoder.encode(given)),
        crypto.subtle.digest("SHA-256", encoder.encode(`Bearer ${token}`)),
    ]);
    return crypto.subtle.timingSafeEqual(a, b);
}

const error = (status: number, message: string) => Response.json({ error: message }, { status });

export default {
    async fetch(request, env) {
        if (!env.CAPTURE_LEASE_TOKEN) return error(503, "CAPTURE_LEASE_TOKEN is not set.");
        if (!(await authorized(request, env.CAPTURE_LEASE_TOKEN)))
            return error(401, "Unauthorized");
        // One stream, so one lease: only PC has a public stash stream.
        return env.CAPTURE_LEASE.getByName("pc").fetch(request);
    },
} satisfies ExportedHandler<LeaseEnv>;

/**
 * Holds the capture lease, starts and stops the fallback Container, and stores the fallback's
 * segments until home has imported them. Each lease decision is a pure function in
 * `@poe-tools/market/capture-lease`; this class stores its state and acts on it.
 */
export class CaptureLease extends DurableObject<LeaseEnv> {
    constructor(ctx: DurableObjectState, env: LeaseEnv) {
        super(ctx, env);
        const container = ctx.container;
        if (container?.running) {
            void ctx.blockConcurrencyWhile(() => container.setInactivityTimeout(INACTIVITY_MS));
            this.watch(container);
        }
    }

    async fetch(request: Request) {
        const url = new URL(request.url);
        if (url.pathname === "/lease" && request.method === "POST") return this.lease(request, url);
        if (url.pathname === "/status" && request.method === "GET")
            return Response.json({ ...(await this.load()), fallbackRunning: this.running() });
        if (url.pathname === "/segments" && request.method === "GET") return this.list(url);
        const key = SEGMENT_PATH.exec(url.pathname)?.[1];
        if (key && request.method === "PUT") return this.putSegment(key, request);
        if (key && request.method === "GET") return this.getSegment(key);
        if (key && request.method === "DELETE") return this.deleteSegment(key);
        return error(404, "Not found");
    }

    async alarm() {
        const now = Date.now();
        const { state, start, stop } = checkCaptureLease(await this.load(), now, this.running());
        await this.ctx.storage.put(STATE_KEY, state);
        if (stop) await this.stop(stop);
        if (start) await this.start();
        await this.ctx.storage.setAlarm(now + CHECK_MS);
    }

    private async load(): Promise<CaptureLeaseState> {
        const stored = await this.ctx.storage.get(STATE_KEY);
        return stored === undefined
            ? initialCaptureLeaseState
            : captureLeaseStateSchema.parse(stored);
    }

    private running() {
        return this.ctx.container?.running ?? false;
    }

    private async lease(request: Request, url: URL) {
        const parsed = captureLeaseRequestSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return error(400, "Invalid lease request");
        const { state, response, stopFallback } = decideCaptureLease(
            await this.load(),
            parsed.data,
            Date.now(),
        );
        await this.ctx.storage.put(STATE_KEY, state);
        // The fallback reaches this Worker at the address home uses.
        if (parsed.data.holder === "home") await this.ctx.storage.put(ORIGIN_KEY, url.origin);
        if ((await this.ctx.storage.getAlarm()) === null)
            await this.ctx.storage.setAlarm(Date.now() + CHECK_MS);
        if (stopFallback) {
            await this.stop("signal");
            await this.discardAfter(state.segment);
        }
        return Response.json(response);
    }

    /**
     * Deletes segments after the last one the fallback reported. Home has the lease back, so they
     * belong to a fallback that stopped before reporting them, and their pages are older than
     * anything home captures next.
     */
    private async discardAfter(key: string | null) {
        for (;;) {
            const listed = await this.env.SEGMENTS.list({
                prefix: SEGMENT_PREFIX,
                limit: LIST_LIMIT,
                ...(key !== null && { startAfter: `${SEGMENT_PREFIX}${key}` }),
            });
            if (!listed.objects.length) return;
            await this.env.SEGMENTS.delete(listed.objects.map((object) => object.key));
            console.log(`Discarded ${listed.objects.length} unreported fallback segments`);
            if (!listed.truncated) return;
        }
    }

    private async start() {
        const container = this.ctx.container;
        const origin = await this.ctx.storage.get<string>(ORIGIN_KEY);
        if (!container || !origin || container.running) return;
        const image = container.images.capture;
        if (!image) {
            console.error("wrangler.jsonc names no `capture` image for the fallback");
            return;
        }
        const env = this.env;
        container.start({
            image,
            // Fetching and zstd level 3 take well under a core; segments stay below 300 MB of disk.
            instance: { vcpu: 1, memoryMib: 3072, diskMb: 4000 },
            enableInternet: true,
            entrypoint: ["node", "src/container.ts", "capture"],
            env: {
                POE_CLIENT_ID: env.POE_CLIENT_ID,
                POE_CLIENT_SECRET: env.POE_CLIENT_SECRET,
                POE_USER_AGENT_CONTACT: env.POE_USER_AGENT_CONTACT,
                POE_CLIENT_VERSION: env.POE_CLIENT_VERSION ?? "0.0.0",
                POE_REALM: "pc",
                POE_BOATS_INGEST_URL: env.POE_BOATS_INGEST_URL,
                POE_BOATS_INGEST_TOKEN: env.POE_BOATS_INGEST_TOKEN,
                INGEST_WORKER_ID: env.INGEST_WORKER_ID,
                PS_RAW_ARCHIVE_DIR: "/backups/raw",
                CAPTURE_LEASE_ROLE: "fallback",
                CAPTURE_LEASE_URL: origin,
                CAPTURE_LEASE_TOKEN: env.CAPTURE_LEASE_TOKEN ?? "",
            },
        });
        await container.setInactivityTimeout(INACTIVITY_MS);
        this.watch(container);
        console.log("Started the fallback capture Container");
    }

    private async stop(how: "signal" | "destroy") {
        const container = this.ctx.container;
        if (!container?.running) return;
        if (how === "signal") container.signal(SIGTERM);
        else await container.destroy("The fallback stopped renewing its lease.");
    }

    private watch(container: Container) {
        this.ctx.waitUntil(
            container
                .monitor()
                .then(() => console.log("The fallback capture Container exited"))
                .catch((cause: unknown) =>
                    console.error("The fallback capture Container failed", cause),
                ),
        );
    }

    private async putSegment(key: string, request: Request) {
        const header = request.headers.get(CAPTURE_SEGMENT_HEADER);
        const described = captureSegmentSchema.safeParse(header ? JSON.parse(header) : null);
        if (!described.success || described.data.key !== key)
            return error(400, `Send the segment's description in ${CAPTURE_SEGMENT_HEADER}.`);
        const current = async () => {
            const state = await this.load();
            return (
                state.holder === "fallback" &&
                !state.released &&
                state.epoch === captureSegmentEpoch(key)
            );
        };
        if (!(await current())) return error(409, "This epoch no longer holds the lease.");
        const body = await request.arrayBuffer();
        if (
            body.byteLength !== described.data.bytes ||
            (await sha256Hex(body)) !== described.data.sha256
        )
            return error(400, "The segment does not match its description.");
        // The lease may have moved on while the body arrived.
        if (!(await current())) return error(409, "This epoch no longer holds the lease.");
        await this.env.SEGMENTS.put(`${SEGMENT_PREFIX}${key}`, body, {
            sha256: described.data.sha256,
            customMetadata: { segment: JSON.stringify(described.data) },
        });
        return new Response(null, { status: 201 });
    }

    private async list(url: URL) {
        const after = url.searchParams.get("after");
        if (after !== null && !captureSegmentKeySchema.safeParse(after).success)
            return error(400, "after must be a segment key.");
        const listed = await this.env.SEGMENTS.list({
            prefix: SEGMENT_PREFIX,
            limit: LIST_LIMIT,
            include: ["customMetadata"],
            ...(after !== null && { startAfter: `${SEGMENT_PREFIX}${after}` }),
        });
        const segments: CaptureSegment[] = listed.objects.map((object) =>
            captureSegmentSchema.parse(JSON.parse(object.customMetadata?.segment ?? "null")),
        );
        return Response.json({ segments, more: listed.truncated });
    }

    private async getSegment(key: string) {
        const object = await this.env.SEGMENTS.get(`${SEGMENT_PREFIX}${key}`);
        if (!object) return error(404, "No such segment");
        return new Response(object.body, {
            headers: {
                "content-type": "application/zstd",
                [CAPTURE_SEGMENT_HEADER]: object.customMetadata?.segment ?? "",
            },
        });
    }

    private async deleteSegment(key: string) {
        const { imported } = await this.load();
        // Only a segment home has appended to its archive.
        if (imported === null || key > imported) return error(409, "Home has not imported it.");
        await this.env.SEGMENTS.delete(`${SEGMENT_PREFIX}${key}`);
        return new Response(null, { status: 204 });
    }
}
