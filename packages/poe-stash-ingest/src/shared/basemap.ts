import type { DuckDBConnection } from "@duckdb/node-api";

export async function learnBasemap(
    conn: DuckDBConnection,
    items: ReadonlyArray<{
        iconAsset: string | null;
        name: string | null;
        baseType: string;
        identified: boolean;
        frameType: number;
    }>,
): Promise<void> {
    const mappings = items.filter(
        (item) => item.iconAsset && item.identified && item.frameType === 3 && item.name,
    );
    if (!mappings.length) return;
    await conn.run(
        `INSERT INTO icon_basemap (icon_asset, name, base_type, seen_count, first_seen_at, last_seen_at)
         SELECT value->>'iconAsset', first(value->>'name' ORDER BY key::BIGINT),
             first(value->>'baseType' ORDER BY key::BIGINT), count(*), current_timestamp, current_timestamp
         FROM json_each($1::JSON) GROUP BY value->>'iconAsset'
         ON CONFLICT (icon_asset) DO UPDATE
         SET seen_count = icon_basemap.seen_count + excluded.seen_count,
             last_seen_at = now()`,
        [JSON.stringify(mappings)],
    );
}
