import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PoeApiClient } from "@poe-tools/api-client";
import { eq } from "drizzle-orm";
import { createPoeClient, LEAGUE, REALM } from "#src/auth.ts";
import { type Db, openDb } from "#src/db.ts";
import { tCurrencyRate, tStreamCursor } from "#src/schema.ts";

const STREAM = "cxapi";

function parseFromArg(): number | null {
    const arg = process.argv[2];
    if (!arg) return null;
    const n = Number(arg);
    if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`Invalid from-hour arg: ${arg}. Expected a unix timestamp in seconds.`);
    }
    return Math.floor(n / 3600) * 3600;
}

function previousHour(): number {
    return Math.floor(Date.now() / 3_600_000) * 3600 - 3600;
}

export async function ingestCx(db: Db, client: PoeApiClient, fromHour?: number) {
    const [row] = await db
        .select()
        .from(tStreamCursor)
        .where(eq(tStreamCursor.streamName, STREAM))
        .limit(1);

    const id = fromHour ?? (row ? Number(row.cursor) : previousHour());
    const snap = await client.public.currencyExchange({ realm: REALM, id });

    const rows = snap.markets
        .filter((m) => m.league === LEAGUE)
        .map((m) => ({
            league: m.league,
            marketId: m.market_id,
            observedHour: id,
            lowestRatio: m.lowest_ratio,
            highestRatio: m.highest_ratio,
            volumeTraded: m.volume_traded,
            lowestStock: m.lowest_stock,
            highestStock: m.highest_stock,
        }));

    if (rows.length > 0) {
        await db.insert(tCurrencyRate).values(rows).onConflictDoNothing();
    }

    const nextCursor = String(snap.next_change_id);
    const now = new Date();
    if (row) {
        await db
            .update(tStreamCursor)
            .set({ cursor: nextCursor, updatedAt: now })
            .where(eq(tStreamCursor.streamName, STREAM));
    } else {
        await db.insert(tStreamCursor).values({
            streamName: STREAM,
            cursor: nextCursor,
            updatedAt: now,
        });
    }

    const caughtUp = String(id) === nextCursor;
    console.log(
        `cxapi: hour=${id} league=${LEAGUE} markets=${rows.length}/${snap.markets.length}${
            caughtUp ? " [caught up]" : ""
        }`,
    );

    if (rows.length === 0 && snap.markets.length > 0) {
        const seen = [...new Set(snap.markets.map((m) => m.league))].sort();
        console.warn(
            `no markets matched POE_LEAGUE=${JSON.stringify(LEAGUE)}. Leagues in this hour:\n  ${seen.join("\n  ")}`,
        );
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    ingestCx(openDb(), createPoeClient(), parseFromArg() ?? undefined).catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
