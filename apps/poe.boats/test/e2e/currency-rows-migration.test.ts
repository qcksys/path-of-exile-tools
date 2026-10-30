import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MySqlContainer, type StartedMySqlContainer } from "@testcontainers/mysql";
import { sql } from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { type Connection, createConnection } from "mysql2/promise";
import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { tStashCurrencyHour, tStashCurrencyHourly } from "~/db/schema/stash.currency-hourly";
import { tStashCurrencyMarket } from "~/db/schema/stash.currency-market";

const MIGRATION = "20261030032847_stash_currency_rows";
const migrations = fileURLToPath(new URL("../../app/db/migrations", import.meta.url));
let container: StartedMySqlContainer;
let connection: Connection;
let db: MySql2Database;
let before: string;

beforeAll(async () => {
    container = await new MySqlContainer("mysql:8.4").withDatabase("currency_migration").start();
    connection = await createConnection(container.getConnectionUri());
    db = drizzle({ client: connection });
    before = mkdtempSync(join(tmpdir(), "migrations-"));
    for (const entry of readdirSync(migrations).filter((name) => name < MIGRATION))
        cpSync(join(migrations, entry), join(before, entry), { recursive: true });
    await migrate(db, { migrationsFolder: before });
});

afterAll(async () => {
    if (before) rmSync(before, { recursive: true, force: true });
    await connection?.end();
    await container?.stop();
});

it("moves stored exchange hours into the narrow rows without changing what readers see", async () => {
    const chaos = "Metadata/Items/Currency/CurrencyRerollRare";
    const divine = "Metadata/Items/Currency/CurrencyModValues";
    const orb = "Metadata/Items/Currency/CurrencyUpgradeToRare";
    const old = (game: "poe1" | "poe2") => sql.raw(`qsPoeBoats__stash_${game}_currency_hourly`);
    const row = (realm: string, marketId: string, hour: number, volume: [number, number]) => {
        const [first, second] = marketId.split("|") as [string, string];
        const map = (a: number, b: number) => JSON.stringify({ [first]: a, [second]: b });
        return sql`(${realm}, 'Allflame', ${marketId}, ${hour}, ${map(1, 150.5)}, ${map(1, 160)}, ${map(...volume)}, ${map(10, 1500)}, ${map(20, 3000)})`;
    };
    const insert = (game: "poe1" | "poe2", rows: ReturnType<typeof row>[]) =>
        db.execute(
            sql`insert into ${old(game)} (realm, league, marketId, hour, lowestRatio, highestRatio, volumeTraded, lowestStock, highestStock) values ${sql.join(rows, sql`, `)}`,
        );
    await insert("poe1", [
        row("pc", `${divine}|${chaos}`, 3600, [2, 300]),
        row("pc", `${divine}|${chaos}`, 7200, [0, 0]),
        row("pc", `${orb}|${chaos}`, 7200, [5, 1]),
    ]);
    await insert("poe2", [row("poe2", `${divine}|${chaos}`, 3600, [4, 7])]);
    // A market missing from currency_market is recorded with its earliest hour.
    await db.execute(
        sql`insert into ${tStashCurrencyMarket.poe1} (realm, league, marketId, firstHour) values ('pc', 'Allflame', ${`${divine}|${chaos}`}, 3600)`,
    );

    await migrate(db, { migrationsFolder: migrations });

    expect(await db.select().from(tStashCurrencyHour.poe1)).toHaveLength(3);
    const rows = await db
        .select({
            marketId: tStashCurrencyHourly.poe1.marketId,
            hour: tStashCurrencyHourly.poe1.hour,
            lowestRatio: tStashCurrencyHourly.poe1.lowestRatio,
            volumeTraded: tStashCurrencyHourly.poe1.volumeTraded,
            highestStock: tStashCurrencyHourly.poe1.highestStock,
        })
        .from(tStashCurrencyHourly.poe1)
        .orderBy(tStashCurrencyHourly.poe1.marketId, tStashCurrencyHourly.poe1.hour);
    expect(rows).toEqual([
        {
            marketId: `${divine}|${chaos}`,
            hour: 3600,
            lowestRatio: { [divine]: 1, [chaos]: 150.5 },
            volumeTraded: { [divine]: 2, [chaos]: 300 },
            highestStock: { [divine]: 20, [chaos]: 3000 },
        },
        {
            marketId: `${divine}|${chaos}`,
            hour: 7200,
            lowestRatio: { [divine]: 1, [chaos]: 150.5 },
            volumeTraded: { [divine]: 0, [chaos]: 0 },
            highestStock: { [divine]: 20, [chaos]: 3000 },
        },
        {
            marketId: `${orb}|${chaos}`,
            hour: 7200,
            lowestRatio: { [orb]: 1, [chaos]: 150.5 },
            volumeTraded: { [orb]: 5, [chaos]: 1 },
            highestStock: { [orb]: 20, [chaos]: 3000 },
        },
    ]);
    expect(
        await db
            .select({
                marketId: tStashCurrencyMarket.poe1.marketId,
                firstHour: tStashCurrencyMarket.poe1.firstHour,
            })
            .from(tStashCurrencyMarket.poe1)
            .orderBy(tStashCurrencyMarket.poe1.marketId),
    ).toEqual([
        { marketId: `${divine}|${chaos}`, firstHour: 3600 },
        { marketId: `${orb}|${chaos}`, firstHour: 7200 },
    ]);
    expect(
        await db
            .select({
                realm: tStashCurrencyHourly.poe2.realm,
                volumeTraded: tStashCurrencyHourly.poe2.volumeTraded,
            })
            .from(tStashCurrencyHourly.poe2),
    ).toEqual([{ realm: "poe2", volumeTraded: { [divine]: 4, [chaos]: 7 } }]);
});
