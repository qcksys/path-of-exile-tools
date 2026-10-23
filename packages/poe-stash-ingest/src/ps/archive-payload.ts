import { promisify } from "node:util";
import { gunzipSync, gzip } from "node:zlib";
import { blobValue, type DuckDBConnection } from "@duckdb/node-api";
import type { PublicStashPage } from "@poe-tools/api-client";
import { fingerprintHash } from "#src/ps/replay-fingerprint.ts";
import { queryAll } from "#src/shared/db.ts";

const compress = promisify(gzip);
const CHUNK_BYTES = 16 * 1024;
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_COMPRESSED_BYTES = MAX_BYTES + 64 * 1024;

async function findPayload<T>(
    conn: DuckDBConnection,
    table: "ps_capture_payload" | "ps_capture_payload_meta",
    columns: string,
    hash: string,
): Promise<T | undefined> {
    let [row] = await queryAll<T & { matchedHash: string }>(
        conn,
        `SELECT ${columns}, response_hash AS matchedHash FROM ${table} WHERE response_hash = $1`,
        [hash],
    );
    if (row?.matchedHash !== hash) {
        // The expression bypasses ART misses and hits that return a different key.
        [row] = await queryAll<T & { matchedHash: string }>(
            conn,
            `SELECT ${columns}, response_hash AS matchedHash FROM ${table} WHERE (response_hash || '') = $1`,
            [hash],
        );
        if (row?.matchedHash === hash)
            console.warn("Archived payload found by sequential fallback.");
    }
    return row?.matchedHash === hash ? row : undefined;
}

export async function hasArchivedPayload(conn: DuckDBConnection, hash: string): Promise<boolean> {
    return Boolean(
        (await findPayload(conn, "ps_capture_payload_meta", "response_hash", hash)) ??
            (await findPayload(conn, "ps_capture_payload", "response_hash", hash)),
    );
}

export async function writeArchivedPayload(conn: DuckDBConnection, hash: string, json: string) {
    const bytes = Buffer.byteLength(json);
    if (bytes > MAX_BYTES) throw new Error("The archived payload exceeds the size limit.");
    const body = await compress(json);
    const chunks = Math.ceil(body.length / CHUNK_BYTES);
    await conn.run("INSERT INTO ps_capture_payload_meta VALUES ($1, $2, $3, $4)", [
        hash,
        bytes,
        body.length,
        chunks,
    ]);
    // A checkpoint scans up to 2,048 values together; bounded parts avoid pinning whole pages.
    for (let index = 0; index < chunks; index++) {
        await conn.run("INSERT INTO ps_capture_payload_chunk VALUES ($1, $2, $3)", [
            hash,
            index,
            blobValue(body.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES)),
        ]);
    }
}

export async function readArchivedPage(
    conn: DuckDBConnection,
    hash: string,
): Promise<PublicStashPage> {
    const meta = await findPayload<{ bytes: number; compressed: number; chunks: number }>(
        conn,
        "ps_capture_payload_meta",
        "response_bytes::DOUBLE AS bytes, compressed_bytes::DOUBLE AS compressed, chunk_count AS chunks",
        hash,
    );
    let body: Buffer;
    let bytes: number;
    if (meta) {
        if (
            !Number.isSafeInteger(meta.bytes) ||
            meta.bytes < 0 ||
            meta.bytes > MAX_BYTES ||
            !Number.isSafeInteger(meta.compressed) ||
            meta.compressed < 1 ||
            meta.compressed > MAX_COMPRESSED_BYTES ||
            meta.chunks !== Math.ceil(meta.compressed / CHUNK_BYTES)
        ) {
            throw new Error("The archived payload metadata is invalid.");
        }
        const parts = await queryAll<{ index: number; bytes: number }>(
            conn,
            `SELECT chunk_index AS index, octet_length(response_gzip)::DOUBLE AS bytes
            FROM ps_capture_payload_chunk WHERE response_hash = $1 ORDER BY chunk_index LIMIT $2`,
            [hash, meta.chunks + 1],
        );
        if (
            parts.length !== meta.chunks ||
            parts.some(
                (part, index) =>
                    part.index !== index ||
                    part.bytes !== Math.min(CHUNK_BYTES, meta.compressed - index * CHUNK_BYTES),
            )
        ) {
            throw new Error("The archived payload chunks are incomplete or invalid.");
        }
        const encoded = await queryAll<{ body: string }>(
            conn,
            `SELECT to_base64(response_gzip) AS body FROM ps_capture_payload_chunk
            WHERE response_hash = $1 ORDER BY chunk_index LIMIT $2`,
            [hash, meta.chunks],
        );
        body = Buffer.concat(encoded.map((part) => Buffer.from(part.body, "base64")));
        if (body.length !== meta.compressed)
            throw new Error("The archived payload chunks are incomplete or invalid.");
        bytes = meta.bytes;
    } else {
        const legacy = await findPayload<{ body: string; bytes: number }>(
            conn,
            "ps_capture_payload",
            "to_base64(response_gzip) AS body, response_bytes::DOUBLE AS bytes",
            hash,
        );
        if (!legacy) throw new Error("The archived payload is missing.");
        body = Buffer.from(legacy.body, "base64");
        bytes = legacy.bytes;
    }
    const decoded = gunzipSync(body, { maxOutputLength: MAX_BYTES });
    if (decoded.length !== bytes)
        throw new Error("The archived payload size does not match its metadata.");
    const page: PublicStashPage = JSON.parse(decoded.toString("utf8"));
    if (fingerprintHash(page) !== hash)
        throw new Error("The archived payload does not match its recorded hash.");
    return page;
}
