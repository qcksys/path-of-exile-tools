import { appendFile, mkdir, open, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import type { DuckDBConnection } from "@duckdb/node-api";
import {
    isRateLimited,
    type PoeApiClient,
    type PublicStashPage,
    type RateLimitInfo,
    type Realm,
} from "@poe-tools/api-client";
import type { IngestStatus } from "@poe-tools/market";
import {
    appendRawPage,
    maintainRawArchive,
    RAW_POSITION_STREAM,
    type RawArchiveOptions,
    RawPageReader,
    type RawPosition,
    rawEndPosition,
} from "#src/ps/raw-archive.ts";
import { getCursor, setCursor } from "#src/shared/cursor.ts";
import { failureMessage } from "#src/shared/watch.ts";

/**
 * The stream cannot be read again: an old cursor returns each stash once at its current state, so
 * whatever is not fetched while it happens is lost. Capture therefore runs apart from everything
 * that can be rebuilt. It only fetches pages, syncs them to the raw archive and keeps its cursor in
 * a file, and the worker reads the archive into DuckDB at its own pace.
 */

const STATE_FILE = "capture-state.json";
const STATE_POLL_MS = 5000;
// At busy hours every page is cut off at the API's size limit, so the request rate sets how far
// capture falls behind. Until the first response's rate-limit headers arrive, requests are this
// far apart; from then on the headers set the pace.
const REQUEST_SPACING_MS = 1500;
// The share of each rate-limit rule's hits capture aims to spend. psapi's Ip rule allows 2 hits per
// 1 s, so this is a request every 556 ms while no other client on the IP uses it.
const RULE_TARGET = 0.9;
// Each 429 lowers that share, by a weight that halves every BACKOFF_HALF_LIFE_MS: three recent ones
// bring capture down to BACKOFF_FLOOR, the pace it ran at before without them, and the share climbs
// back as they age.
const BACKOFF_HALF_LIFE_MS = 6 * 3_600_000;
const BACKOFF_FULL_WEIGHT = 3;
const BACKOFF_FLOOR = 1 / 3;
// After this long a 429's weight is under 1%.
const BACKOFF_MEMORY_MS = 48 * 3_600_000;
const RATE_LIMITED_FILE = "capture-rate-limited.json";
// Every 429 and every 5-point change of the share, for review.
const PACING_LOG = "capture-pacing.ndjson";
const HEAD_POLL_MS = 60_000;
const LEASE_POLL_MS = 1000;
const MAINTENANCE_INTERVAL_MS = 60_000;
const STATUS_INTERVAL_MS = 30_000;
const MAX_ERROR_DELAY_MS = 60_000;
const RATE_LIMIT_DELAY_SECONDS = 60;

/** The 429s' weight at `now`: each counts 1 when it happens and half as much every half-life. */
export function rateLimitedWeight(rateLimitedAt: readonly number[], now: number) {
    let weight = 0;
    for (const at of rateLimitedAt) weight += 0.5 ** (Math.max(0, now - at) / BACKOFF_HALF_LIFE_MS);
    return weight;
}

/** The share of each rule's hits capture aims for after the 429s at `rateLimitedAt`. */
export function captureTarget(rateLimitedAt: readonly number[], now: number) {
    const weight = Math.min(1, rateLimitedWeight(rateLimitedAt, now) / BACKOFF_FULL_WEIGHT);
    return RULE_TARGET - (RULE_TARGET - BACKOFF_FLOOR) * weight;
}

/**
 * The request spacing that keeps capture at `target` of every rule in the latest rate-limit
 * headers, received at `respondedAt`. Hits beyond capture's own requests in a rule's period are
 * another client's on the same IP: they come off capture's share, and once such a rule is full
 * capture waits out its period.
 */
export function rateLimitSpacingMs(
    info: RateLimitInfo | undefined,
    ownRequests: readonly number[] = [],
    respondedAt = Date.now(),
    target = RULE_TARGET,
) {
    let ms = 0;
    for (const rule of info?.rules ?? []) {
        if (rule.maxHits <= 0) continue;
        const periodMs = rule.periodSeconds * 1000;
        const own = ownRequests.filter((at) => at > respondedAt - periodMs).length;
        const others = Math.max(0, rule.currentHits - own);
        const share = rule.maxHits * target - others;
        ms = Math.max(ms, share > 0 ? periodMs / share : periodMs);
        if (others > 0 && rule.currentHits >= rule.maxHits) ms = Math.max(ms, periodMs);
    }
    return Math.ceil(ms);
}

const describeRules = (info: RateLimitInfo) =>
    info.rules
        .map((r) => `${r.rule} ${r.maxHits}:${r.periodSeconds}:${r.restrictionSeconds}`)
        .join(", ");

export interface CaptureState {
    cursor: string | null;
}

export async function readCaptureState(dir: string): Promise<CaptureState | undefined> {
    const text = await readFile(join(dir, STATE_FILE), "utf8").catch(
        (error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return undefined;
            throw error;
        },
    );
    return text === undefined ? undefined : (JSON.parse(text) as CaptureState);
}

export async function writeCaptureState(dir: string, state: CaptureState) {
    await writeSynced(dir, STATE_FILE, JSON.stringify(state));
}

async function writeSynced(dir: string, name: string, text: string) {
    const path = join(dir, name);
    await mkdir(dir, { recursive: true });
    const fh = await open(`${path}.tmp`, "w");
    try {
        await fh.write(text);
        await fh.datasync();
    } finally {
        await fh.close();
    }
    await rename(`${path}.tmp`, path);
}

/** When capture's recent 429s happened, kept beside its state so a restart keeps the backoff. */
export async function readRateLimited(dir: string): Promise<number[]> {
    const text = await readFile(join(dir, RATE_LIMITED_FILE), "utf8").catch(
        (error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return undefined;
            throw error;
        },
    );
    return text === undefined ? [] : (JSON.parse(text) as { at: number[] }).at;
}

async function writeRateLimited(dir: string, rateLimitedAt: readonly number[]) {
    await writeSynced(dir, RATE_LIMITED_FILE, JSON.stringify({ at: rateLimitedAt }));
}

/** A pacing event, logged and appended to the archive's pacing log for review. */
async function logPacing(dir: string, event: Record<string, unknown>, message: string) {
    console.log(message);
    const line = `${JSON.stringify({ at: Date.now(), ...event })}\n`;
    // The log is for review: failing to write it must never stop capture.
    await appendFile(join(dir, PACING_LOG), line).catch((error: unknown) =>
        console.error(`Could not write the pacing log: ${failureMessage(error)}`),
    );
}

const pacing = (rateLimitedAt: readonly number[], target: number, event: "429" | "target") => {
    const now = Date.now();
    return {
        event,
        target: Math.round(target * 1000) / 1000,
        weight: Math.round(rateLimitedWeight(rateLimitedAt, now) * 100) / 100,
        rateLimitedLastDay: rateLimitedAt.filter((at) => at > now - 24 * 3_600_000).length,
    };
};

const pacingMessage = (target: number) =>
    `capture pacing: ${Math.round(target * 100)}% of each rate-limit rule`;

/**
 * Opens the database's place in the raw archive. A database without one starts after everything
 * already archived, which it read through direct capture, or at `fromHour` to rebuild from the
 * archive. Capture waits for its state file, so a stream's first cursor comes from the database.
 */
export async function openCaptureSource(
    conn: DuckDBConnection,
    dir: string,
    opts: { cursor?: string; fromHour?: string } = {},
) {
    const stored = await getCursor(conn, RAW_POSITION_STREAM);
    let position: RawPosition;
    if (stored) position = JSON.parse(stored) as RawPosition;
    else {
        position = opts.fromHour
            ? { hour: opts.fromHour, offset: 0, capturedAt: 0 }
            : { ...(await rawEndPosition(dir)), capturedAt: Date.now() };
        await setCursor(conn, RAW_POSITION_STREAM, JSON.stringify(position));
    }
    if (!(await readCaptureState(dir)))
        await writeCaptureState(dir, {
            cursor: opts.cursor ?? (await getCursor(conn, "psapi")) ?? null,
        });
    return new RawPageReader(dir, position);
}

/** Who may fetch: capture fetches only while `holding`; see `ps/capture-lease.ts`. */
export interface CaptureLeaseHooks {
    holding(): boolean;
    /** The lease cannot be reached, so nobody may be capturing: reported as a failed stage. */
    failing?(): boolean;
    /** A cursor to continue from, once, after another holder handed the stream over. */
    takeHandover(): string | null | undefined;
    /** The cursor after the latest page `store` made durable. */
    synced(cursor: string | null): void;
}

export interface CapturedPage {
    capturedAt: number;
    cursor: string | undefined;
    page: PublicStashPage;
}

/** Appends a page to the hourly spool, then saves the cursor after it. */
async function spoolPage(dir: string, { capturedAt, cursor, page }: CapturedPage) {
    await appendRawPage(dir, { capturedAt, cursor, page });
    // Written after the page: a crash between the two fetches it again, never skips it.
    await writeCaptureState(dir, { cursor: page.next_change_id });
}

export async function runCapture(
    client: PoeApiClient,
    opts: {
        archive: RawArchiveOptions;
        realm?: Realm;
        signal: AbortSignal;
        onStatus?: (patch: Partial<IngestStatus>) => Promise<void>;
        requestSpacingMs?: number;
        /** The rate-limit headers of the client's latest response. */
        rateLimit?: () => RateLimitInfo | undefined;
        headPollMs?: number;
        errorDelayMs?: number;
        leasePollMs?: number;
        maintain?: typeof maintainRawArchive;
        lease?: CaptureLeaseHooks;
        /** Where a fetched page goes; the hourly spool unless a fallback writes segments. */
        store?: (page: CapturedPage) => Promise<void>;
    },
) {
    const { dir } = opts.archive;
    const pause = (ms: number) =>
        ms > 0
            ? setTimeout(ms, undefined, { signal: opts.signal }).catch(() => undefined)
            : undefined;
    const spacing = opts.requestSpacingMs ?? REQUEST_SPACING_MS;
    const maintain = opts.maintain ?? maintainRawArchive;
    const store = opts.store ?? ((page: CapturedPage) => spoolPage(dir, page));
    const { lease } = opts;

    let lastReport = 0;
    // A status failure must never cost a page.
    const report = (patch: Partial<IngestStatus>, force = false) => {
        if (!force && Date.now() - lastReport < STATUS_INTERVAL_MS) return;
        lastReport = Date.now();
        void opts.onStatus?.(patch).catch(() => {});
    };

    let maintenanceRunning: Promise<void> | undefined;
    let maintainedAt = 0;
    let maintenanceFailed = false;
    const startMaintenance = () => {
        if (maintenanceRunning || Date.now() - maintainedAt < MAINTENANCE_INTERVAL_MS) return;
        maintainedAt = Date.now();
        // Without the lease, another holder's pages may still be imported into the latest hour.
        maintenanceRunning = maintain(opts.archive, Date.now(), {
            keepLatest: lease ? !lease.holding() : false,
        })
            .then((result) => {
                maintenanceFailed = false;
                if (result.sealed.length || result.uploaded)
                    console.log(
                        `raw archive: sealed ${result.sealed.join(", ") || "none"}; uploaded ${result.uploaded}`,
                    );
            })
            .catch((error: unknown) => {
                maintenanceFailed = true;
                console.error(`Raw archive maintenance failed: ${failureMessage(error)}`);
            })
            .finally(() => {
                maintenanceRunning = undefined;
            });
    };

    let state = await readCaptureState(dir);
    while (!state && !opts.signal.aborted) {
        report({ state: "starting", progressAt: Date.now() });
        await pause(opts.requestSpacingMs ?? STATE_POLL_MS);
        state = await readCaptureState(dir);
    }
    let cursor = state?.cursor ?? undefined;
    lease?.synced(cursor ?? null);
    let pages = 0;
    let failures = 0;
    let requestedAt = 0;
    let respondedAt = 0;
    // When capture's recent requests started, to tell its own hits from other clients'.
    const ownRequests: number[] = [];
    let loggedRules = "";
    let rateLimitedAt = (await readRateLimited(dir)).filter(
        (at) => at > Date.now() - BACKOFF_MEMORY_MS,
    );
    // The share of each rule capture aims for, as last logged, in 5-point steps.
    let loggedTarget = Math.round(RULE_TARGET * 20);
    while (!opts.signal.aborted) {
        if (lease) {
            const handover = lease.takeHandover();
            if (handover !== undefined) cursor = handover ?? undefined;
            if (!lease.holding()) {
                const failing = lease.failing?.() ?? false;
                report({
                    state: failing ? "error" : "idle",
                    stage: null,
                    failedStages: failing ? ["stash"] : [],
                    progressAt: Date.now(),
                });
                startMaintenance();
                await pause(opts.leasePollMs ?? LEASE_POLL_MS);
                continue;
            }
        }
        const limits = opts.rateLimit?.();
        const rules = limits ? describeRules(limits) : "";
        if (rules && rules !== loggedRules) {
            console.log(`psapi rate limits: ${rules}`);
            loggedRules = rules;
        }
        const target = captureTarget(rateLimitedAt, Date.now());
        if (Math.round(target * 20) !== loggedTarget) {
            loggedTarget = Math.round(target * 20);
            await logPacing(dir, pacing(rateLimitedAt, target, "target"), pacingMessage(target));
        }
        const periods = (limits?.rules ?? []).map((rule) => rule.periodSeconds * 1000);
        const horizon = respondedAt - Math.max(60_000, ...periods);
        while (ownRequests.length > 0 && (ownRequests[0] ?? 0) <= horizon) ownRequests.shift();
        const wait = limits?.rules.length
            ? rateLimitSpacingMs(limits, ownRequests, respondedAt, target)
            : spacing;
        await pause(requestedAt + wait - Date.now());
        if (opts.signal.aborted) break;
        // The lease may have lapsed during a long rate-limit wait.
        if (lease && !lease.holding()) continue;
        requestedAt = Date.now();
        ownRequests.push(requestedAt);
        let delay = 0;
        try {
            const page = await client.public.stashTabs(
                cursor ? { realm: opts.realm, id: cursor } : { realm: opts.realm },
            );
            const capturedAt = Date.now();
            respondedAt = capturedAt;
            await store({ capturedAt, cursor, page });
            lease?.synced(page.next_change_id);
            const caughtUp = cursor !== undefined && page.next_change_id === cursor;
            cursor = page.next_change_id;
            pages++;
            const recovered = failures > 0;
            failures = 0;
            if (caughtUp) delay = opts.headPollMs ?? HEAD_POLL_MS;
            report(
                {
                    state: caughtUp ? "idle" : "running",
                    stage: caughtUp ? null : "stash",
                    failedStages: maintenanceFailed ? ["delivery"] : [],
                    cycles: pages,
                    pages,
                    stashCaughtUp: caughtUp,
                    progressAt: capturedAt,
                    completedAt: capturedAt,
                    lastSuccessAt: capturedAt,
                },
                recovered || pages === 1,
            );
        } catch (error) {
            respondedAt = Date.now();
            failures++;
            delay = isRateLimited(error)
                ? (error.rateLimit.retryAfterSeconds ?? RATE_LIMIT_DELAY_SECONDS) * 1000
                : Math.min((opts.errorDelayMs ?? 5000) * 2 ** (failures - 1), MAX_ERROR_DELAY_MS);
            console.error(
                `Capture failed; retrying the same cursor in ${delay} ms: ${failureMessage(error)}`,
            );
            if (isRateLimited(error)) {
                rateLimitedAt = [
                    ...rateLimitedAt.filter((at) => at > respondedAt - BACKOFF_MEMORY_MS),
                    respondedAt,
                ];
                await writeRateLimited(dir, rateLimitedAt).catch((writeError: unknown) =>
                    console.error(`Could not save the 429: ${failureMessage(writeError)}`),
                );
                const slowed = captureTarget(rateLimitedAt, respondedAt);
                loggedTarget = Math.round(slowed * 20);
                await logPacing(
                    dir,
                    {
                        ...pacing(rateLimitedAt, slowed, "429"),
                        retryAfterSeconds: error.rateLimit.retryAfterSeconds ?? null,
                        rules: describeRules(error.rateLimit),
                    },
                    `psapi 429: ${pacingMessage(slowed)}`,
                );
            }
            report(
                { state: "error", failedStages: ["stash"], completedAt: Date.now() },
                failures === 1,
            );
        }
        startMaintenance();
        await pause(delay);
    }
    return { pages, cursor };
}
