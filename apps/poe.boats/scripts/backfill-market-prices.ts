import { openDatabase } from "../app/db/client";
import { STASH_GAMES } from "../app/db/helpers/stash-game";
import { refreshStashMarketPrices } from "../app/db/queries/stash-market-price.queries";

/**
 * Locks the market list prices of a league's market hours stored before ingest locked them, each at
 * its own hour's exchange rates. Usage: <league>.
 */
const [league] = process.argv.slice(2);
if (!league) throw new Error("Provide the league.");
const { DATABASE_URL, DATABASE_DRIVER } = process.env;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const { db, close } = await openDatabase(DATABASE_URL, DATABASE_DRIVER);
try {
    for (const game of STASH_GAMES) {
        await refreshStashMarketPrices(db, { game, league });
        console.log(`${game}: done`);
    }
} finally {
    await close();
}
