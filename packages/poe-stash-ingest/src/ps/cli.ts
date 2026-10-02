#!/usr/bin/env node
import { Command } from "commander";
import { flushRollups, runPipeline } from "#src/pipeline.ts";
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
    .option("-l, --league <name>", "season to capture (use a separate database per season)", "all")
    .action(async (opts) => {
        const db = await openDb();
        try {
            const client = createPoeClient();
            const result = await ingestPs(db.conn, client, {
                pages: Number(opts.pages),
                cursor: opts.cursor,
                league: parseLeagueFilter(opts.league),
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
        "target row cap; active listings and sale evidence are kept",
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
                    `capDrop=${result.droppedByCap} after=${result.afterRows} ` +
                    `hourlyDrop=${result.droppedHourlyRows}`,
            );
        } finally {
            await db.close();
        }
    });

program
    .command("process")
    .description("Ingest, evaluate sales, and retry all pending completed hours.")
    .option("-p, --pages <n>", "maximum stash pages per cycle", "50")
    .option("-l, --league <name>", "season to capture", "all")
    .option("-c, --cursor <id>", "initial stash cursor; applied only on the first cycle")
    .option("--no-currency", "skip the currency exchange source")
    .option("--watch", "continue processing every minute; Ctrl+C to stop")
    .action(async (opts) => {
        const db = await openDb();
        const client = createPoeClient();
        let cursor = opts.cursor;
        try {
            do {
                try {
                    const result = await runPipeline(db.conn, client, {
                        pages: Number(opts.pages),
                        league: parseLeagueFilter(opts.league),
                        cursor,
                        currency: opts.currency,
                    });
                    console.log(JSON.stringify(result));
                } catch (error) {
                    if (!opts.watch) throw error;
                    console.error(
                        "Processing failed; saved cursors and pending deliveries will be retried.",
                        error,
                    );
                }
                if (await getCursor(db.conn, "psapi")) cursor = undefined;
                if (opts.watch) await new Promise((resolve) => setTimeout(resolve, 60_000));
            } while (opts.watch);
        } finally {
            await db.close();
        }
    });

program
    .command("flush")
    .description("Replay pending completed hours, including late mappings and sale corrections.")
    .option("-l, --league <name>", "season to deliver", "all")
    .option("--dry-run", "do not POST or mark delivered")
    .action(async (opts) => {
        const db = await openDb();
        try {
            console.log(
                await flushRollups(db.conn, {
                    league: parseLeagueFilter(opts.league),
                    dryRun: opts.dryRun,
                }),
            );
        } finally {
            await db.close();
        }
    });

program.parseAsync().catch((err) => {
    console.error(err);
    process.exit(1);
});
