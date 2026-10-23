// biome-ignore-all lint/style/useNamingConvention: Preserve upstream and SQL field names.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import type { PublicStashPage } from "../../../../packages/poe-api-client/src/types.ts";
import { readArchivedPage } from "../../../../packages/poe-stash-ingest/src/ps/archive-payload.ts";
import { archivePage } from "../../../../packages/poe-stash-ingest/src/ps/capture-archive.ts";
import { responseHash } from "../../../../packages/poe-stash-ingest/src/ps/checkpoints.ts";
import {
    openDb,
    queryAll,
    TransactionRollbackError,
} from "../../../../packages/poe-stash-ingest/src/shared/db.ts";
import {
    exitAfterRollbackFailure,
    watchCycles,
} from "../../../../packages/poe-stash-ingest/src/shared/watch.ts";

const [mode, path, resultPath] = process.argv.slice(2);
const scope = { realm: "pc", league: "Standard", capturedAt: 1000 };
function page(index: number): PublicStashPage {
    return {
        next_change_id: `cursor-${index}`,
        stashes: [
            {
                id: "tracked-stash",
                public: true,
                league: "Standard",
                stashType: "PremiumStash",
                items: [
                    {
                        id: `item-${index}`,
                        name: "",
                        typeLine: "Unknown Base",
                        baseType: "Unknown Base",
                        verified: true,
                        identified: false,
                        frameType: 0,
                        w: 1,
                        h: 1,
                        icon: "https://example.invalid/item",
                        note: `synthetic-${index}-${"x".repeat(4096)}`,
                    },
                ],
            },
        ],
    };
}

const db = await openDb(path);
await db.conn.run(`CREATE TEMP VIEW test_archive_payloads AS
    SELECT response_hash FROM ps_capture_payload
    UNION ALL SELECT response_hash FROM ps_capture_payload_meta`);
if (mode === "fail") {
    const other = await openDb(path);
    await db.conn.run("SET checkpoint_threshold='1GB'");
    for (let index = 0; index < 4; index++) {
        if (index < 2) {
            const json = JSON.stringify(page(index));
            await db.conn.run("INSERT INTO ps_capture_payload VALUES ($1, from_base64($2), $3)", [
                responseHash(page(index)),
                gzipSync(json).toString("base64"),
                Buffer.byteLength(json),
            ]);
        }
        await archivePage(db.conn, page(index), scope, () => true);
    }
    await db.conn.run("CHECKPOINT");
    for (let index = 4; index < 6; index++) {
        await archivePage(db.conn, page(index), scope, () => true);
    }
    const run = db.conn.run.bind(db.conn);
    let failingPageId: string | undefined;
    db.conn.run = async (...args: Parameters<typeof run>) => {
        if (args[0].startsWith("INSERT INTO ps_capture_page")) {
            const result = await run(...args);
            const [inserted] = await queryAll<{ id: string }>(
                db.conn,
                "SELECT id FROM ps_capture_page WHERE next_cursor='cursor-99'",
            );
            failingPageId = inserted.id;
            return result;
        }
        if (args[0] === "COMMIT") {
            assert(failingPageId);
            await other.conn.run(
                `INSERT INTO ps_capture_page
                (id, realm, league, next_cursor, captured_at, response_hash)
                VALUES ($1, 'pc', 'Standard', 'other', 1000, $2)`,
                [failingPageId, responseHash(page(0))],
            );
        }
        return run(...args);
    };
    let cycles = 0;
    try {
        await watchCycles(
            async () => {
                cycles++;
                if (cycles > 1) throw new Error("An unsafe second cycle was attempted");
                await archivePage(db.conn, page(99), scope, () => true);
            },
            { signal: AbortSignal.timeout(1000), intervalMs: 1 },
        );
        throw new Error("Fatal rollback failure did not escape the watch loop");
    } catch (error) {
        assert(error instanceof TransactionRollbackError);
        assert.match(String(error.errors[0]), /Failed to commit.*duplicate key/i);
        assert.match(String(error.errors[1]), /cannot rollback.*no transaction is active/i);
        assert.equal(cycles, 1);
        await writeFile(resultPath, JSON.stringify({ fatal: error.name, cycles }));
        exitAfterRollbackFailure(error);
    }
} else {
    assert(mode === "recover" || mode === "verify");
    const verify = async (count: number) => {
        const rows = await queryAll<{ hash: string; hashLength: number }>(
            db.conn,
            "SELECT response_hash AS hash, length(response_hash)::INTEGER AS hashLength FROM test_archive_payloads",
        );
        assert.equal(rows.length, count);
        const expected = new Set(
            Array.from({ length: count }, (_, index) => responseHash(page(index))),
        );
        for (const row of rows) {
            const body = await readArchivedPage(db.conn, row.hash);
            const contentHash = responseHash(body);
            if (!expected.has(row.hash) || contentHash !== row.hash) {
                const diagnostic: Record<string, unknown> = {
                    mode,
                    expectedCount: count,
                    rows: rows.length,
                    storedHash: row.hash,
                    sqlHashLength: row.hashLength,
                    contentHash,
                    cursor: body.next_change_id,
                    isFailedWrite: body.next_change_id === "cursor-99",
                    indexedContentHash: await queryAll(
                        db.conn,
                        "SELECT response_hash AS hash FROM test_archive_payloads WHERE response_hash=$1",
                        [contentHash],
                    ),
                    missing: await queryAll(
                        db.conn,
                        "SELECT count(*)::INTEGER AS count FROM ps_capture_page p LEFT JOIN test_archive_payloads b USING(response_hash) WHERE b.response_hash IS NULL",
                    ),
                };
                await writeFile(`${resultPath}.failure.json`, JSON.stringify(diagnostic));
                assert.fail(JSON.stringify(diagnostic));
            }
            assert(expected.has(row.hash));
            assert.equal(contentHash, row.hash);
            assert.deepEqual(
                await queryAll(
                    db.conn,
                    "SELECT response_hash AS hash FROM test_archive_payloads WHERE response_hash=$1",
                    [row.hash],
                ),
                [{ hash: row.hash }],
            );
        }
        assert.deepEqual(
            await queryAll(
                db.conn,
                `SELECT count(*)::INTEGER AS missing FROM ps_capture_page p
                LEFT JOIN test_archive_payloads b USING(response_hash) WHERE b.response_hash IS NULL`,
            ),
            [{ missing: 0 }],
        );
    };
    try {
        if (mode === "verify") {
            await verify(14);
            await writeFile(resultPath, JSON.stringify({ reopenedBodies: 14 }));
        } else {
            await verify(6);
            for (let index = 6; index < 14; index++) {
                await archivePage(db.conn, page(index), scope, () => true);
            }
            await db.conn.run("CHECKPOINT");
            await verify(14);
            await writeFile(resultPath, JSON.stringify({ recoveredBodies: 6, finalBodies: 14 }));
        }
    } finally {
        await db.close();
    }
}
