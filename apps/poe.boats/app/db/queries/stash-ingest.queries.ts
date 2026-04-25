import { sql } from "drizzle-orm";
import type { TDatabase } from "~/db/client.ts";
import { tStashBasemapSnapshot } from "~/db/schema/stash.basemap-snapshot";
import {
  type TStashCurrencyHourlyI,
  tStashCurrencyHourly,
} from "~/db/schema/stash.currency-hourly";
import { type TStashUniqueHourlyI, tStashUniqueHourly } from "~/db/schema/stash.unique-hourly";

const UPSERT_CHUNK = 200;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function upsertStashUniqueHourly(
  db: TDatabase,
  rows: TStashUniqueHourlyI[],
): Promise<number> {
  if (rows.length === 0) return 0;
  let written = 0;
  for (const batch of chunk(rows, UPSERT_CHUNK)) {
    await db
      .insert(tStashUniqueHourly)
      .values(batch)
      .onDuplicateKeyUpdate({
        set: {
          iconAsset: sql`values(${tStashUniqueHourly.iconAsset})`,
          name: sql`values(${tStashUniqueHourly.name})`,
          baseType: sql`values(${tStashUniqueHourly.baseType})`,
          frameType: sql`values(${tStashUniqueHourly.frameType})`,
          listingCount: sql`values(${tStashUniqueHourly.listingCount})`,
          uniqueSellers: sql`values(${tStashUniqueHourly.uniqueSellers})`,
          prices: sql`values(${tStashUniqueHourly.prices})`,
          signatureData: sql`values(${tStashUniqueHourly.signatureData})`,
          firstSeenAt: sql`values(${tStashUniqueHourly.firstSeenAt})`,
          lastSeenAt: sql`values(${tStashUniqueHourly.lastSeenAt})`,
        },
      });
    written += batch.length;
  }
  return written;
}

export async function upsertStashCurrencyHourly(
  db: TDatabase,
  rows: TStashCurrencyHourlyI[],
): Promise<number> {
  if (rows.length === 0) return 0;
  let written = 0;
  for (const batch of chunk(rows, UPSERT_CHUNK)) {
    await db
      .insert(tStashCurrencyHourly)
      .values(batch)
      .onDuplicateKeyUpdate({
        set: {
          lowestRatio: sql`values(${tStashCurrencyHourly.lowestRatio})`,
          highestRatio: sql`values(${tStashCurrencyHourly.highestRatio})`,
          volumeTraded: sql`values(${tStashCurrencyHourly.volumeTraded})`,
          lowestStock: sql`values(${tStashCurrencyHourly.lowestStock})`,
          highestStock: sql`values(${tStashCurrencyHourly.highestStock})`,
        },
      });
    written += batch.length;
  }
  return written;
}

export async function upsertStashBasemapSnapshot(
  db: TDatabase,
  rows: Array<{ iconAsset: string; name: string; baseType: string; seenCount: number }>,
): Promise<number> {
  if (rows.length === 0) return 0;
  let written = 0;
  for (const batch of chunk(rows, UPSERT_CHUNK)) {
    await db
      .insert(tStashBasemapSnapshot)
      .values(batch)
      .onDuplicateKeyUpdate({
        set: {
          name: sql`values(${tStashBasemapSnapshot.name})`,
          baseType: sql`values(${tStashBasemapSnapshot.baseType})`,
          seenCount: sql`values(${tStashBasemapSnapshot.seenCount})`,
        },
      });
    written += batch.length;
  }
  return written;
}
