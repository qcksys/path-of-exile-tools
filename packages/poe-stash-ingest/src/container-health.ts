import { readFile } from "node:fs/promises";

try {
    const status = JSON.parse(
        await readFile(process.env.INGEST_STATUS_FILE ?? "/data/status.json", "utf8"),
    );
    process.exitCode = status.ok === true && Date.now() - status.completedAt < 10 * 60_000 ? 0 : 1;
} catch {
    process.exitCode = 1;
}
