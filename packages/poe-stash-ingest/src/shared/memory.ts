import type { DuckDBConnection } from "@duckdb/node-api";
import { queryAll } from "#src/shared/db.ts";

const GIB = 1024 ** 3;

/**
 * DuckDB's memory by `duckdb_memory()` tag, largest first, such as
 * "7.1 of 7.4 GiB: ART_INDEX 3.2, TRANSACTION 1.9, ALLOCATOR 1.1, spilled 0.4".
 */
export async function memoryByTag(conn: DuckDBConnection): Promise<string> {
    const tags = await queryAll<{ tag: string; used: number; spilled: number }>(
        conn,
        `SELECT tag, memory_usage_bytes::DOUBLE AS used, temporary_storage_bytes::DOUBLE AS spilled
        FROM duckdb_memory() ORDER BY memory_usage_bytes DESC`,
    );
    const [{ limit } = { limit: "" }] = await queryAll<{ limit: string }>(
        conn,
        "SELECT current_setting('memory_limit') AS limit",
    );
    const gib = (bytes: number) => (bytes / GIB).toFixed(1);
    const used = tags.reduce((sum, tag) => sum + tag.used, 0);
    const spilled = tags.reduce((sum, tag) => sum + tag.spilled, 0);
    const shown = tags
        .filter((tag) => tag.used >= 0.05 * GIB)
        .map((tag) => `${tag.tag} ${gib(tag.used)}`);
    if (spilled >= 0.05 * GIB) shown.push(`spilled ${gib(spilled)}`);
    return `${gib(used)} of ${limit}: ${shown.join(", ") || "nothing above 0.05 GiB"}`;
}
