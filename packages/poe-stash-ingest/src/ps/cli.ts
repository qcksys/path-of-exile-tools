#!/usr/bin/env node
import { Command } from "commander";
import { rebuildBasemap } from "#src/ps/basemap-rebuild.ts";
import { ingestPs } from "#src/ps/ingest.ts";
import { rollupPs } from "#src/ps/rollup.ts";
import { createPoeClient } from "#src/shared/auth.ts";
import { getCursor, setCursor } from "#src/shared/cursor.ts";
import { openDb } from "#src/shared/db.ts";
import { parseLeagueFilter } from "#src/shared/leagues.ts";
import { prune } from "#src/shared/prune.ts";

const program = new Command();
program
    .name("poe-stash-ps")
    .description("Public-stash (psapi) ingestor → local DuckDB → hourly summaries to poe.boats")
    .showHelpAfterError();

program
    .command("ingest")
    .description("Walk N pages of psapi, upsert listings, learn basemap, extract mod signatures.")
    .option("-p, --pages <n>", "number of pages to fetch", "3")
    .option("-c, --cursor <id>", "explicit cursor (overrides saved); seed once, then omit")
    .action(async (opts) => {
        const db = await openDb();
        try {
            const client = createPoeClient();
            const result = await ingestPs(db.conn, client, {
                pages: Math.max(1, Number(opts.pages)),
                cursor: opts.cursor,
            });
            const top = [...result.leagues.entries()]
                .sort((a, b) => b[1].stashes - a[1].stashes)
                .slice(0, 5)
                .map(([l, v]) => `${l}:${v.stashes}/${v.items}`)
                .join(" ");
            console.log(
                `done — pages=${result.pages} stashes=${result.stashes} ` +
                    `(public=${result.publicStashes}) ins=${result.inserted} ` +
                    `upd=${result.updated} rem=${result.removed}\nleagues: ${top}`,
            );
        } finally {
            await db.close();
        }
    });

program
    .command("rollup")
    .description("Aggregate captured listings into the hourly summary and POST to poe.boats.")
    .option("-h, --hour <unixhour>", "unix-hour to roll up (defaults to previous completed hour)")
    .option("-l, --league <name>", "limit to one league, or 'all' (default: all)", "all")
    .option("--dry-run", "print summary; do not POST")
    .action(async (opts) => {
        const db = await openDb();
        try {
            await rollupPs(db.conn, {
                hour: opts.hour ? Number(opts.hour) : undefined,
                league: parseLeagueFilter(opts.league),
                dryRun: !!opts.dryRun,
            });
        } finally {
            await db.close();
        }
    });

program
    .command("basemap")
    .description("Rebuild icon_basemap from identified uniques already in the DB.")
    .action(async () => {
        const db = await openDb();
        try {
            await rebuildBasemap(db.conn);
        } finally {
            await db.close();
        }
    });

program
    .command("cursor")
    .description("Inspect or set the saved psapi cursor.")
    .option("--set <id>", "overwrite saved cursor")
    .action(async (opts) => {
        const db = await openDb();
        try {
            if (opts.set) {
                await setCursor(db.conn, "psapi", opts.set);
                console.log(`psapi cursor set to ${opts.set.slice(0, 16)}…`);
            } else {
                const c = await getCursor(db.conn, "psapi");
                console.log(c ? `psapi cursor: ${c}` : "psapi cursor: <unset>");
            }
        } finally {
            await db.close();
        }
    });

program
    .command("prune")
    .description(
        "Trim local ps_listing to a row cap and/or age cap. Remote summaries are unaffected.",
    )
    .option(
        "--max-rows <n>",
        "hard row cap (default $PS_LOCAL_MAX_ROWS or 2_000_000)",
        process.env.PS_LOCAL_MAX_ROWS,
    )
    .option(
        "--keep-days <n>",
        "drop rows last seen older than this (default $PS_LOCAL_KEEP_DAYS or 30)",
        process.env.PS_LOCAL_KEEP_DAYS,
    )
    .option("--dry-run", "report what would be deleted; make no changes")
    .action(async (opts) => {
        const db = await openDb();
        try {
            const result = await prune(db.conn, {
                maxRows: Number(opts.maxRows ?? 2_000_000),
                keepDays: Number(opts.keepDays ?? 30),
                dryRun: !!opts.dryRun,
            });
            console.log(
                `prune${opts.dryRun ? " (dry-run)" : ""}: ` +
                    `before=${result.beforeRows} ageDrop=${result.droppedByAge} ` +
                    `capDrop=${result.droppedByCap} after=${result.afterRows}`,
            );
        } finally {
            await db.close();
        }
    });

program.parseAsync().catch((err) => {
    console.error(err);
    process.exit(1);
});
