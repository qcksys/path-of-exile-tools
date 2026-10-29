import { openDatabase } from "../app/db/client";
import {
    refreshStashMarketDaily,
    refreshYellowBeastHourly,
    utcDay,
} from "../app/db/queries/stash-rollups.queries";
import { yellowBeastMarket } from "../app/lib/crafting-yellow-beasts";

/**
 * Writes the `Yellow Beast` hourly and daily market rows of a PoE 1 league's past days, which
 * were stored before ingest merged yellow beast species. Usage: <league> [days, default 30].
 */
const [league, days = "30"] = process.argv.slice(2);
if (!league) throw new Error("Provide the league, and optionally how many days back to backfill.");
const { DATABASE_URL, DATABASE_DRIVER } = process.env;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const { db, close } = await openDatabase(DATABASE_URL, DATABASE_DRIVER);
try {
    const today = utcDay(Date.now() / 1000);
    for (let day = today - (Number(days) - 1) * 86400; day <= today; day += 86400) {
        const hours = Array.from({ length: 24 }, (_, index) => day + index * 3600);
        const written = await refreshYellowBeastHourly(db, { game: "poe1", league, hours });
        if (written)
            await refreshStashMarketDaily(db, {
                game: "poe1",
                league,
                fromHour: day,
                toHour: day,
                itemKeys: [yellowBeastMarket],
            });
        console.log(`${new Date(day * 1000).toISOString().slice(0, 10)}: ${written} rows`);
    }
} finally {
    await close();
}
