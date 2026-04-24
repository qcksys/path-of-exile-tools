import type { PublicStashChange } from "@poe-tools/api-client";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { createPoeClient, LEAGUE, REALM } from "#src/auth.ts";
import { type Db, openDb } from "#src/db.ts";
import { itemKey } from "#src/item_key.ts";
import { extractListingPrice } from "#src/price.ts";
import { tListing, tStreamCursor } from "#src/schema.ts";
import { matches } from "#src/watchlist.ts";

const STREAM = "psapi";
const DEFAULT_PAGES = 3;

interface PageResult {
  nextCursor: string;
  stashCount: number;
  inserted: number;
  updated: number;
  removed: number;
}

async function applyStashChange(
  db: Db,
  change: PublicStashChange,
  now: Date,
): Promise<{ inserted: number; updated: number; removed: number }> {
  if (!change.accountName) return { inserted: 0, updated: 0, removed: 0 };
  if (change.league && change.league !== LEAGUE) return { inserted: 0, updated: 0, removed: 0 };

  const accountName = change.accountName;
  const stashId = change.id;

  const existing = await db
    .select()
    .from(tListing)
    .where(
      and(
        eq(tListing.accountName, accountName),
        eq(tListing.stashId, stashId),
        isNull(tListing.removedAt),
      ),
    );
  const existingById = new Map(existing.map((e) => [e.itemId, e]));

  const currentIds = new Set<string>();
  let inserted = 0;
  let updated = 0;

  for (const item of change.items) {
    if (!item.id) continue;
    if (!matches(item)) continue;

    currentIds.add(item.id);
    const price = extractListingPrice(item, change.stash);
    const row = {
      accountName,
      stashId,
      itemId: item.id,
      league: change.league ?? LEAGUE,
      itemKey: itemKey(item),
      identified: item.identified,
      typeLine: item.typeLine,
      baseType: item.baseType,
      name: item.identified ? item.name : null,
      corrupted: item.corrupted ?? false,
      foilVariation: item.foilVariation ?? null,
      priceAmount: price?.amount ?? null,
      priceCurrency: price?.currency ?? null,
      firstSeenAt: now,
      lastSeenAt: now,
      removedAt: null,
    };

    const prior = existingById.get(item.id);
    if (prior) updated++;
    else inserted++;

    await db
      .insert(tListing)
      .values(row)
      .onConflictDoUpdate({
        target: [tListing.accountName, tListing.stashId, tListing.itemId],
        set: {
          itemKey: row.itemKey,
          typeLine: row.typeLine,
          baseType: row.baseType,
          name: row.name,
          corrupted: row.corrupted,
          foilVariation: row.foilVariation,
          priceAmount: row.priceAmount,
          priceCurrency: row.priceCurrency,
          lastSeenAt: row.lastSeenAt,
          removedAt: null,
        },
      });
  }

  const goneIds = existing.filter((e) => !currentIds.has(e.itemId)).map((e) => e.itemId);
  if (goneIds.length > 0) {
    await db
      .update(tListing)
      .set({ removedAt: now })
      .where(
        and(
          eq(tListing.accountName, accountName),
          eq(tListing.stashId, stashId),
          inArray(tListing.itemId, goneIds),
        ),
      );
  }

  return { inserted, updated, removed: goneIds.length };
}

async function ingestPage(
  db: Db,
  client: ReturnType<typeof createPoeClient>,
  cursor: string | undefined,
): Promise<PageResult> {
  const page = await client.public.stashTabs(
    cursor ? { realm: REALM, id: cursor } : { realm: REALM },
  );
  const now = new Date();

  let inserted = 0;
  let updated = 0;
  let removed = 0;

  for (const change of page.stashes) {
    const res = await applyStashChange(db, change, now);
    inserted += res.inserted;
    updated += res.updated;
    removed += res.removed;
  }

  return {
    nextCursor: page.next_change_id,
    stashCount: page.stashes.length,
    inserted,
    updated,
    removed,
  };
}

async function main() {
  const pages = Math.max(1, Number(process.argv[2] ?? DEFAULT_PAGES));
  const db = openDb();
  const client = createPoeClient();

  const [row] = await db
    .select()
    .from(tStreamCursor)
    .where(eq(tStreamCursor.streamName, STREAM))
    .limit(1);
  let cursor: string | undefined = row?.cursor;

  for (let i = 0; i < pages; i++) {
    const res = await ingestPage(db, client, cursor);
    console.log(
      `page ${i + 1}/${pages}: stashes=${res.stashCount} ins=${res.inserted} upd=${res.updated} rem=${res.removed} next=${res.nextCursor.slice(0, 12)}...`,
    );

    const now = new Date();
    if (cursor === undefined && !row) {
      await db.insert(tStreamCursor).values({
        streamName: STREAM,
        cursor: res.nextCursor,
        updatedAt: now,
      });
    } else {
      await db
        .update(tStreamCursor)
        .set({ cursor: res.nextCursor, updatedAt: now })
        .where(eq(tStreamCursor.streamName, STREAM));
    }
    cursor = res.nextCursor;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
