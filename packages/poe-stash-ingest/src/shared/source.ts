import type { DuckDBConnection } from "@duckdb/node-api";
import { queryAll } from "#src/shared/db.ts";

async function assertLiveDatabase(conn: DuckDBConnection) {
    const [state] = await queryAll<{ value: string }>(
        conn,
        "SELECT value FROM pipeline_config WHERE key = 'replay'",
    );
    if (state)
        throw new Error("Historical replay databases are retired; use the live capture database.");
}

export async function assertSourceRealm(conn: DuckDBConnection, realm: string) {
    await assertLiveDatabase(conn);
    const [source] = await queryAll<{ value: string }>(
        conn,
        "SELECT value FROM pipeline_config WHERE key = 'source'",
    );
    if (source && JSON.parse(source.value).realm !== realm)
        throw new Error(
            "The configured realm does not match this database. Use its original realm or a separate PS_LOCAL_DB.",
        );
}

export async function configureSource(
    conn: DuckDBConnection,
    realm: string,
    league: string | null,
) {
    await assertLiveDatabase(conn);
    const scope = JSON.stringify({ realm, league });
    const [existing] = await queryAll<{ value: string }>(
        conn,
        "SELECT value FROM pipeline_config WHERE key = 'source'",
    );
    if (existing && existing.value !== scope) {
        throw new Error(
            "This database belongs to another realm or season. Use a separate PS_LOCAL_DB to avoid skipping data with a shared cursor.",
        );
    }
    await conn.run("INSERT INTO pipeline_config VALUES ('source', $1) ON CONFLICT DO NOTHING", [
        scope,
    ]);
}
