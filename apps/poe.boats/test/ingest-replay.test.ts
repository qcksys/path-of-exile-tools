import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { replayFixtures } from "../../../packages/poe-stash-ingest/src/replay";
import { setCursor } from "../../../packages/poe-stash-ingest/src/shared/cursor";
import { openDb } from "../../../packages/poe-stash-ingest/src/shared/db";

vi.mock("../../../packages/poe-stash-ingest/src/shared/auth.ts", () => ({ REALM: undefined }));

afterEach(() => {
    vi.restoreAllMocks();
});

async function replayFromCursor(hour: number, beforeReplay?: () => void) {
    const directory = await mkdtemp(join(tmpdir(), "poe-replay-cursor-"));
    for (const key of [
        "APP_ENV",
        "POE_CLIENT_ID",
        "POE_CLIENT_SECRET",
        "POE_USER_AGENT_CONTACT",
        "POE_CLIENT_VERSION",
        "POE_REALM",
        "POE_BOATS_INGEST_TOKEN",
        "POE_BOATS_INGEST_URL",
    ])
        vi.stubEnv(key, process.env[key]);
    vi.stubEnv("PS_LOCAL_DB", join(directory, "replay.duckdb"));
    try {
        const db = await openDb();
        try {
            await setCursor(db.conn, "cxapi", String(hour));
        } finally {
            await db.close();
        }
        beforeReplay?.();
        return await replayFixtures();
    } finally {
        vi.unstubAllEnvs();
        await rm(directory, { recursive: true, force: true });
    }
}

it("replays a persisted exchange cursor after its original wall-clock hour has passed", async () => {
    const oldHour = Math.floor(Date.now() / 3_600_000) * 3600 - 86400;
    expect(await replayFromCursor(oldHour)).toMatchObject({
        ok: true,
        exchangeHour: oldHour,
        sourceItems: 8400,
    });
}, 60000);

it("rolls up the replayed listings when the hour ends during the replay", async () => {
    const start = Date.now();
    const oldHour = Math.floor(start / 3_600_000) * 3600 - 86400;
    const result = await replayFromCursor(oldHour, () => {
        vi.spyOn(Date, "now")
            .mockImplementationOnce(() => start)
            .mockImplementation(() => start + 3_600_000);
    });
    expect(result).toMatchObject({ ok: true, sourceItems: 8400 });
}, 60000);
