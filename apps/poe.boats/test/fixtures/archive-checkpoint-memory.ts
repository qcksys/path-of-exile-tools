// biome-ignore-all lint/style/useNamingConvention: Preserve upstream and database field names.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import type { PublicStashPage } from "../../../../packages/poe-api-client/src/types.ts";
import { readArchivedPage } from "../../../../packages/poe-stash-ingest/src/ps/archive-payload.ts";
import {
    archivePage,
    captureArchiveStatus,
} from "../../../../packages/poe-stash-ingest/src/ps/capture-archive.ts";
import { responseHash } from "../../../../packages/poe-stash-ingest/src/ps/checkpoints.ts";
import {
    openDb,
    queryAll,
    withTransaction,
} from "../../../../packages/poe-stash-ingest/src/shared/db.ts";

const [mode, path, resultPath] = process.argv.slice(2);
const db = await openDb(path);
await db.conn.run(`SET temp_directory='${join(dirname(path), "spill").replaceAll("'", "''")}'`);
const scope = { realm: "pc", league: "Standard", capturedAt: 1000 };
function page(index: number): PublicStashPage {
    return {
        next_change_id: `next-${index}`,
        stashes: [
            {
                id: "tracked",
                public: true,
                league: "Standard",
                stashType: "PremiumStash",
                items: [
                    {
                        id: `item-${index}`,
                        name: "",
                        typeLine: "Plate Vest",
                        baseType: "Plate Vest",
                        verified: true,
                        identified: true,
                        frameType: 0,
                        w: 2,
                        h: 3,
                        icon: "",
                        note: randomBytes(350_000).toString("base64"),
                    },
                ],
            },
        ],
    };
}
async function legacy(body: PublicStashPage, index: number) {
    const json = JSON.stringify(body);
    const hash = responseHash(body);
    await withTransaction(db.conn, async () => {
        await db.conn.run("INSERT INTO ps_capture_payload VALUES ($1, from_base64($2), $3)", [
            hash,
            gzipSync(json).toString("base64"),
            Buffer.byteLength(json),
        ]);
        await db.conn.run(
            `INSERT INTO ps_capture_page (id, realm, league, next_cursor, captured_at, response_hash)
            VALUES ($1, 'pc', 'Standard', $2, 1000, $3)`,
            [String(index), body.next_change_id, hash],
        );
        await db.conn.run("DELETE FROM ps_capture_stash WHERE stash_id='tracked'");
        await db.conn.run("INSERT INTO ps_capture_stash VALUES ('tracked')");
    });
}
if (mode === "verify") {
    const expected: string[] = JSON.parse(await readFile(resultPath, "utf8")).hashes;
    assert.equal(expected.length, 256);
    for (const hash of expected)
        assert.equal(responseHash(await readArchivedPage(db.conn, hash)), hash);
    assert.equal((await captureArchiveStatus(db.conn)).payloads, 256);
    assert.deepEqual(
        await queryAll(
            db.conn,
            `SELECT count(*)::INTEGER AS missing FROM ps_capture_page p
        LEFT JOIN (SELECT response_hash FROM ps_capture_payload UNION ALL SELECT response_hash FROM ps_capture_payload_meta) b
        USING(response_hash) WHERE b.response_hash IS NULL`,
        ),
        [{ missing: 0 }],
    );
    assert.deepEqual(
        await queryAll(db.conn, "SELECT count(*)::INTEGER AS legacy FROM ps_capture_payload"),
        [{ legacy: 96 }],
    );
    await db.close();
    console.log(JSON.stringify({ verified: 256, legacy: 96 }));
} else {
    const hashes: string[] = [];
    try {
        for (let index = 0; index < 256; index++) {
            const body = page(index);
            if (mode === "legacy" || index < 96) await legacy(body, index);
            else await archivePage(db.conn, body, scope, () => true);
            hashes.push(responseHash(body));
            if (index === 95) await db.conn.run("CHECKPOINT");
        }
        await db.conn.run("CHECKPOINT");
        await db.close();
        await writeFile(resultPath, JSON.stringify({ hashes }));
    } catch (error) {
        assert.equal(mode, "legacy");
        const message =
            error instanceof AggregateError ? error.errors.map(String).join("; ") : String(error);
        assert.match(message, /Failed to commit.*(?:pin block|create checkpoint)/s);
        await writeFile(
            resultPath,
            JSON.stringify({ acknowledged: hashes.length, commitMemoryFailure: true }),
        );
        process.exit(2);
    }
}
