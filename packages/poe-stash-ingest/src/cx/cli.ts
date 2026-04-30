#!/usr/bin/env node
import { Command } from "commander";
import { ingestCx } from "#src/cx/ingest.ts";
import { rollupCx } from "#src/cx/rollup.ts";
import { createPoeClient } from "#src/shared/auth.ts";
import { getCursor, setCursor } from "#src/shared/cursor.ts";
import { openDb } from "#src/shared/db.ts";
import { parseLeagueFilter } from "#src/shared/leagues.ts";

const program = new Command();
program
    .name("poe-stash-cx")
    .description(
        "Currency-exchange (cxapi) ingestor → local DuckDB → hourly summaries to poe.boats",
    )
    .showHelpAfterError();

program
    .command("ingest")
    .description("Pull one cxapi hour. With --catch-up, walk forward until tail.")
    .option("-h, --from-hour <unix>", "explicit unix-hour seconds; overrides saved cursor")
    .option("--catch-up", "walk forward until next_change_id stops advancing")
    .action(async (opts) => {
        const db = await openDb();
        try {
            const client = createPoeClient();
            const results = await ingestCx(db.conn, client, {
                fromHour: opts.fromHour ? Number(opts.fromHour) : undefined,
                catchUp: !!opts.catchUp,
            });
            console.log(`done — ${results.length} hour(s) ingested.`);
        } finally {
            await db.close();
        }
    });

program
    .command("rollup")
    .description("Aggregate cx_market_hour for a single hour and POST to poe.boats.")
    .option("-h, --hour <unix>", "unix-hour (defaults to previous completed hour)")
    .option("-l, --league <name>", "limit to one league, or 'all' (default: all)", "all")
    .option("--dry-run", "print summary; do not POST")
    .action(async (opts) => {
        const db = await openDb();
        try {
            await rollupCx(db.conn, {
                hour: opts.hour ? Number(opts.hour) : undefined,
                league: parseLeagueFilter(opts.league),
                dryRun: !!opts.dryRun,
            });
        } finally {
            await db.close();
        }
    });

program
    .command("cursor")
    .description("Inspect or set the saved cxapi cursor (unix-hour as decimal).")
    .option("--set <hour>", "overwrite saved cursor")
    .action(async (opts) => {
        const db = await openDb();
        try {
            if (opts.set) {
                await setCursor(db.conn, "cxapi", String(opts.set));
                console.log(`cxapi cursor set to ${opts.set}`);
            } else {
                const c = await getCursor(db.conn, "cxapi");
                console.log(c ? `cxapi cursor: ${c}` : "cxapi cursor: <unset>");
            }
        } finally {
            await db.close();
        }
    });

program.parseAsync().catch((err) => {
    console.error(err);
    process.exit(1);
});
