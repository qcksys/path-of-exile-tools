import { afterEach, beforeEach, expect, it } from "vite-plus/test";
import { hasPendingReclassification } from "../../../packages/poe-stash-ingest/src/ps/equipment-reclassify";
import { type DbHandle, openDb } from "../../../packages/poe-stash-ingest/src/shared/db";

const CUTOFF = Date.UTC(2026, 10, 15, 12) / 1000;
const classifier = (revision: string) => ({ manifest: { revision } }) as never;

let db: DbHandle;
beforeEach(async () => {
    db = await openDb(":memory:");
});
afterEach(async () => {
    await db.close();
});

async function archivedPage(hoursBeforeCutoff: number, revision: string) {
    const capturedAt = (CUTOFF - hoursBeforeCutoff * 3600 + 60) * 1000;
    await db.conn.run(
        `INSERT INTO ps_capture_page (id, realm, league, cursor, next_cursor, captured_at,
            response_hash, processed_at, equipment_revision)
        VALUES ($1, 'pc', 'Covens', NULL, 'next', $2, 'hash', current_timestamp, $3)`,
        [`page-${hoursBeforeCutoff}-${revision}`, capturedAt, revision],
    );
}

const pending = (revision: string) =>
    hasPendingReclassification(db.conn, {
        realm: "pc",
        league: "Covens",
        classifier: classifier(revision),
        completedBefore: CUTOFF,
    });

it("finds an hour of the last day processed under another equipment revision", async () => {
    await archivedPage(2, "r1");
    expect(await pending("r2")).toBe(true);
    expect(await pending("r1")).toBe(false);
});

it("ignores pages from before the last day and hours already reclassified", async () => {
    await archivedPage(25, "r1");
    expect(await pending("r2")).toBe(false);

    await archivedPage(2, "r1");
    await db.conn.run(
        "INSERT INTO ps_equipment_reclassify VALUES ('r2', 'Covens', $1, -1, '', TRUE)",
        [CUTOFF - 2 * 3600],
    );
    expect(await pending("r2")).toBe(false);
});
