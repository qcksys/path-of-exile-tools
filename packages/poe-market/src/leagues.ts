import { z } from "zod";

/** One league as GGG's league API lists it; times are epoch seconds. */
export const listedLeagueSchema = z.object({
    id: z.string().min(1).max(100),
    category: z.string().max(100).nullable(),
    rules: z.array(z.string().max(100)).max(20),
    startAt: z.number().int().nonnegative().nullable(),
    endAt: z.number().int().nonnegative().nullable(),
});
export type ListedLeague = z.infer<typeof listedLeagueSchema>;

/** A realm's complete league list at `listedAt`; leagues missing from it have ended. */
export const leagueListSchema = z.object({
    realm: z.enum(["pc", "poe2", "xbox", "sony"]),
    listedAt: z.number().int().nonnegative(),
    rows: z.array(listedLeagueSchema).min(1).max(500),
});
export type LeagueList = z.infer<typeof leagueListSchema>;
