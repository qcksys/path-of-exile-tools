import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import type { DuckDBConnection } from "@duckdb/node-api";
import { type PoeApiClient, PoeApiError, type PublicStashPage } from "@poe-tools/api-client";
import {
    type StashCheckpoint,
    type StashCheckpointQuery,
    type StashCheckpointUpload,
    stashCheckpointQuerySchema,
    stashCheckpointSchema,
    stashCheckpointUploadSchema,
} from "@poe-tools/market";
import {
    fingerprintComparison,
    fingerprintHash,
    sampleFingerprints,
} from "#src/ps/replay-fingerprint.ts";
import { queryAll } from "#src/shared/db.ts";
import { push, requireRemoteEnv } from "#src/shared/remote/push.ts";

const compress = promisify(gzip);
const decompress = promisify(gunzip);

export function checkpointRange(
    league: string,
    from: string,
    to: string,
    realm = "pc",
): StashCheckpointQuery {
    for (const day of [from, to]) {
        const millis = Date.parse(`${day}T00:00:00Z`);
        if (
            !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
            !Number.isFinite(millis) ||
            new Date(millis).toISOString().slice(0, 10) !== day
        )
            throw new Error("Dates must be valid YYYY-MM-DD UTC dates.");
    }
    return stashCheckpointQuerySchema.parse({
        kind: "checkpoints",
        realm,
        league,
        from: Date.parse(`${from}T00:00:00Z`),
        to: Date.parse(`${to}T00:00:00Z`),
    });
}

export function responseHash(page: PublicStashPage): string {
    return fingerprintHash(page);
}

export function compareSampleStashes(original: PublicStashPage, fetched: PublicStashPage) {
    const expected = new Map(original.stashes.map((stash) => [stash.id, fingerprintHash(stash)]));
    const actual = new Map(fetched.stashes.map((stash) => [stash.id, fingerprintHash(stash)]));
    let unchanged = 0;
    let changed = 0;
    let missing = 0;
    for (const [id, value] of expected) {
        if (!actual.has(id)) missing++;
        else if (actual.get(id) === value) unchanged++;
        else changed++;
    }
    return {
        unchanged,
        changed,
        missing,
        added: [...actual.keys()].filter((id) => !expected.has(id)).length,
    };
}

// Called in the same transaction as the listings and the next cursor.
export async function recordCheckpoint(
    conn: DuckDBConnection,
    page: PublicStashPage,
    scope: {
        realm: StashCheckpoint["realm"];
        league: string;
        cursor?: string;
        capturedAt: number;
    },
) {
    if (!page.stashes.length && scope.cursor === page.next_change_id) return;
    const day = new Date(scope.capturedAt).toISOString().slice(0, 10);
    const [sample] = await queryAll(conn, "SELECT day FROM ps_daily_sample WHERE day = $1", [day]);
    const json = JSON.stringify(page);
    const keepSample = !sample && page.stashes.length > 0;
    const row: StashCheckpointUpload = {
        ...scope,
        id: randomUUID(),
        cursor: scope.cursor ?? null,
        nextCursor: page.next_change_id,
        responseHash: responseHash(page),
        stashCount: page.stashes.length,
        itemCount: page.stashes.reduce((n, stash) => n + (stash.items?.length ?? 0), 0),
        responseBytes: Buffer.byteLength(json),
        responseGzip: keepSample ? (await compress(json)).toString("base64") : null,
    };
    await conn.run("INSERT INTO ps_checkpoint VALUES ($1, $2, $3::JSON, FALSE)", [
        row.id,
        row.capturedAt,
        JSON.stringify(row),
    ]);
    if (keepSample) await conn.run("INSERT INTO ps_daily_sample VALUES ($1, $2)", [day, row.id]);
}

export async function flushCheckpoints(conn: DuckDBConnection) {
    const rows = await queryAll<{ id: string; payload: string }>(
        conn,
        "SELECT id, payload::VARCHAR AS payload FROM ps_checkpoint WHERE NOT delivered ORDER BY captured_at, id LIMIT 500",
    );
    const metadata: StashCheckpointUpload[] = [];
    for (const row of rows) {
        const payload = stashCheckpointUploadSchema.parse(JSON.parse(row.payload));
        if (payload.responseGzip === null) {
            metadata.push(payload);
            continue;
        }
        await push({ stream: "stash-checkpoints", rows: [payload] });
        await conn.run("UPDATE ps_checkpoint SET delivered = TRUE WHERE id = $1", [row.id]);
    }
    if (metadata.length) {
        await push({ stream: "stash-checkpoints", rows: metadata });
        await conn.run(
            "UPDATE ps_checkpoint SET delivered = TRUE WHERE id IN (SELECT json_extract_string(value, '$') FROM json_each($1::JSON))",
            [JSON.stringify(metadata.map((row) => row.id))],
        );
    }
    return rows.length;
}

export async function fetchCheckpoints(
    query: StashCheckpointQuery,
): Promise<StashCheckpointUpload[]> {
    const { url, token } = requireRemoteEnv();
    const target = new URL(url);
    for (const [key, value] of Object.entries(query))
        if (value !== undefined) target.searchParams.set(key, String(value));
    const res = await fetch(target, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Checkpoint read failed: HTTP ${res.status}`);
    const body = (await res.json()) as { rows: unknown[] };
    return body.rows.map((row) => stashCheckpointUploadSchema.parse(row));
}

async function readSample(query: StashCheckpointQuery) {
    const [sample] = await fetchCheckpoints({ ...query, kind: "sample" });
    if (!sample?.responseGzip) return null;
    const original = JSON.parse(
        (
            await decompress(Buffer.from(sample.responseGzip, "base64"), {
                maxOutputLength: 128 * 1024 * 1024,
            })
        ).toString(),
    ) as PublicStashPage;
    if (responseHash(original) !== sample.responseHash)
        throw new Error("Stored sample checksum does not match its checkpoint.");
    return { sample, original };
}

export async function validateSample(client: PoeApiClient, query: StashCheckpointQuery) {
    const saved = await readSample(query);
    if (!saved) return { status: "missing-sample" as const };
    const { sample, original } = saved;
    const page = await fetchCheckpointPage(client, sample);
    return {
        status:
            responseHash(page) === sample.responseHash
                ? ("matched" as const)
                : ("changed" as const),
        capturedAt: sample.capturedAt,
        originalStashes: original.stashes.length,
        fetchedStashes: page.stashes.length,
        originalBytes: sample.responseBytes,
        compressedBytes: Buffer.from(sample.responseGzip!, "base64").length,
        nextCursorMatched: page.next_change_id === original.next_change_id,
        stashes: compareSampleStashes(original, page),
    };
}

export async function probeSample(
    client: PoeApiClient,
    query: StashCheckpointQuery,
    opts: { pages: number; delayMs?: number },
) {
    if (!Number.isInteger(opts.pages) || opts.pages < 1 || opts.pages > 25)
        throw new Error("Choose between 1 and 25 probe pages.");
    const saved = await readSample(query);
    if (!saved) return { status: "missing-sample" as const };
    const { sample, original } = saved;
    const fingerprints = sampleFingerprints(original);
    const selectedOnly = JSON.stringify({
        version: fingerprints.version,
        stashes: fingerprints.stashes.map(({ idHash, selectedHash }) => [idHash, selectedHash]),
    });
    const comparison = fingerprintComparison(fingerprints);
    const visited = new Set<string | null>();
    const pages = [];
    let cursor = sample.cursor;
    let stopped = "page-limit";
    let sourceError: { status: number | null; retryAfterSeconds: number | null } | null = null;
    for (let n = 0; n < opts.pages; n++) {
        visited.add(cursor);
        if (n) await setTimeout(opts.delayMs ?? 5000);
        let page: PublicStashPage;
        try {
            page = await fetchCheckpointPage(client, { ...sample, cursor });
        } catch (error) {
            sourceError = {
                status: error instanceof PoeApiError ? error.status : null,
                retryAfterSeconds:
                    error instanceof PoeApiError
                        ? (error.rateLimit.retryAfterSeconds ?? null)
                        : null,
            };
            stopped = "source-unavailable";
            break;
        }
        comparison.add(page);
        pages.push({
            page: n + 1,
            stashes: page.stashes.length,
            wholePageMatched: responseHash(page) === sample.responseHash,
            ...comparison.result(),
        });
        if (comparison.result().fullMatched === fingerprints.stashes.length) {
            stopped = "all-originals-matched";
            break;
        }
        if (visited.has(page.next_change_id)) {
            stopped = "cursor-repeated";
            break;
        }
        cursor = page.next_change_id;
    }
    const result = comparison.result();
    return {
        status:
            !sourceError && result.selectedMatched === result.expected
                ? "selected-fields-matched"
                : "incomplete",
        capturedAt: sample.capturedAt,
        version: fingerprints.version,
        sampleCompressedBytes: Buffer.from(sample.responseGzip!, "base64").length,
        fingerprintsBytes: Buffer.byteLength(selectedOnly),
        fingerprintsCompressedBytes: (await compress(selectedOnly)).length,
        stopped,
        sourceError,
        ...result,
        pages,
    };
}

export function fetchCheckpointPage(client: PoeApiClient, checkpoint: StashCheckpoint) {
    const row = stashCheckpointSchema.parse(checkpoint);
    return client.public.stashTabs({
        realm: row.realm === "pc" ? undefined : row.realm,
        ...(row.cursor ? { id: row.cursor } : {}),
    });
}
