import type { Item } from "@poe-tools/api-client";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { openDb } from "#src/db.ts";
import { decodeIconAsset } from "#src/icon.ts";
import { itemKey } from "#src/item_key.ts";
import { tIconBasemap, tListing } from "#src/schema.ts";

/**
 * One-shot rebuild of derived state:
 *   1. Backfill `listing.icon_asset` on rows that have `raw_item` but no
 *      icon extracted yet (i.e. rows ingested before the column existed).
 *   2. Rebuild `icon_basemap` from every identified unique (frameType=3,
 *      identified=true, name present, decodable icon) in `listing`.
 *   3. Refresh `listing.item_key` from `raw_item + icon_asset` — needed
 *      after the unid key switched from `unid:${baseType}` to
 *      `unid:${iconAsset}`.
 *
 * Safe to re-run. Basemap upserts accumulate `seen_count` conservatively.
 */
async function main() {
  const db = openDb();
  const now = new Date();

  const toBackfill = await db
    .select({
      accountName: tListing.accountName,
      stashId: tListing.stashId,
      itemId: tListing.itemId,
      rawItem: tListing.rawItem,
    })
    .from(tListing)
    .where(and(isNull(tListing.iconAsset), isNotNull(tListing.rawItem)));

  let filled = 0;
  for (const r of toBackfill) {
    const asset = decodeIconAsset(r.rawItem?.icon);
    if (!asset) continue;
    await db
      .update(tListing)
      .set({ iconAsset: asset })
      .where(
        and(
          eq(tListing.accountName, r.accountName),
          eq(tListing.stashId, r.stashId),
          eq(tListing.itemId, r.itemId),
        ),
      );
    filled++;
  }
  console.log(`backfilled icon_asset on ${filled}/${toBackfill.length} rows.`);

  const identifiedUniques = await db
    .select({ iconAsset: tListing.iconAsset, rawItem: tListing.rawItem })
    .from(tListing)
    .where(and(eq(tListing.identified, true), isNotNull(tListing.iconAsset)));

  const counts = new Map<string, { name: string; baseType: string; n: number }>();
  for (const row of identifiedUniques) {
    const item = row.rawItem as Item | null;
    if (!item) continue;
    if (item.frameType !== 3) continue; // 3 = unique
    if (!item.name) continue;
    const key = row.iconAsset;
    if (!key) continue;
    const existing = counts.get(key);
    if (existing) existing.n++;
    else counts.set(key, { name: item.name, baseType: item.baseType, n: 1 });
  }

  let upserts = 0;
  for (const [iconAsset, { name, baseType, n }] of counts) {
    await db
      .insert(tIconBasemap)
      .values({
        iconAsset,
        name,
        baseType,
        seenCount: n,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: tIconBasemap.iconAsset,
        set: {
          seenCount: sql`${tIconBasemap.seenCount} + ${n}`,
          lastSeenAt: now,
        },
      });
    upserts++;
  }

  console.log(`basemap: ${upserts} distinct icon_asset → name entries.`);

  const unidWithResolvable = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(tListing)
    .leftJoin(tIconBasemap, eq(tListing.iconAsset, tIconBasemap.iconAsset))
    .where(and(eq(tListing.identified, false), isNotNull(tIconBasemap.name)));
  console.log(`unidentified listings now resolvable via basemap: ${unidWithResolvable[0]?.n ?? 0}`);

  // Refresh item_key from current logic (unid → icon_asset, not base_type).
  const keyable = await db
    .select({
      accountName: tListing.accountName,
      stashId: tListing.stashId,
      itemId: tListing.itemId,
      iconAsset: tListing.iconAsset,
      rawItem: tListing.rawItem,
      currentKey: tListing.itemKey,
    })
    .from(tListing)
    .where(isNotNull(tListing.rawItem));

  let rekeyed = 0;
  for (const r of keyable) {
    const item = r.rawItem as Item | null;
    if (!item) continue;
    const next = itemKey(item, r.iconAsset);
    if (next === r.currentKey) continue;
    await db
      .update(tListing)
      .set({ itemKey: next })
      .where(
        and(
          eq(tListing.accountName, r.accountName),
          eq(tListing.stashId, r.stashId),
          eq(tListing.itemId, r.itemId),
        ),
      );
    rekeyed++;
  }
  console.log(`refreshed item_key on ${rekeyed}/${keyable.length} rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
