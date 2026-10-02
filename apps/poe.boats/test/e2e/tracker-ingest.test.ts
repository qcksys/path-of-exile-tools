// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve the upstream API field names.
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, expect, it } from "vite-plus/test";
import { createClient } from "../../../../packages/poe-api-client/src/client.ts";
import { type Db, openDb } from "../../../../packages/poe-stash-tracker/src/db.ts";
import { ingestCx } from "../../../../packages/poe-stash-tracker/src/ingest-cx.ts";
import { ingestPage } from "../../../../packages/poe-stash-tracker/src/ingest-ps.ts";
import {
    tCurrencyRate,
    tListing,
    tStreamCursor,
} from "../../../../packages/poe-stash-tracker/src/schema.ts";

const HOUR = 1_790_899_200;
let db: Db;
let server: Server;
let client: ReturnType<typeof createClient>;
let responses: unknown[];

beforeEach(async () => {
    db = openDb(":memory:");
    db.$client.exec(readFileSync(new URL("./tracker.sql", import.meta.url), "utf8"));
    responses = [];
    server = createServer((_request, response) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(responses.shift()));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server port");
    client = createClient({
        baseUrl: `http://127.0.0.1:${address.port}`,
        userAgent: "tracker-e2e",
        token: "inert-token",
    });
});

afterEach(async () => {
    if (server?.listening)
        await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
        );
    db?.$client.close();
});

it("stores the requested currency hour and advances the saved cursor independently", async () => {
    await db
        .insert(tStreamCursor)
        .values({ streamName: "cxapi", cursor: String(HOUR), updatedAt: new Date() });
    responses.push({
        next_change_id: HOUR + 3600,
        markets: [
            {
                league: "Standard",
                market_id: "chaos|divine",
                lowest_ratio: { chaos: 100, divine: 1 },
                highest_ratio: { chaos: 110, divine: 1 },
                volume_traded: { chaos: 1000 },
                lowest_stock: { chaos: 100 },
                highest_stock: { chaos: 1000 },
            },
        ],
    });
    await ingestCx(db, client);
    expect(await db.select().from(tCurrencyRate)).toMatchObject([{ observedHour: HOUR }]);
    expect(await db.select().from(tStreamCursor)).toMatchObject([{ cursor: String(HOUR + 3600) }]);
});

it("removes only the seeded stash named in a minimal unlisting event", async () => {
    const listing = {
        accountName: "seller",
        itemId: "item",
        league: "Standard",
        itemKey: "Headhunter",
        identified: true,
        typeLine: "Leather Belt",
        baseType: "Leather Belt",
        name: "Headhunter",
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
    };
    await db.insert(tListing).values([
        { ...listing, stashId: "removed" },
        { ...listing, stashId: "retained" },
    ]);
    responses.push({ next_change_id: "page-2", stashes: [{ id: "removed", public: false }] });
    expect(await ingestPage(db, client, undefined)).toMatchObject({ removed: 1 });
    const rows = await db.select().from(tListing);
    expect(rows.find((row) => row.stashId === "removed")?.removedAt).toBeInstanceOf(Date);
    expect(rows.find((row) => row.stashId === "retained")?.removedAt).toBeNull();
});
