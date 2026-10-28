import { DB_TABLE_PREFIX } from "~/const";

/** Each game stores stash data in its own tables, so their structures and indexes can diverge. */
export const STASH_GAMES = ["poe1", "poe2"] as const;
export type StashGame = (typeof STASH_GAMES)[number];

export function stashGame(realm: string): StashGame {
    return realm === "poe2" ? "poe2" : "poe1";
}

export function stashTableName(game: StashGame, name: string) {
    return `${DB_TABLE_PREFIX}stash_${game}_${name}`;
}
