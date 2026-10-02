import type { LeagueType } from "@poe-tools/api-client";
import { createPoeClient, REALM } from "#src/auth.ts";

function fmtDate(iso: string | undefined): string {
    return iso ? iso.slice(0, 10) : "-";
}

export async function listLeagues(type?: LeagueType) {
    const client = createPoeClient();

    const leagues = await client.league.list({ realm: REALM, type, limit: 50 });

    if (leagues.length === 0) {
        console.log("No leagues returned.");
        return;
    }

    const now = Date.now();
    const rows = leagues.map((l) => {
        const startMs = l.startAt ? Date.parse(l.startAt) : Number.NaN;
        const endMs = l.endAt ? Date.parse(l.endAt) : Number.NaN;
        const started = !Number.isNaN(startMs) ? startMs <= now : true;
        const ended = !Number.isNaN(endMs) && endMs < now;
        return {
            id: l.id,
            realm: l.realm ?? "pc",
            start: fmtDate(l.startAt),
            end: fmtDate(l.endAt),
            active: started && !ended ? "yes" : "",
            event: l.event ? "yes" : "",
        };
    });

    console.table(rows);
}
