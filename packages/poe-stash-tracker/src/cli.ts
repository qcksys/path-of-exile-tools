import type { LeagueType } from "@poe-tools/api-client";
import { Argument, Command, positiveInteger, runCli } from "@poe-tools/cli";

const program = new Command()
    .name("poe-stash-tracker")
    .description("Track public stash listings and currency exchange prices in SQLite");
program
    .command("ingest-cx")
    .description("Ingest a currency exchange hour")
    .argument(
        "[from-hour]",
        "Unix timestamp in seconds; defaults to the saved cursor",
        positiveInteger,
    )
    .action(async (hour?: number) => {
        const { ingestCx } = await import("./ingest-cx.ts");
        const { openDb } = await import("./db.ts");
        const { createPoeClient } = await import("./auth.ts");
        const db = openDb();
        try {
            await ingestCx(
                db,
                createPoeClient(),
                hour === undefined ? undefined : Math.floor(hour / 3600) * 3600,
            );
        } finally {
            db.$client.close();
        }
    });
program
    .command("ingest-ps")
    .description("Ingest public stash pages")
    .argument("[pages]", "number of pages", positiveInteger, 3)
    .argument("[cursor]", "explicit starting cursor; defaults to the saved cursor")
    .action(async (pages: number, cursor?: string) => {
        const { runIngestPs } = await import("./ingest-ps.ts");
        await runIngestPs(pages, cursor);
    });
program
    .command("leagues")
    .description("List available leagues")
    .addArgument(
        new Argument("[type]", "league type")
            .choices(["all", "main", "event", "season"])
            .default("all"),
    )
    .action(async (type: LeagueType | "all") => {
        const { listLeagues } = await import("./list-leagues.ts");
        await listLeagues(type === "all" ? undefined : type);
    });
program
    .command("build-basemap")
    .description("Rebuild derived item mappings from the local database")
    .action(async () => {
        const { buildBasemap } = await import("./build-basemap.ts");
        await buildBasemap();
    });

process.exitCode = await runCli(program);
