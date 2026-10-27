import { drizzle } from "drizzle-orm/mysql-proxy";
import { expect, it } from "vite-plus/test";
import type { TDatabase } from "~/db/client";
import { getMarketData } from "~/db/queries/market.queries";
import { marketFiltersSchema } from "~/schemas/market";

it("skips the market list query for item history but executes it for list views", async () => {
    const statements: string[] = [];
    const db = drizzle(async (query) => {
        statements.push(query);
        return { rows: [] };
    }) as unknown as TDatabase;
    const filters = marketFiltersSchema.parse({
        league: "Current",
        item: "Item 0",
        category: "weapons",
        q: "not a match",
        corruption: "true",
    });

    await getMarketData(db, filters, "history");
    expect(statements.filter((query) => /\binner\s+join\b/i.test(query))).toEqual([]);

    statements.length = 0;
    await getMarketData(db, filters, "list");
    expect(statements.filter((query) => /\binner\s+join\b/i.test(query))).toHaveLength(1);
});
