// biome-ignore-all lint/style/useNamingConvention: Fixtures retain the upstream API field names.
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { createClient, type PublicStashPage } from "@poe-tools/api-client";
import { getCursor } from "#src/shared/cursor.ts";
import { openDb, queryAll } from "#src/shared/db.ts";
import type { IngestPayload } from "#src/shared/remote/types.ts";

const league = "Compose replay fixtures";
const equipmentHour = 1_785_542_400;

function stashPage(phase: number): PublicStashPage {
    return {
        next_change_id: `fixture-${Math.min(phase, 2)}`,
        stashes:
            phase > 2
                ? []
                : Array.from({ length: 30 }, (_, seller) => ({
                      id: `stash-${seller}`,
                      accountName: `seller-${seller}`,
                      public: true,
                      stashType: "PremiumStash",
                      league,
                      items: [
                          ...Array.from({ length: phase === 1 ? 100 : 80 }, (_, index) => ({
                              id: `item-${seller}-${index}`,
                              verified: true,
                              w: 2,
                              h: 1,
                              icon: "https://example.invalid/fixture.png",
                              name: "Headhunter",
                              typeLine: "Leather Belt",
                              baseType: "Leather Belt",
                              frameType: 3,
                              identified: true,
                              ilvl: 86,
                              note: `~price ${phase === 1 ? 10 : 20} divine`,
                          })),
                          ...Array.from({ length: phase === 1 ? 60 : 40 }, (_, index) => ({
                              id: `equipment-${seller}-${index}`,
                              verified: true,
                              w: 2,
                              h: 3,
                              icon: "https://example.invalid/fixture.png",
                              name: "",
                              typeLine: "Necrotic Armour",
                              baseType: "Necrotic Armour",
                              frameType: 2,
                              identified: true,
                              ilvl: 86,
                              explicitMods: ["+100 to maximum Life"],
                              sockets: Array.from({ length: 6 }, () => ({ group: 0 })),
                              note: `~price ${phase === 1 ? 20 : 5} chaos`,
                          })),
                      ],
                  })),
    };
}

export async function replayFixtures() {
    Object.assign(process.env, {
        APP_ENV: "test",
        POE_CLIENT_ID: "fixture-client",
        POE_CLIENT_SECRET: "fixture-secret",
        POE_USER_AGENT_CONTACT: "fixture@example.invalid",
        POE_CLIENT_VERSION: "0.0.0",
        POE_REALM: "pc",
        POE_BOATS_INGEST_TOKEN: "fixture-token",
    });
    const received: IngestPayload[] = [];
    const requestedCursors: Array<string | null> = [];
    let phase = 0;
    const server = createServer(async (request, response) => {
        try {
            const url = new URL(request.url ?? "/", "http://127.0.0.1");
            response.setHeader("Content-Type", "application/json");
            if (url.pathname === "/public-stash-tabs") {
                requestedCursors.push(url.searchParams.get("id"));
                response.end(JSON.stringify(stashPage(++phase)));
            } else if (url.pathname.startsWith("/currency-exchange/")) {
                response.end(
                    JSON.stringify({
                        next_change_id: Number(url.pathname.split("/").at(-1)),
                        markets: [
                            {
                                league,
                                market_id: "chaos|divine",
                                volume_traded: { chaos: 2000, divine: 10 },
                                lowest_stock: { chaos: 100, divine: 1 },
                                highest_stock: { chaos: 1000, divine: 5 },
                                lowest_ratio: { chaos: 190, divine: 1 },
                                highest_ratio: { chaos: 210, divine: 1 },
                            },
                        ],
                    }),
                );
            } else if (url.pathname === "/api/stash-ingest" && request.method === "POST") {
                assert.equal(request.headers.authorization, "Bearer fixture-token");
                const chunks: Buffer[] = [];
                for await (const chunk of request) chunks.push(Buffer.from(chunk));
                const payload: IngestPayload = JSON.parse(Buffer.concat(chunks).toString());
                received.push(payload);
                response.end(JSON.stringify({ written: payload.rows.length }));
            } else {
                response.statusCode = 404;
                response.end("{}");
            }
        } catch {
            response.statusCode = 500;
            response.end("{}");
        }
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    process.env.POE_BOATS_INGEST_URL = `${baseUrl}/api/stash-ingest`;
    try {
        const { runPipeline } = await import("#src/pipeline.ts");
        const { rollupPs } = await import("#src/ps/rollup.ts");
        const { rollupCx } = await import("#src/cx/rollup.ts");
        const { defaultEquipmentClassifier } = await import("#src/ps/equipment.ts");
        const equipmentRevision = (await defaultEquipmentClassifier()).manifest.revision;
        const client = createClient({ baseUrl, token: "fixture-token", userAgent: "Fixture/1.0" });
        let db = await openDb();
        try {
            const previousCursor = await getCursor(db.conn, "psapi");
            for (let cycle = 0; cycle < 3; cycle++)
                await runPipeline(db.conn, client, {
                    pages: 1,
                    league,
                    observedAt: new Date(
                        (equipmentHour + (cycle === 0 ? 0 : 21 * 24 * 3600)) * 1000,
                    ),
                });
            assert.deepEqual(requestedCursors, [previousCursor ?? null, "fixture-1", "fixture-2"]);
            const hour = Math.floor(Date.now() / 3_600_000) * 3600;
            await rollupPs(db.conn, { hour, league });
            const exchangeHour = Number(await getCursor(db.conn, "cxapi"));
            assert(Number.isSafeInteger(exchangeHour));
            await rollupCx(db.conn, { hour: exchangeHour, league });
            assert(received.some((entry) => entry.stream === "cxapi"));
            const stash = received.find((entry) => entry.stream === "psapi");
            assert(stash && stash.stream === "psapi");
            assert.equal(stash.rows[0]?.listingCount, 3000);
            assert.equal(stash.rows[0]?.prices.divine?.median, 20);
            const equipment = received
                .filter((entry) => entry.stream === "equipment")
                .flatMap((entry) => entry.rows)
                .filter((row) => row.revision === equipmentRevision);
            const bases = equipment.filter((row) => row.cohortId.startsWith("base:"));
            assert.equal(bases.length, 4);
            for (const row of bases) {
                assert.equal(row.listingCount, row.hour === equipmentHour ? 1800 : 1200);
                assert.equal(row.uniqueSellers, 30);
                assert.equal(row.prices.chaos?.median, row.hour === equipmentHour ? 20 : 5);
            }
            const unresolved = equipment.filter((row) => !row.cohortId.startsWith("base:"));
            assert.equal(unresolved.length, 8);
            for (const row of unresolved) {
                assert(row.cohortId.startsWith("donor:"));
                assert.equal(row.listingCount, 0);
                assert.equal(row.unknownCount, row.hour === equipmentHour ? 1800 : 1200);
                assert.deepEqual(row.prices, {});
            }
            await db.close();
            db = await openDb();
            const [counts] = await queryAll<{ total: string; active: string }>(
                db.conn,
                "SELECT count(*) AS total, count(*) FILTER (WHERE removed_at IS NULL) AS active FROM ps_listing",
            );
            assert.equal(Number(counts?.total), 3000);
            assert.equal(Number(counts?.active), 2400);
            assert.equal(await getCursor(db.conn, "psapi"), "fixture-2");
            return {
                ok: true,
                database: process.env.PS_LOCAL_DB ?? "./data.duckdb",
                resumed: previousCursor !== undefined,
                sourceItems: 8400,
                retainedItems: 3000,
                activeItems: 2400,
                removedItems: 600,
                equipmentSourceItems: 3000,
                equipmentHistoricalHours: 2,
                equipmentSummaries: equipment.length,
                receivedSummaries: received.length,
                reopenedCursor: "fixture-2",
                exchangeHour,
                coverage:
                    "Current-hour unique listings, early/middle league equipment prices and saved-hour currency exchange",
            };
        } finally {
            await db.close();
        }
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
            server.closeAllConnections();
        });
    }
}
