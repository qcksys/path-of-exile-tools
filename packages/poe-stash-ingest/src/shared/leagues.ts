import type { League, PoeApiClient } from "@poe-tools/api-client";
import { REALM } from "#src/shared/auth.ts";

/**
 * Resolve a `--league` CLI arg.
 *   - `all` (default) → null, meaning "any league"
 *   - explicit league name → returned as-is
 */
export function parseLeagueFilter(arg: string | undefined): string | null {
    if (!arg || arg === "all") return null;
    return arg;
}

export async function listLeagues(client: PoeApiClient): Promise<League[]> {
    return client.league.list({ realm: REALM });
}
