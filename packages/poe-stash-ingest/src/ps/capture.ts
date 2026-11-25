import { mkdir, open, readFile, rename } from "node:fs/promises";
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
// capture falls behind. psapi's Ip rule allows 2 hits per 1 s; the test that tripped it at one
// request per 1.1 s shared the IP with other clients. The rate-limit headers can only slow this.
const REQUEST_SPACING_MS = 1500;
// The share of any rate-limit rule's hits capture may spend is 1 / RULE_HEADROOM.
const RULE_HEADROOM = 1.5;
const HEAD_POLL_MS = 60_000;
const LEASE_POLL_MS = 1000;
const MAINTENANCE_INTERVAL_MS = 60_000;
const STATUS_INTERVAL_MS = 30_000;
const MAX_ERROR_DELAY_MS = 60_000;
const RATE_LIMIT_DELAY_SECONDS = 60;

/**
 * The shortest request spacing the latest rate-limit headers allow: two thirds of any rule's hits,
 * and a whole period once a rule is full, since other clients on the same IP count against it too.
 */
export function rateLimitSpacingMs(info: RateLimitInfo | undefined) {
    let ms = 0;
    for (const rule of info?.rules ?? []) {
        if (rule.maxHits <= 0) continue;
        const periodMs = rule.periodSeconds * 1000;
        ms = Math.max(ms, (periodMs * RULE_HEADROOM) / rule.maxHits);
        if (rule.currentHits >= rule.maxHits) ms = Math.max(ms, periodMs);
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
    const path = join(dir, STATE_FILE);
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
    let loggedRules = "";
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
        await pause(requestedAt + Math.max(spacing, rateLimitSpacingMs(limits)) - Date.now());
        if (opts.signal.aborted) break;
        // The lease may have lapsed during a long rate-limit wait.
        if (lease && !lease.holding()) continue;
        requestedAt = Date.now();
        let delay = 0;
        try {
            const page = await client.public.stashTabs(
                cursor ? { realm: opts.realm, id: cursor } : { realm: opts.realm },
            );
            const capturedAt = Date.now();
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
            failures++;
            delay = isRateLimited(error)
                ? (error.rateLimit.retryAfterSeconds ?? RATE_LIMIT_DELAY_SECONDS) * 1000
                : Math.min((opts.errorDelayMs ?? 5000) * 2 ** (failures - 1), MAX_ERROR_DELAY_MS);
            console.error(
                `Capture failed; retrying the same cursor in ${delay} ms: ${failureMessage(error)}`,
            );
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
