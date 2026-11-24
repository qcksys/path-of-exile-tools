import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vite-plus/test";
import { evaluateSales } from "../../../packages/poe-stash-ingest/src/ps/sales";
import { openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db";

vi.mock("../../../packages/poe-stash-ingest/src/shared/auth.ts", () => ({ REALM: undefined }));

// With status indexed, DuckDB ran each status change as a delete and insert of the whole row, its
// unique key included, and a worker on DuckDB 2.0 failed sale evaluation on such keys as duplicates.
it("changes a sale's status in place", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sale-status-"));
    const path = join(dir, "market.duckdb");
    try {
        const older = await openDb(path);
        await older.conn.run("CREATE INDEX ps_sale_status ON ps_sale(status)");
        await older.close();

        const db = await openDb(path);
        try {
            expect(
                await queryAll(
                    db.conn,
                    "SELECT index_name AS name FROM duckdb_indexes() WHERE table_name = 'ps_sale'",
                ),
            ).toEqual([{ name: "ps_sale_pk" }]);
            await db.conn.run(`INSERT INTO ps_sale BY NAME SELECT 'Standard' AS league,
                'seller' AS account_name, 'stash-1' AS stash_id, 'item-1' AS item_id,
                'key' AS item_key, TRUE AS identified, 3 AS frame_type, 'Belt' AS type_line,
                'Belt' AS base_type, '' AS signature_value,
                TIMESTAMP '2026-11-23 08:00:00' AS first_seen_at,
                TIMESTAMP '2026-11-23 08:30:00' AS last_seen_at,
                TIMESTAMP '2026-11-23 09:00:00' AS removed_at, 'pending' AS status,
                current_timestamp::TIMESTAMP AS updated_at`);
            // The same item listed again after its removal: a relist, not a sale.
            await db.conn.run(`INSERT INTO ps_listing BY NAME SELECT 'seller' AS account_name,
                'stash-2' AS stash_id, 'item-1' AS item_id, 'Standard' AS league,
                'key' AS item_key, TRUE AS identified, 3 AS frame_type, 'Belt' AS type_line,
                'Belt' AS base_type, '' AS signature_value, '{}'::JSON AS raw_item,
                TIMESTAMP '2026-11-23 09:30:00' AS first_seen_at,
                TIMESTAMP '2026-11-23 10:00:00' AS last_seen_at, 1 AS listing_id`);
            const sale = () =>
                queryAll<{ row: string; status: string }>(
                    db.conn,
                    "SELECT rowid::VARCHAR AS row, status FROM ps_sale",
                );
            const [before] = await sale();
            await evaluateSales(db.conn, false, new Date("2026-11-23T12:00:00Z"));
            // A rewritten row would get a new row ID.
            expect(await sale()).toEqual([{ row: before!.row, status: "relisted" }]);
        } finally {
            await db.close();
        }
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
