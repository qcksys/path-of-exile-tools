import type { DuckDBConnection } from "@duckdb/node-api";
import type { Item } from "@poe-tools/api-client";

/**
 * Upsert an icon-asset → name mapping when an identified unique flows through.
 * The mapping is global (league-agnostic) and grows monotonically.
 */
export async function learnBasemap(
  conn: DuckDBConnection,
  item: Item,
  iconAsset: string | null,
): Promise<void> {
  if (!iconAsset) return;
  if (!(item.identified && item.frameType === 3 && item.name)) return;
  await conn.run(
    `INSERT INTO icon_basemap (icon_asset, name, base_type, seen_count, first_seen_at, last_seen_at)
         VALUES ($1, $2, $3, 1, current_timestamp, current_timestamp)
         ON CONFLICT (icon_asset) DO UPDATE
         SET seen_count = icon_basemap.seen_count + 1,
             last_seen_at = current_timestamp`,
    [iconAsset, item.name, item.baseType],
  );
}
