import {
    FORBIDDEN_JEWEL_LEVEL_KIND,
    gemVariantValues,
    marketObservationRange,
    NORMAL_FORBIDDEN_LEVEL,
    TEMPLE_CHRONICLE,
    UBER_FORBIDDEN_LEVEL,
} from "@poe-tools/market";
import { and, eq, gt, gte, inArray, like, lte, notInArray, or, sql } from "drizzle-orm";
import type { BossItem } from "~/data/boss-encounters";
import type { TDatabase } from "~/db/client";
import { tStashPoe1League as leagueCalendar } from "~/db/schema/stash.league";
import {
    tStashPoe1Market as catalog,
    tStashPoe1UniqueHourly as market,
} from "~/db/schema/stash.unique-hourly";
import { marketCategory } from "~/lib/market-categories.server";
import { MOD_POOL_KINDS } from "~/lib/mod-pools";
import type { LocatedBossQuote } from "~/schemas/boss-rota";
import { marketFiltersSchema, marketLink } from "~/schemas/market";
import { traceQuery } from "~/services/tracing.server";

/** Includes ended leagues whose market history may no longer be available. */
export function findBossLeagues(db: TDatabase) {
    return traceQuery(
        "boss_rota.leagues",
        db
            .select({
                league: leagueCalendar.league,
                startAt: leagueCalendar.startAt,
                firstListedAt: leagueCalendar.firstListedAt,
                rules: leagueCalendar.rules,
            })
            .from(leagueCalendar)
            .where(eq(leagueCalendar.realm, "pc")),
    );
}

/** Lowest matching variant's locked chaos median in the newest listed merchant hour. */
export async function findBossStashQuotes(db: TDatabase, league: string, items: BossItem[]) {
    const names = (kind: BossItem[2]) =>
        items.filter((item) => item[2] === kind).map(([name]) => name);
    const regular = names(undefined);
    const foulborn = names("foulborn");
    const temples = names("temple-room");
    const invitations = names("invitation");
    const corrupted = names("corrupted");
    const mapEntries = names("map-entry");
    const gems = names("gem");
    const unidentified = names("unidentified");
    const quotes = new Map<string, LocatedBossQuote>();
    if (!items.some((item) => item[2] !== "unpriced")) return quotes;
    const { earliestHour, latestHour } = marketObservationRange();
    const label = sql<string>`case when ${market.signatureKind} = 'gem' then ${market.baseType}
        when ${market.signatureKind} = ${FORBIDDEN_JEWEL_LEVEL_KIND} then concat('Unidentified ', ${market.name}, ' (', ${market.signatureValue}, ')')
        when ${market.signatureKind} = 'temple-room' then ${market.signatureValue}
        when ${market.identified} or ${market.itemKey} not like 'unid:%' then ${market.itemKey}
        when ${market.signatureKind} = 'foulborn' then ${market.name}
        else concat('Unidentified ', ${market.name}) end`;
    // The locked merchant quote pools link counts for the same item state and signature.
    const variant = sql`${market.itemKey}, ${market.identified}, ${market.corrupted}, ${market.signatureKind}, ${market.signatureValue}`;
    const ranked = db
        .select({
            label: label.as("boss_item"),
            itemKey: market.itemKey,
            baseType: market.baseType,
            signatureKind: market.signatureKind,
            signatureValue: market.signatureValue,
            links: market.links,
            corrupted: market.corrupted,
            iconAsset: market.iconAsset,
            name: market.name,
            identified: market.identified,
            hour: market.hour,
            unitChaos: market.priceChaos,
            listings:
                sql<number>`sum(${market.listingCount}) over (partition by ${variant}, ${market.hour})`
                    .mapWith(Number)
                    .as("quote_listings"),
            likelySales24h: sql<number>`sum(${market.likelySales}) over (partition by ${variant})`
                .mapWith(Number)
                .as("variant_sales"),
            rank: sql<number>`row_number() over (partition by ${label} order by
                    case when ${market.listingCount} > 0 then 0 else 1 end,
                    case when ${market.signatureKind} = 'foulborn' then
                        case when ${market.priceChaos} > 0 then ${market.identified} else 2 end
                        when ${market.signatureKind} = ${FORBIDDEN_JEWEL_LEVEL_KIND} then
                        case when ${market.priceChaos} > 0 then 0 else 2 end
                        when ${inArray(market.itemKey, invitations)} then
                        case when ${market.priceChaos} > 0 then ${market.corrupted} else 2 end
                        else 0 end,
                    ${market.hour} desc, case when ${market.priceChaos} > 0 then 0 else 1 end,
                    ${market.priceChaos}, ${market.itemKey}, ${market.corrupted},
                    ${market.links}, ${market.signatureKind}, ${market.signatureValue})`.as(
                "quote_rank",
            ),
        })
        .from(market)
        .where(
            and(
                eq(market.realm, "pc"),
                eq(market.league, league),
                eq(market.tab, "merchant"),
                gte(market.hour, earliestHour),
                lte(market.hour, latestHour),
                or(gt(market.listingCount, 0), gt(market.likelySales, 0)),
                or(
                    and(eq(market.identified, true), inArray(market.itemKey, mapEntries)),
                    inArray(market.itemKey, invitations),
                    and(
                        eq(market.identified, false),
                        eq(market.signatureKind, FORBIDDEN_JEWEL_LEVEL_KIND),
                        like(market.itemKey, "unid:%"),
                        or(
                            ...([NORMAL_FORBIDDEN_LEVEL, UBER_FORBIDDEN_LEVEL] as const).map(
                                (level) =>
                                    and(
                                        eq(market.signatureValue, level),
                                        inArray(market.name, names(level)),
                                    ),
                            ),
                        ),
                    ),
                    and(
                        eq(market.signatureKind, "foulborn"),
                        eq(market.corrupted, false),
                        or(
                            and(eq(market.identified, true), inArray(market.itemKey, foulborn)),
                            and(
                                eq(market.identified, false),
                                like(market.itemKey, "unid:%"),
                                inArray(market.name, foulborn),
                            ),
                        ),
                    ),
                    and(
                        eq(market.itemKey, TEMPLE_CHRONICLE),
                        eq(market.signatureKind, "temple-room"),
                        eq(market.identified, true),
                        eq(market.corrupted, false),
                        inArray(market.signatureValue, temples),
                    ),
                    and(
                        eq(market.identified, true),
                        eq(market.corrupted, true),
                        inArray(market.itemKey, corrupted),
                    ),
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
        .as("boss_variants");
    const rows = await traceQuery(
        "boss_rota.stash_quotes",
        db.select().from(ranked).where(eq(ranked.rank, 1)),
    );

    const filters = marketFiltersSchema.parse({ league, currency: "chaos" });
    for (const row of rows) {
        if (!row.listings || row.unitChaos === null || row.unitChaos <= 0) continue;
        const category = marketCategory("pc", row.baseType, row.signatureKind, row.name);
        quotes.set(row.label, {
            source: "stash",
            invitationState: invitations.includes(row.itemKey)
                ? row.corrupted
                    ? "corrupted"
                    : "uncorrupted"
                : undefined,
            foulbornState:
                row.signatureKind === "foulborn"
                    ? row.identified
                        ? "identified"
                        : "unidentified"
                    : undefined,
            hour: row.hour,
            unitChaos: row.unitChaos,
            listings: row.listings,
            likelySales24h: row.likelySales24h,
            market: {
                artName: row.name || row.baseType,
                iconAsset: row.iconAsset,
                href: marketLink({ ...filters, category }, { ...row, links: null }),
                exact: true,
            },
        });
    }
    return quotes;
}

/** Variant-specific drops without a comparable price can still show their base unique's artwork. */
export async function findBossItemArt(db: TDatabase, league: string, itemKeys: string[]) {
    if (!itemKeys.length) return new Map<string, string | null>();
    const rows = await traceQuery(
        "boss_rota.item_art",
        db
            .select({
                itemKey: catalog.itemKey,
                icon: sql<string | null>`min(${catalog.iconAsset})`,
            })
            .from(catalog)
            .where(
                and(
                    eq(catalog.realm, "pc"),
                    eq(catalog.league, league),
                    inArray(catalog.itemKey, itemKeys),
                ),
            )
            .groupBy(catalog.itemKey),
    );
    return new Map(rows.map((row) => [row.itemKey, row.icon]));
}
