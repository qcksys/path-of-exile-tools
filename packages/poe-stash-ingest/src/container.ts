import { readFile } from "node:fs/promises";

if (process.argv[2] === "replay") {
    const { replayFixtures } = await import("#src/replay.ts");
    console.log(JSON.stringify(await replayFixtures(), null, 2));
} else {
    for (const key of ["POE_CLIENT_SECRET", "POE_BOATS_INGEST_TOKEN"]) {
        const file = process.env[`${key}_FILE`];
        if (file) process.env[key] = (await readFile(file, "utf8")).trim();
    }
    if (process.argv.length === 2) {
        process.argv.push(
            "process",
            "--watch",
            "--league",
            process.env.INGEST_LEAGUE ?? "all",
            "--pages",
            process.env.INGEST_PAGES ?? "50",
        );
        if (process.env.INGEST_CURRENCY === "false") process.argv.push("--no-currency");
    }
    await import("#src/ps/cli.ts");
}
