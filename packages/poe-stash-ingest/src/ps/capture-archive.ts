import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { blobValue, type DuckDBConnection } from "@duckdb/node-api";
import type { Item, PublicStashPage } from "@poe-tools/api-client";
import { responseHash } from "#src/ps/checkpoints.ts";
import { queryAll, withTransaction } from "#src/shared/db.ts";

const compress = promisify(gzip);

export async function archivePage(
    conn: DuckDBConnection,
    page: PublicStashPage,
    scope: { realm: string; league: string; cursor?: string; capturedAt: number },
    accepts: (item: Item) => boolean,
): Promise<string | null> {
    const previous = await queryAll<{ id: string }>(
        conn,
        "SELECT stash_id AS id FROM ps_capture_stash WHERE stash_id IN (SELECT json_extract_string(value, '$') FROM json_each($1::JSON))",
        [JSON.stringify(page.stashes.map((stash) => stash.id))],
    );
    const tracked = new Set(previous.map((stash) => stash.id));
    const stashes = page.stashes.flatMap((stash) => {
        if (stash.public && scope.league !== "all" && stash.league !== scope.league) return [];
        const items = stash.public ? (stash.items ?? []).filter(accepts) : [];
        if (!items.length && !tracked.has(stash.id)) return [];
        return [{ ...stash, items }];
    });
    if (!stashes.length) return null;
    // biome-ignore lint/style/useNamingConvention: Preserve the upstream envelope field.
    const filtered = { next_change_id: page.next_change_id, stashes };
    const hash = responseHash(filtered);
    const id = randomUUID();
    // Commit before classification: a processing failure must not discard the only captured copy.
    await withTransaction(conn, async () => {
        const [existing] = await queryAll(
            conn,
            "SELECT response_hash FROM ps_capture_payload WHERE response_hash = $1",
            [hash],
        );
        if (!existing) {
            const json = JSON.stringify(filtered);
            await conn.run("INSERT INTO ps_capture_payload VALUES ($1, $2, $3)", [
                hash,
                blobValue(await compress(json)),
                Buffer.byteLength(json),
            ]);
        }
        await conn.run("INSERT INTO ps_capture_page VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)", [
            id,
            scope.realm,
            scope.league,
            scope.cursor ?? null,
            page.next_change_id,
            scope.capturedAt,
            hash,
        ]);
        await conn.run(
            "DELETE FROM ps_capture_stash WHERE stash_id IN (SELECT json_extract_string(value, '$') FROM json_each($1::JSON))",
            [JSON.stringify(stashes.map((stash) => stash.id))],
        );
        await conn.run(
            "INSERT INTO ps_capture_stash SELECT json_extract_string(value, '$') FROM json_each($1::JSON) ON CONFLICT DO NOTHING",
            [
                JSON.stringify(
                    stashes.filter((stash) => stash.items.length).map((stash) => stash.id),
                ),
            ],
        );
    });
    return id;
}

export async function captureArchiveStatus(conn: DuckDBConnection) {
    const [pages] = await queryAll(
        conn,
        `SELECT count(*)::DOUBLE AS pages,
        count(*) FILTER (WHERE processed_at IS NULL)::DOUBLE AS unprocessed,
        min(captured_at)::DOUBLE AS firstCapturedAt, max(captured_at)::DOUBLE AS lastCapturedAt
        FROM ps_capture_page`,
    );
    const [payloads] = await queryAll(
        conn,
        `SELECT count(*)::DOUBLE AS payloads,
        coalesce(sum(octet_length(response_gzip)), 0)::DOUBLE AS compressedBytes,
        coalesce(sum(response_bytes), 0)::DOUBLE AS originalBytes FROM ps_capture_payload`,
    );
    return { ...pages, ...payloads };
}
