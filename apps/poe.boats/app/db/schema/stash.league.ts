import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { bigint, json, mysqlTable, primaryKey, varchar } from "drizzle-orm/mysql-core";
import { timestampCols } from "~/db/helpers/schema";
import { type StashGame, stashTableName } from "~/db/helpers/stash-game";

/**
 * Every league GGG's league API has listed for the realm, pushed hourly by the ingest workers.
 * Times are epoch seconds. `endedAt` is set once, when the league leaves the list or its `endAt`
 * passes, and is cleared if the league is listed again.
 */
function stashLeague(game: StashGame) {
    return mysqlTable(
        stashTableName(game, "league"),
        {
            realm: varchar({ length: 10 }).notNull(),
            league: varchar({ length: 100 }).notNull(),
            category: varchar({ length: 100 }),
            rules: json().$type<string[]>().notNull(),
            startAt: bigint({ mode: "number" }),
            endAt: bigint({ mode: "number" }),
            firstListedAt: bigint({ mode: "number" }).notNull(),
            lastListedAt: bigint({ mode: "number" }).notNull(),
            endedAt: bigint({ mode: "number" }),
            ...timestampCols,
        },
        (table) => [primaryKey({ columns: [table.realm, table.league] })],
    );
}
export const tStashPoe1League = stashLeague("poe1");
export const tStashPoe2League = stashLeague("poe2");
export const tStashLeague = { poe1: tStashPoe1League, poe2: tStashPoe2League };
export type TStashLeagueS = InferSelectModel<typeof tStashPoe1League>;
export type TStashLeagueI = InferInsertModel<typeof tStashPoe1League>;
