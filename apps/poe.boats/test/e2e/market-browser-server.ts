import { fileURLToPath } from "node:url";
import { MySqlContainer } from "@testcontainers/mysql";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { createConnection } from "mysql2/promise";
import type { TDatabase } from "../../app/db/client";
import { upsertStashCurrencyHourly } from "../../app/db/queries/stash-ingest.queries";
import { writeStashUniqueHourly } from "../../app/db/queries/stash-market.queries";
import { refreshStashRollups } from "../../app/db/queries/stash-rollups.queries";
import type { TStashUniqueHourlyI } from "../../app/db/schema/stash.unique-hourly";
import { marketFixture } from "../market-fixtures";

const container = await new MySqlContainer("mysql:8.4").withDatabase("market_browser_test").start();
const connection = await createConnection(container.getConnectionUri());
const db = drizzle({ client: connection });
await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../../app/db/migrations", import.meta.url)),
});
const insertMarket = (rows: TStashUniqueHourlyI[]) =>
    writeStashUniqueHourly(db as unknown as TDatabase, "poe1", rows);
// The market shows merchant tab listings only.
const row = { ...marketFixture().rows[0]!, tab: "merchant" as const };
await insertMarket([
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
    ...["ilvl 86+ · 6 links", "ilvl 84–85 · 1–5 links"].map((signatureValue) => ({
        ...row,
        itemKey: "Twilight Regalia",
        name: null,
        baseType: "Twilight Regalia",
        frameType: 2,
        signatureKind: "base",
        signatureValue,
    })),
]);
// Exchange pages read hours up to now, so these leagues trade recently, apart from the fixed hour
// of the stash rows.
const latestHour = Math.floor(Date.now() / 3_600_000) * 3600 - 3600;
const wisdom = "Metadata/Items/Currency/CurrencyIdentification";
const chaos = "Metadata/Items/Currency/CurrencyRerollRare";
await upsertStashCurrencyHourly(
    db as unknown as TDatabase,
    ["Exchange One", "Exchange Two"].flatMap((league) =>
        Array.from({ length: 72 }, (_, index) => ({
            realm: "pc",
            league,
            marketId: `${wisdom}|${chaos}`,
            hour: latestHour - index * 3600,
            volumeTraded: { [wisdom]: 400 + index, [chaos]: 40 + index },
            lowestRatio: null,
            highestRatio: null,
            lowestStock: null,
            highestStock: null,
        })),
    ),
);
await refreshStashRollups(db as unknown as TDatabase);
await connection.end();
process.env.PLAYWRIGHT_MARKET_DATABASE_URL = container.getConnectionUri();
for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
        void container.stop();
    });
await import("./server");
