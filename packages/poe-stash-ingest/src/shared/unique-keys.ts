import type { DuckDBConnection } from "@duckdb/node-api";
import { queryAll } from "#src/shared/db.ts";

/**
 * The listing, sale and equipment tables keep no keys (see db.ts), so a batch checks, before it
 * commits, that each key it wrote occurs once in its table. A duplicate fails the batch, which rolls
 * back and is retried, as a primary key's violation did.
 *
 * `written` selects the batch's keys, named as `columns`; `params` are its parameters.
 */
export async function assertUniqueKeys(
    conn: DuckDBConnection,
    table: string,
    columns: readonly string[],
    written: string,
    params: unknown[] = [],
) {
    const names = columns.join(", ");
    const duplicates = await queryAll<Record<string, unknown>>(
        conn,
        `SELECT ${names}, count(*)::INTEGER AS copies
        FROM ${table} JOIN (SELECT DISTINCT ${names} FROM (${written})) USING (${names})
        GROUP BY ALL HAVING count(*) > 1 ORDER BY ALL LIMIT 3`,
        params,
    );
    if (duplicates.length)
        throw new Error(
            `${table} would hold a duplicate key (${names}): ${duplicates.map((row) => JSON.stringify(row)).join("; ")}`,
        );
}
