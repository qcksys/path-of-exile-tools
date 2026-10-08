import type { DuckDBConnection } from "@duckdb/node-api";
import type { PoeApiClient } from "@poe-tools/api-client";
import { REALM } from "#src/shared/auth.ts";
import { getCursor, setCursor } from "#src/shared/cursor.ts";
import { withTransaction } from "#src/shared/db.ts";
import { configureSource } from "#src/shared/source.ts";

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
    opts: {
        fromHour?: number;
        catchUp: boolean;
        league?: string | null;
        maxHours?: number;
        onProgress?: (result: CxIngestResult) => Promise<void>;
    },
): Promise<CxIngestResult[]> {
    await configureSource(conn, REALM ?? "pc", opts.league ?? null);
    const results: CxIngestResult[] = [];
    let id: number;
    if (opts.fromHour !== undefined) {
        id = opts.fromHour;
    } else {
        const cursorStr = await getCursor(conn, STREAM);
        const cursorNum = cursorStr !== undefined ? Number(cursorStr) : Number.NaN;
        id = Number.isFinite(cursorNum) ? cursorNum : previousHour();
    }

    while (true) {
        if (id > previousHour()) break;
        const snap = await client.public.currencyExchange({ realm: REALM, id });
        const markets = snap.markets.filter(
            (market) => !opts.league || market.league === opts.league,
        );
        const leaguesSeen = new Set(markets.map((market) => market.league));

        await withTransaction(conn, async () => {
            await conn.run(
                `INSERT INTO cx_market_hour (
                    league, market_id, observed_hour,
                    lowest_ratio, highest_ratio, volume_traded, lowest_stock, highest_stock
                ) SELECT value->>'league', value->>'market_id', $1,
                    value->'lowest_ratio', value->'highest_ratio', value->'volume_traded',
                    value->'lowest_stock', value->'highest_stock'
                FROM json_each($2::JSON)
                ON CONFLICT (league, market_id, observed_hour) DO NOTHING`,
                [id, JSON.stringify(markets)],
            );
            await setCursor(conn, STREAM, String(snap.next_change_id));
        });

        const caughtUp = snap.next_change_id === id;

        results.push({
            hour: id,
            leagues: leaguesSeen.size,
            markets: snap.markets.length,
            caughtUp,
            nextHour: snap.next_change_id,
        });
        await opts.onProgress?.(results[results.length - 1]!);

        console.log(
            `cxapi: hour=${id} leagues=${leaguesSeen.size} markets=${snap.markets.length}` +
                (caughtUp ? " [caught up]" : ` next=${snap.next_change_id}`),
        );

        if (caughtUp || !opts.catchUp || results.length >= (opts.maxHours ?? Infinity)) break;
        id = snap.next_change_id;
    }

    return results;
}
