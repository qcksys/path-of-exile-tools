import { z } from "zod";

/**
 * Who captures the public stash stream. Home captures by default; a fallback Container captures
 * while home is silent. Only the holder fetches, so the stream is read once and its pages stay in
 * capture order, and each new holder continues from the last cursor its predecessor made durable.
 * The fallback's pages go to segments, which home appends to its archive before it fetches again.
 */

/** How long a holder may keep fetching after its last successful renewal. */
export const CAPTURE_LEASE_MS = 60_000;
/** Extra wait before the lease passes to another holder, so clocks a little apart never overlap. */
export const CAPTURE_LEASE_GRACE_MS = 15_000;
export const CAPTURE_LEASE_RENEW_MS = 10_000;
/** How long a newly started fallback has to make its first renewal. */
export const CAPTURE_FALLBACK_START_MS = 180_000;

export const captureHolderSchema = z.enum(["home", "fallback"]);
export type CaptureHolder = z.infer<typeof captureHolderSchema>;

const cursorSchema = z.string().min(1).max(1000).nullable();

/** `<epoch>/<sequence>`, zero-padded so that keys sort in capture order. */
export const captureSegmentKeySchema = z.string().regex(/^\d{10}\/\d{6}$/);

export function captureSegmentKey(epoch: number, sequence: number) {
    return `${String(epoch).padStart(10, "0")}/${String(sequence).padStart(6, "0")}`;
}

export const captureSegmentEpoch = (key: string) => Number(key.slice(0, 10));

/** One uploaded run of fallback pages: zstd-compressed raw archive lines. */
export const captureSegmentSchema = z.object({
    key: captureSegmentKeySchema,
    /** SHA-256 of the compressed file. */
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    bytes: z.number().int().positive(),
    pages: z.number().int().positive(),
    firstCapturedAt: z.number().int().nonnegative(),
    lastCapturedAt: z.number().int().nonnegative(),
    /** The cursor after the segment's last page: where the next holder continues. */
    lastCursor: z.string().min(1).max(1000),
});
export type CaptureSegment = z.infer<typeof captureSegmentSchema>;

/** Carries a segment's `CaptureSegment` description, as JSON, on its upload and download. */
export const CAPTURE_SEGMENT_HEADER = "x-capture-segment";

export const captureSegmentListSchema = z.object({
    segments: z.array(captureSegmentSchema),
    /** More segments follow the last one listed. */
    more: z.boolean(),
});

export const captureLeaseRequestSchema = z.object({
    holder: captureHolderSchema,
    /** The epoch the caller holds; a fallback that has just started omits it. */
    epoch: z.number().int().positive().optional(),
    /** Where the next holder continues: home's last synced page, the fallback's last uploaded one. */
    cursor: cursorSchema.optional(),
    /** Fallback: the latest segment it uploaded. */
    segment: captureSegmentKeySchema.optional(),
    /** Home: the last segment it appended to its archive. */
    imported: captureSegmentKeySchema.nullable().optional(),
    /** Fallback: it has stopped fetching and uploaded every page it fetched. */
    released: z.boolean().optional(),
});
export type CaptureLeaseRequest = z.infer<typeof captureLeaseRequestSchema>;

export const captureLeaseResponseSchema = z.discriminatedUnion("state", [
    z.object({
        state: z.literal("hold"),
        epoch: z.number().int().positive(),
        /** Present when the holder must continue from this cursor instead of its own. */
        from: cursorSchema.optional(),
    }),
    /** Home: append every segment up to this one, then report it as `imported`. */
    z.object({ state: z.literal("import"), segment: captureSegmentKeySchema.nullable() }),
    /** Fallback: stop fetching, upload every page, then report `released`. */
    z.object({ state: z.literal("release") }),
    /** Fallback: exit; it no longer holds the lease. */
    z.object({ state: z.literal("stop") }),
]);
export type CaptureLeaseResponse = z.infer<typeof captureLeaseResponseSchema>;

export const captureLeaseStateSchema = z.object({
    holder: captureHolderSchema.nullable(),
    epoch: z.number().int().nonnegative(),
    cursor: cursorSchema,
    /** When the holder's lease lapses unless it renews. */
    expiresAt: z.number(),
    /** The latest segment the fallback uploaded. */
    segment: captureSegmentKeySchema.nullable(),
    /** The last segment home appended to its archive. */
    imported: captureSegmentKeySchema.nullable(),
    /** Home has asked for the lease back. */
    homeWaiting: z.boolean(),
    /** The fallback has stopped, or is gone, and will upload nothing more. */
    released: z.boolean(),
});
export type CaptureLeaseState = z.infer<typeof captureLeaseStateSchema>;

export const initialCaptureLeaseState: CaptureLeaseState = {
    holder: null,
    epoch: 0,
    cursor: null,
    expiresAt: 0,
    segment: null,
    imported: null,
    homeWaiting: false,
    released: false,
};

/** Answers one holder's request. `stopFallback` asks for the fallback Container to be stopped. */
export function decideCaptureLease(
    state: CaptureLeaseState,
    request: CaptureLeaseRequest,
    now: number,
): { state: CaptureLeaseState; response: CaptureLeaseResponse; stopFallback?: boolean } {
    if (request.holder === "home") {
        const imported = request.imported === undefined ? state.imported : request.imported;
        if (state.holder !== "fallback") {
            const epoch = state.holder === "home" ? state.epoch : state.epoch + 1;
            return {
                state: {
                    ...state,
                    holder: "home",
                    epoch,
                    cursor: request.cursor === undefined ? state.cursor : request.cursor,
                    expiresAt: now + CAPTURE_LEASE_MS,
                    imported,
                    homeWaiting: false,
                },
                response: { state: "hold", epoch },
            };
        }
        const gone = state.released || now > state.expiresAt + CAPTURE_LEASE_GRACE_MS;
        if (gone && imported === state.segment) {
            const epoch = state.epoch + 1;
            return {
                state: {
                    ...state,
                    holder: "home",
                    epoch,
                    expiresAt: now + CAPTURE_LEASE_MS,
                    imported,
                    homeWaiting: false,
                    released: false,
                },
                response: { state: "hold", epoch, from: state.cursor },
                stopFallback: true,
            };
        }
        return {
            state: { ...state, imported, homeWaiting: true },
            response: { state: "import", segment: state.segment },
        };
    }

    if (state.holder !== "fallback" || state.released)
        return { state, response: { state: "stop" } };
    if (request.epoch === undefined) {
        // A new fallback process: fence off any older one, and continue from the durable cursor.
        const epoch = state.epoch + 1;
        return {
            state: { ...state, epoch, expiresAt: now + CAPTURE_LEASE_MS },
            response: { state: "hold", epoch, from: state.cursor },
        };
    }
    if (request.epoch !== state.epoch) return { state, response: { state: "stop" } };
    const next: CaptureLeaseState = {
        ...state,
        expiresAt: now + CAPTURE_LEASE_MS,
        cursor: request.cursor === undefined ? state.cursor : request.cursor,
        segment: request.segment ?? state.segment,
    };
    if (request.released)
        return { state: { ...next, released: true }, response: { state: "stop" } };
    if (next.homeWaiting && next.imported === next.segment)
        return { state: next, response: { state: "release" } };
    return { state: next, response: { state: "hold", epoch: state.epoch } };
}

/**
 * Run on a timer: starts the fallback when home has gone silent, and restarts a fallback that
 * exited or stopped renewing. A fallback that is gone while home waits is counted as released;
 * the pages it had not uploaded are lost, and home continues from its last uploaded cursor.
 * `stop` is `signal` for a Container that should finish on its own, `destroy` for one that hung.
 */
export function checkCaptureLease(
    state: CaptureLeaseState,
    now: number,
    fallbackRunning: boolean,
): { state: CaptureLeaseState; start: boolean; stop: "signal" | "destroy" | null } {
    const lapsed = now > state.expiresAt + CAPTURE_LEASE_GRACE_MS;
    if (state.holder === "home") {
        // Without a known cursor, a fallback would read the stream from its start.
        if (lapsed && state.cursor !== null)
            return {
                state: {
                    ...state,
                    holder: "fallback",
                    expiresAt: now + CAPTURE_FALLBACK_START_MS,
                    homeWaiting: false,
                    released: false,
                },
                // A Container still running belongs to an older epoch and is told to stop.
                start: !fallbackRunning,
                stop: null,
            };
        return { state, start: false, stop: fallbackRunning ? "signal" : null };
    }
    if (state.holder !== "fallback" || state.released)
        return { state, start: false, stop: fallbackRunning ? "signal" : null };
    if (fallbackRunning && !lapsed) return { state, start: false, stop: null };
    const hung = fallbackRunning ? "destroy" : null;
    if (state.homeWaiting) return { state: { ...state, released: true }, start: false, stop: hung };
    return {
        state: { ...state, expiresAt: now + CAPTURE_FALLBACK_START_MS },
        start: true,
        stop: hung,
    };
}
