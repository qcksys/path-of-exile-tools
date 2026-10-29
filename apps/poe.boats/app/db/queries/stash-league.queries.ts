import type { LeagueList } from "@poe-tools/market";
import { and, eq, isNotNull, isNull, lt, notInArray, sql } from "drizzle-orm";
import type { TDatabase } from "~/db/client.ts";
import { stashGame } from "~/db/helpers/stash-game";
import { tStashLeague } from "~/db/schema/stash.league";

/**
 * Stores a realm's complete league list and ends the stored leagues it no longer contains.
 * A list older than a league's latest listing never ends that league, so deliveries may arrive
 * out of order.
 */
export async function recordStashLeagues(db: TDatabase, list: LeagueList) {
    const table = tStashLeague[stashGame(list.realm)];
    await db
        .insert(table)
        .values(
            list.rows.map((league) => ({
                realm: list.realm,
                league: league.id,
                category: league.category,
                rules: league.rules,
                startAt: league.startAt,
                endAt: league.endAt,
                firstListedAt: list.listedAt,
                lastListedAt: list.listedAt,
                endedAt:
                    league.endAt !== null && league.endAt <= list.listedAt ? league.endAt : null,
            })),
        )
        .onDuplicateKeyUpdate({
            set: {
                category: sql`values(${table.category})`,
                rules: sql`values(${table.rules})`,
                startAt: sql`values(${table.startAt})`,
                endAt: sql`values(${table.endAt})`,
                firstListedAt: sql`least(${table.firstListedAt}, values(${table.firstListedAt}))`,
                lastListedAt: sql`greatest(${table.lastListedAt}, values(${table.lastListedAt}))`,
                // Drizzle assigns in column order, so `lastListedAt` already holds the newer listing:
                // an older list leaves the league as it is.
                endedAt: sql`if(values(${table.lastListedAt}) < ${table.lastListedAt}, ${table.endedAt}, if(values(${table.endedAt}) is null, null, coalesce(${table.endedAt}, values(${table.endedAt}))))`,
            },
        });
    await db
        .update(table)
        .set({ endedAt: list.listedAt })
        .where(
            and(
                eq(table.realm, list.realm),
                isNull(table.endedAt),
                lt(table.lastListedAt, list.listedAt),
                notInArray(
                    table.league,
                    list.rows.map((league) => league.id),
                ),
            ),
        );
    return list.rows.length;
}

/** The realm's stored leagues that have ended, by name. */
export async function endedStashLeagues(db: TDatabase, realm: string) {
    const table = tStashLeague[stashGame(realm)];
    const rows = await db
        .select({ league: table.league })
        .from(table)
        .where(and(eq(table.realm, realm), isNotNull(table.endedAt)));
    return new Set(rows.map((row) => row.league));
}
