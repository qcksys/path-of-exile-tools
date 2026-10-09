import { expect, it } from "vite-plus/test";
import {
    captureEquipment,
    defaultEquipmentClassifier,
} from "../../../packages/poe-stash-ingest/src/ps/equipment";
import { openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db";

it("captures one changed stash within a bounded budget despite unrelated cohort history", async () => {
    const db = await openDb(":memory:");
    try {
        await db.conn.run("SET memory_limit='128MB'");
        await db.conn.run("SET max_temp_directory_size='0B'");
        await db.conn.run(`INSERT INTO ps_equipment_hour
            SELECT 'other-account', 'item-' || i, 'other-stash', 'Standard', 'revision',
            to_json(range(i, i + 2000)), '[]'::JSON, 1, 'chaos', current_timestamp, 3600
            FROM range(1000) t(i)`);
        await db.conn.run(`INSERT INTO ps_equipment_hour VALUES
            ('changed-account', 'changed-item', 'changed-stash', 'Standard', 'revision', '[]', '[]', 1, 'chaos', current_timestamp, 3600)`);
        const count = await captureEquipment(
            db.conn,
            {
                id: "changed-stash",
                public: true,
                accountName: "changed-account",
                league: "Standard",
                stash: "~price 1 chaos",
                stashType: "PremiumStash",
                items: [
                    {
                        id: "changed-item",
                        verified: true,
                        w: 2,
                        h: 3,
                        icon: "",
                        name: "",
                        typeLine: "Necrotic Armour",
                        baseType: "Necrotic Armour",
                        ilvl: 85,
                        identified: true,
                        frameType: 2,
                        sockets: Array.from({ length: 6 }, () => ({ group: 0 })),
                        explicitMods: ["+100 to maximum Life"],
                    },
                ],
            },
            await defaultEquipmentClassifier(),
            new Date(3_600_000),
        );
        expect(count).toBe(1);
        expect(
            await queryAll(db.conn, "SELECT count(*)::INTEGER AS count FROM ps_equipment_listing"),
        ).toEqual([{ count: 1 }]);
    } finally {
        await db.close();
    }
}, 20_000);
