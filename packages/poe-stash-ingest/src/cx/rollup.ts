import type { DuckDBConnection } from "@duckdb/node-api";
import { queryAll } from "#src/shared/db.ts";
import { push } from "#src/shared/remote/push.ts";
import type { CurrencyHourlyRow } from "#src/shared/remote/types.ts";

const STREAM = "cxapi";

interface AggregateRow {
  league: string;
  marketId: string;
  observedHour: number;
  lowestRatio: string;
  highestRatio: string;
  volumeTraded: string;
  lowestStock: string;
  highestStock: string;
}

export async function rollupCx(
  conn: DuckDBConnection,
  opts: { hour?: number; league?: string | null; dryRun?: boolean },
): Promise<{ rows: number }> {
  const hour = opts.hour ?? Math.floor(Date.now() / 3_600_000) * 3600 - 3600;
  const league = opts.league ?? null;

  // CX is already hourly — passthrough.
  const aggregates = await queryAll<AggregateRow>(
    conn,
    `SELECT league,
                market_id AS "marketId",
                observed_hour AS "observedHour",
                lowest_ratio::VARCHAR AS "lowestRatio",
                highest_ratio::VARCHAR AS "highestRatio",
                volume_traded::VARCHAR AS "volumeTraded",
                lowest_stock::VARCHAR AS "lowestStock",
                highest_stock::VARCHAR AS "highestStock"
         FROM cx_market_hour
         WHERE observed_hour = $1
            AND ($2 IS NULL OR league = $2)`,
    [hour, league],
  );

  const rows: CurrencyHourlyRow[] = aggregates.map((a) => ({
    league: a.league,
    hour: Number(a.observedHour),
    marketId: a.marketId,
    lowestRatio: JSON.parse(a.lowestRatio) as Record<string, number>,
    highestRatio: JSON.parse(a.highestRatio) as Record<string, number>,
    volumeTraded: JSON.parse(a.volumeTraded) as Record<string, number>,
    lowestStock: JSON.parse(a.lowestStock) as Record<string, number>,
    highestStock: JSON.parse(a.highestStock) as Record<string, number>,
  }));

  if (rows.length === 0) {
    console.log(`cxapi rollup hour=${hour}: no rows; nothing to push.`);
    return { rows: 0 };
  }

  await push({ stream: "cxapi", rows }, { dryRun: opts.dryRun });

  if (!opts.dryRun) {
    const byLeague = new Map<string, number>();
    for (const r of rows) byLeague.set(r.league, (byLeague.get(r.league) ?? 0) + 1);
    for (const [lg, n] of byLeague) {
      await conn.run(
        `INSERT INTO rollup_state (stream_name, league, hour, pushed_at, row_count)
                 VALUES ($1, $2, $3, current_timestamp, $4)
                 ON CONFLICT (stream_name, league, hour) DO UPDATE
                 SET pushed_at = current_timestamp, row_count = excluded.row_count`,
        [STREAM, lg, hour, n],
      );
    }
  }

  console.log(`cxapi rollup hour=${hour}: ${rows.length} rows pushed.`);
  return { rows: rows.length };
}
