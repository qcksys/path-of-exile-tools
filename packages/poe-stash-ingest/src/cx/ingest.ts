import type { DuckDBConnection } from "@duckdb/node-api";
import type { PoeApiClient } from "@poe-tools/api-client";
import { REALM } from "#src/shared/auth.ts";
import { getCursor, setCursor } from "#src/shared/cursor.ts";

const STREAM = "cxapi";

export interface CxIngestResult {
  hour: number;
  leagues: number;
  markets: number;
  caughtUp: boolean;
  nextHour: number;
}

function previousHour(): number {
  return Math.floor(Date.now() / 3_600_000) * 3600 - 3600;
}

/**
 * Ingest cxapi snapshots starting from the saved cursor (or `--from-hour`).
 * `catchUp=false` pulls a single hour. `catchUp=true` walks until the API
 * reports `next_change_id === id` (tail).
 */
export async function ingestCx(
  conn: DuckDBConnection,
  client: PoeApiClient,
  opts: { fromHour?: number; catchUp: boolean },
): Promise<CxIngestResult[]> {
  const results: CxIngestResult[] = [];
  let id =
    opts.fromHour ??
    Number((await getCursor(conn, STREAM)) ?? String(previousHour())) ??
    previousHour();

  while (true) {
    const snap = await client.public.currencyExchange({ realm: REALM, id });
    const leaguesSeen = new Set<string>();

    for (const m of snap.markets) {
      leaguesSeen.add(m.league);
      await conn.run(
        `INSERT INTO cx_market_hour (
                    league, market_id, observed_hour,
                    lowest_ratio, highest_ratio, volume_traded, lowest_stock, highest_stock
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (league, market_id, observed_hour) DO NOTHING`,
        [
          m.league,
          m.market_id,
          id,
          JSON.stringify(m.lowest_ratio),
          JSON.stringify(m.highest_ratio),
          JSON.stringify(m.volume_traded),
          JSON.stringify(m.lowest_stock),
          JSON.stringify(m.highest_stock),
        ],
      );
    }

    const caughtUp = snap.next_change_id === id;
    await setCursor(conn, STREAM, String(snap.next_change_id));

    results.push({
      hour: id,
      leagues: leaguesSeen.size,
      markets: snap.markets.length,
      caughtUp,
      nextHour: snap.next_change_id,
    });

    console.log(
      `cxapi: hour=${id} leagues=${leaguesSeen.size} markets=${snap.markets.length}` +
        (caughtUp ? " [caught up]" : ` next=${snap.next_change_id}`),
    );

    if (caughtUp || !opts.catchUp) break;
    id = snap.next_change_id;
  }

  return results;
}
