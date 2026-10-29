import type { League, PoeApiClient } from "@poe-tools/api-client";
import type { ListedLeague } from "@poe-tools/market";
import { REALM } from "#src/shared/auth.ts";
import { push } from "#src/shared/remote/push.ts";

const LEAGUE_PAGE_SIZE = 50;
// A guard against an offset the API ignores; realms list a few dozen leagues.
const MAX_LEAGUE_PAGES = 10;

/**
 * Resolve a `--league` CLI arg.
 *   - `all` (default) → null, meaning "any league"
 *   - explicit league name → returned as-is
 */
export function parseLeagueFilter(arg: string | undefined): string | null {
    if (!arg || arg === "all") return null;
    return arg;
}

/** Every league the API lists for the worker's realm, following pages. */
export async function listLeagues(client: PoeApiClient): Promise<League[]> {
    const leagues = new Map<string, League>();
    for (let page = 0; page < MAX_LEAGUE_PAGES; page++) {
        const batch = await client.league.list({
            realm: REALM,
            limit: LEAGUE_PAGE_SIZE,
            offset: page * LEAGUE_PAGE_SIZE,
        });
        const before = leagues.size;
        for (const league of batch) leagues.set(league.id, league);
        if (batch.length < LEAGUE_PAGE_SIZE || leagues.size === before) break;
    }
    return [...leagues.values()];
}

function epochSeconds(value: string | undefined) {
    const time = value ? Date.parse(value) : Number.NaN;
    return Number.isFinite(time) ? Math.floor(time / 1000) : null;
}

export function listedLeague(league: League): ListedLeague {
    return {
        id: league.id,
        category: league.category?.id ?? null,
        rules: (league.rules ?? []).map((rule) => rule.id),
        startAt: epochSeconds(league.startAt),
        endAt: epochSeconds(league.endAt),
    };
}

/** Sends poe.boats the realm's complete league list, so it can tell which leagues have ended. */
export async function deliverLeagues(client: PoeApiClient, opts: { dryRun?: boolean } = {}) {
    const leagues = await listLeagues(client);
    // An empty list would end every stored league.
    if (!leagues.length) throw new Error("The league API listed no leagues.");
    await push(
        {
            stream: "leagues",
            realm: REALM ?? "pc",
            listedAt: Math.floor(Date.now() / 1000),
            rows: leagues.map(listedLeague),
        },
        opts,
    );
    return leagues.length;
}
