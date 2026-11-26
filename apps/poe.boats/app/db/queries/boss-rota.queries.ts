import { gemVariantValues, marketObservationRange } from "@poe-tools/market";
import { and, desc, eq, gt, gte, inArray, like, lte, min, notInArray, or } from "drizzle-orm";
import type { BossItem } from "~/data/boss-encounters";
import type { TDatabase } from "~/db/client";
import { tStashPoe1UniqueHourly as market } from "~/db/schema/stash.unique-hourly";
import { MOD_POOL_KINDS } from "~/lib/mod-pools";
import type { BossQuote } from "~/schemas/boss-rota";
import { traceQuery } from "~/services/tracing.server";

/** Lowest matching variant's locked chaos median in the newest listed merchant hour. */
export async function findBossStashQuotes(db: TDatabase, league: string, items: BossItem[]) {
    const names = (kind: BossItem[2]) =>
        items.filter((item) => item[2] === kind).map(([name]) => name);
    const regular = names(undefined);
    const mapEntries = names("map-entry");
    const gems = names("gem");
    const unidentified = names("unidentified");
    const quotes = new Map<string, BossQuote>();
    if (!regular.length && !mapEntries.length && !gems.length && !unidentified.length)
        return quotes;
    const { earliestHour, latestHour } = marketObservationRange();
    const rows = await traceQuery(
        "boss_rota.stash_quotes",
        db
            .select({
                itemKey: market.itemKey,
                baseType: market.baseType,
                signatureKind: market.signatureKind,
                name: market.name,
                identified: market.identified,
                hour: market.hour,
                unitChaos: min(market.priceChaos),
            })
            .from(market)
            .where(
                and(
                    eq(market.realm, "pc"),
                    eq(market.league, league),
                    eq(market.tab, "merchant"),
                    gte(market.hour, earliestHour),
                    lte(market.hour, latestHour),
                    gt(market.listingCount, 0),
                    or(
                        and(eq(market.identified, true), inArray(market.itemKey, mapEntries)),
                        and(
                            eq(market.identified, true),
                            eq(market.corrupted, false),
                            or(
                                and(
                                    inArray(market.itemKey, regular),
                                    or(
                                        notInArray(market.signatureKind, [...MOD_POOL_KINDS]),
                                        eq(market.signatureValue, ""),
                                    ),
                                ),
                                and(
                                    inArray(market.baseType, gems),
                                    eq(market.signatureKind, "gem"),
                                    inArray(
                                        market.signatureValue,
                                        gemVariantValues({ gemLevel: "1-19", gemQuality: "0-19" })!,
                                    ),
                                ),
                            ),
                        ),
                        and(
                            eq(market.identified, false),
                            like(market.itemKey, "unid:%"),
                            inArray(market.name, unidentified),
                            or(eq(market.corrupted, false), eq(market.name, "Impossible Escape")),
                        ),
                    ),
                ),
            )
            .groupBy(
                market.itemKey,
                market.baseType,
                market.signatureKind,
                market.name,
                market.identified,
                market.hour,
            )
            .orderBy(desc(market.hour)),
    );

    const newest = new Map<string, number>();
    for (const row of rows) {
        // A support gem that grants a skill can have that skill as its stash item key.
        const name =
            row.signatureKind === "gem"
                ? row.baseType
                : row.identified
                  ? row.itemKey
                  : `Unidentified ${row.name}`;
        const hour = newest.get(name) ?? row.hour;
        newest.set(name, hour);
        if (row.hour !== hour || row.unitChaos === null || row.unitChaos <= 0) continue;
        if (row.unitChaos < (quotes.get(name)?.unitChaos ?? Infinity))
            quotes.set(name, { source: "stash", hour, unitChaos: row.unitChaos });
    }
    return quotes;
}
