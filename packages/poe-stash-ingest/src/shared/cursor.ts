import type { DuckDBConnection } from "@duckdb/node-api";
import { queryAll } from "#src/shared/db.ts";

export async function getCursor(
  conn: DuckDBConnection,
  streamName: string,
): Promise<string | undefined> {
  const rows = await queryAll<{ cursor: string }>(
    conn,
    "SELECT cursor FROM stream_cursor WHERE stream_name = $1",
    [streamName],
  );
  return rows[0]?.cursor;
}

export async function setCursor(
  conn: DuckDBConnection,
  streamName: string,
  cursor: string,
): Promise<void> {
  await conn.run(
    `INSERT INTO stream_cursor (stream_name, cursor, updated_at)
         VALUES ($1, $2, current_timestamp)
         ON CONFLICT (stream_name) DO UPDATE
         SET cursor = excluded.cursor, updated_at = excluded.updated_at`,
    [streamName, cursor],
  );
}
