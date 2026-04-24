import { eq } from "drizzle-orm";
import { createPoeClient, LEAGUE, REALM } from "#src/auth.ts";
import { openDb } from "#src/db.ts";
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

async function main() {
  const db = openDb();
  const client = createPoeClient();
  const override = parseFromArg();

  const [row] = await db
    .select()
    .from(tStreamCursor)
    .where(eq(tStreamCursor.streamName, STREAM))
    .limit(1);

  const id = override ?? (row ? Number(row.cursor) : previousHour());
  const snap = await client.public.currencyExchange({ realm: REALM, id });

  const rows = snap.markets
    .filter((m) => m.league === LEAGUE)
    .map((m) => ({
      league: m.league,
      marketId: m.market_id,
      observedHour: snap.next_change_id,
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
    `cxapi: hour=${snap.next_change_id} league=${LEAGUE} markets=${rows.length}/${snap.markets.length}${
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
