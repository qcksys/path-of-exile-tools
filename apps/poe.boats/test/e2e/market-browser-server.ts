import { fileURLToPath } from "node:url";
import { MySqlContainer } from "@testcontainers/mysql";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { createConnection } from "mysql2/promise";
import type { TDatabase } from "../../app/db/client";
import { refreshStashRollups } from "../../app/db/queries/stash-rollups.queries";
import { tStashPoe1UniqueHourly as market } from "../../app/db/schema/stash.unique-hourly";
import { marketFixture } from "../market-fixtures";

const container = await new MySqlContainer("mysql:8.4").withDatabase("market_browser_test").start();
const connection = await createConnection(container.getConnectionUri());
const db = drizzle({ client: connection });
await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../../app/db/migrations", import.meta.url)),
});
const row = marketFixture().rows[0]!;
await db.insert(market).values([
    row,
    { ...row, identified: false },
    { ...row, corrupted: true },
    ...Array.from({ length: 55 }, (_, index) => ({
        ...row,
        itemKey: `Boots ${String(index).padStart(2, "0")}`,
        name: `Boots ${String(index).padStart(2, "0")}`,
        prices: { divine: { count: 5, min: index + 3, median: index + 3, max: index + 3 } },
    })),
    { ...row, itemKey: "Headhunter", name: "Headhunter", baseType: "Leather Belt" },
    { ...row, itemKey: "Divine Orb", name: "", baseType: "Divine Orb", frameType: 5 },
    { ...row, itemKey: "Jagged Fossil", name: "", baseType: "Jagged Fossil", frameType: 5 },
]);
await refreshStashRollups(db as unknown as TDatabase);
await connection.end();
process.env.PLAYWRIGHT_MARKET_DATABASE_URL = container.getConnectionUri();
for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
        void container.stop();
    });
await import("./server");
