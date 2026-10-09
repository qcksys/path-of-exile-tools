#!/usr/bin/env node
import { Command, positiveInteger, runCli } from "@poe-tools/cli";

const program = new Command();
program
    .name("poe-stash-ps")
    .description("Public-stash (psapi) ingestor → local DuckDB → hourly summaries to poe.boats")
    .showHelpAfterError();

program
    .command("probe-replay")
    .description(
        "Read-only comparison of full and selected-field stash hashes across following pages.",
    )
    .requiredOption("--day <date>", "sample UTC date (YYYY-MM-DD)")
    .requiredOption("-l, --league <name>", "checkpoint capture scope, including 'all'")
    .option("--pages <n>", "maximum pages to inspect (1–25)", positiveInteger, 5)
    .action(async (opts) => {
        const { probeSample, checkpointRange } = await import("#src/ps/checkpoints.ts");
        const { createPoeClient, REALM } = await import("#src/shared/auth.ts");
        const to = new Date(Date.parse(`${opts.day}T00:00:00Z`) + 86_400_000)
            .toISOString()
            .slice(0, 10);
        const result = await probeSample(
            createPoeClient(),
            checkpointRange(opts.league, opts.day, to, REALM),
            { pages: Number(opts.pages) },
        );
        console.log(JSON.stringify(result));
        if (result.status !== "selected-fields-matched")
            throw new Error(
                "Original selected-field fingerprints were not all found within the probe; market history was not changed.",
            );
    });

program
    .command("validate-replay")
    .description(
        "Compare one saved daily response with a fresh fetch; never changes listings or prices.",
    )
    .requiredOption("--day <date>", "sample UTC date (YYYY-MM-DD)")
    .requiredOption("-l, --league <name>", "checkpoint capture scope, including 'all'")
    .action(async (opts) => {
        const { validateSample, checkpointRange } = await import("#src/ps/checkpoints.ts");
        const { createPoeClient, REALM } = await import("#src/shared/auth.ts");
        const to = new Date(Date.parse(`${opts.day}T00:00:00Z`) + 86_400_000)
            .toISOString()
            .slice(0, 10);
        const result = await validateSample(
            createPoeClient(),
            checkpointRange(opts.league, opts.day, to, REALM),
        );
        console.log(JSON.stringify(result));
        if (result.status !== "matched")
            throw new Error("Daily replay sample did not match; market history was not changed.");
    });

program
    .command("capture-status")
    .description(
        "Show retained raw capture counts and compressed storage size; stop the worker before opening its database.",
    )
    .action(async () => {
        const { captureArchiveStatus } = await import("#src/ps/capture-archive.ts");
        const { openDb } = await import("#src/shared/db.ts");
        const db = await openDb();
        try {
            console.log(JSON.stringify(await captureArchiveStatus(db.conn)));
        } finally {
            await db.close();
        }
    });

program
    .command("flush-checkpoints")
    .description(
        "Retry durable cursor metadata and daily sample delivery without changing market history.",
    )
    .action(async () => {
        const { flushCheckpoints } = await import("#src/ps/checkpoints.ts");
        const { openDb } = await import("#src/shared/db.ts");
        const db = await openDb();
        try {
            console.log({ delivered: await flushCheckpoints(db.conn) });
        } finally {
            await db.close();
        }
    });

program
    .command("inspect")
    .description(
        "Read up to five stash pages and report sanitized modifier metadata coverage; no database or summary writes.",
    )
    .option("-p, --pages <n>", "pages to inspect (maximum five)", positiveInteger, 1)
    .option("-c, --cursor <id>", "starting cursor; omission reads the oldest available page")
    .action(async (opts) => {
        const { createPoeClient, REALM } = await import("#src/shared/auth.ts");
        const { inspectPublicStashes } = await import("#src/ps/inspect.ts");
        for await (const result of inspectPublicStashes(createPoeClient().public, {
            pages: opts.pages,
            cursor: opts.cursor,
            realm: REALM,
        }))
            console.log(JSON.stringify(result, null, 2));
    });

program
    .command("ingest")
    .description("Walk N pages of psapi, upsert listings, learn basemap, extract mod signatures.")
    .option("-p, --pages <n>", "number of pages to fetch", positiveInteger, 3)
    .option("-c, --cursor <id>", "explicit cursor (overrides saved); seed once, then omit")
    .option("-l, --league <name>", "season to capture (use a separate database per season)", "all")
    .action(async (opts) => {
        const { ingestPs } = await import("#src/ps/ingest.ts");
        const { createPoeClient } = await import("#src/shared/auth.ts");
        const { openDb } = await import("#src/shared/db.ts");
        const { parseLeagueFilter } = await import("#src/shared/leagues.ts");
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
                    `upd=${result.updated} rem=${result.removed} equipment=${result.equipmentObserved}\nleagues: ${top}`,
            );
        } finally {
            await db.close();
        }
    });

program
    .command("rollup")
    .description("Aggregate captured listings into the hourly summary and POST to poe.boats.")
    .option(
        "-h, --hour <unixhour>",
        "unix-hour to roll up (defaults to previous completed hour)",
        positiveInteger,
    )
    .option("-l, --league <name>", "limit to one league, or 'all' (default: all)", "all")
    .option("--dry-run", "print summary; do not POST")
    .action(async (opts) => {
        const { rollupPs } = await import("#src/ps/rollup.ts");
        const { rollupEquipment } = await import("#src/ps/equipment-rollup.ts");
        const { openDb } = await import("#src/shared/db.ts");
        const { parseLeagueFilter } = await import("#src/shared/leagues.ts");
        const db = await openDb();
        try {
            const options = {
                hour: opts.hour ? Number(opts.hour) : undefined,
                league: parseLeagueFilter(opts.league),
                dryRun: !!opts.dryRun,
            };
            await rollupPs(db.conn, options);
            await rollupEquipment(db.conn, options);
        } finally {
            await db.close();
        }
    });

program
    .command("basemap")
    .description("Rebuild icon_basemap from identified uniques already in the DB.")
    .action(async () => {
        const { rebuildBasemap } = await import("#src/ps/basemap-rebuild.ts");
        const { openDb } = await import("#src/shared/db.ts");
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
        const { getCursor, setCursor } = await import("#src/shared/cursor.ts");
        const { openDb } = await import("#src/shared/db.ts");
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
        const { openDb } = await import("#src/shared/db.ts");
        const { prune } = await import("#src/shared/prune.ts");
        const db = await openDb();
        try {
            const result = await prune(db.conn, {
                maxRows: Number(opts.maxRows ?? process.env.PS_LOCAL_MAX_ROWS ?? 2_000_000),
                keepDays: Number(opts.keepDays ?? process.env.PS_LOCAL_KEEP_DAYS ?? 30),
                dryRun: !!opts.dryRun,
            });
            console.log(
                `prune${opts.dryRun ? " (dry-run)" : ""}: ` +
                    `before=${result.beforeRows} ageDrop=${result.droppedByAge} ` +
                    `capDrop=${result.droppedByCap} after=${result.afterRows} ` +
                    `hourlyDrop=${result.droppedHourlyRows} ` +
                    `equipmentDrop=${result.equipment.listings} equipmentHourlyDrop=${result.equipment.hourlyRows}`,
            );
        } finally {
            await db.close();
        }
    });

program
    .command("process")
    .description("Ingest, evaluate sales, and retry all pending completed hours.")
    .option("-p, --pages <n>", "maximum stash pages per cycle", positiveInteger, 50)
    .option("-l, --league <name>", "season to capture", "all")
    .option("-c, --cursor <id>", "initial stash cursor; applied only on the first cycle")
    .option("--no-currency", "skip the currency exchange source")
    .option(
        "--currency-from-hour <unix>",
        "initial exchange hour for a new currency cursor",
        positiveInteger,
    )
    .option("--currency-hours <n>", "maximum exchange hours per cycle", positiveInteger, 1)
    .option("--watch", "continue processing every minute; Ctrl+C to stop")
    .action(async (opts) => {
        const { runPipeline } = await import("#src/pipeline.ts");
        const { createPoeClient } = await import("#src/shared/auth.ts");
        const { getCursor } = await import("#src/shared/cursor.ts");
        const { openDb } = await import("#src/shared/db.ts");
        const { parseLeagueFilter } = await import("#src/shared/leagues.ts");
        const db = await openDb();
        const client = createPoeClient();
        const { REALM } = await import("#src/shared/auth.ts");
        const { createStatusReporter } = await import("#src/shared/status.ts");
        const status = createStatusReporter({
            workerId: process.env.INGEST_WORKER_ID || `${REALM ?? "pc"}:${opts.league}`,
            realm: REALM ?? "pc",
            league: opts.league,
        });
        let cursor = opts.cursor;
        const stop = new AbortController();
        const shutdown = () => stop.abort();
        process.once("SIGTERM", shutdown);
        process.once("SIGINT", shutdown);
        try {
            const cycle = async () => {
                try {
                    await status.update({ cycles: status.current.cycles + 1 });
                    const result = await runPipeline(db.conn, client, {
                        pages: Number(opts.pages),
                        league: parseLeagueFilter(opts.league),
                        cursor,
                        currency: opts.currency,
                        currencyHours: Number(opts.currencyHours),
                        currencyFromHour: (await getCursor(db.conn, "cxapi"))
                            ? undefined
                            : opts.currencyFromHour,
                        onStatus: status.update,
                    });
                    console.log(JSON.stringify(result));
                    return { caughtUp: result.stash?.caughtUp ?? true };
                } catch (error) {
                    await status.update({ state: "error", completedAt: Date.now() });
                    throw error;
                } finally {
                    if (await getCursor(db.conn, "psapi")) cursor = undefined;
                }
            };
            if (opts.watch) {
                const { watchCycles } = await import("#src/shared/watch.ts");
                await watchCycles(cycle, {
                    signal: stop.signal,
                });
            } else await cycle();
        } finally {
            process.removeListener("SIGTERM", shutdown);
            process.removeListener("SIGINT", shutdown);
            await status.close();
            await db.close();
        }
    });

program
    .command("flush")
    .description("Replay pending completed hours, including late mappings and sale corrections.")
    .option("-l, --league <name>", "season to deliver", "all")
    .option("--dry-run", "do not POST or mark delivered")
    .action(async (opts) => {
        const { flushRollups } = await import("#src/pipeline.ts");
        const { openDb } = await import("#src/shared/db.ts");
        const { parseLeagueFilter } = await import("#src/shared/leagues.ts");
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

for (const command of program.commands)
    command.hook("preAction", async () => {
        await import("varlock/auto-load");
    });

process.exitCode = await runCli(program);
