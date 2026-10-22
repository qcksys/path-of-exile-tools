// biome-ignore-all lint/style/useNamingConvention: The feed uses GGG's public field names.
import { exchangeSnapshotSchema, marketObservationRange } from "@poe-tools/market";
import { z } from "zod";
import type { TDatabase } from "~/db/client";
import { upsertStashCurrencyHourly } from "~/db/queries/stash-ingest.queries";
import { sStashCurrencyHourlyI } from "~/db/schema/stash.currency-hourly";
import { logger } from "~/services/logger";

const amounts = z.record(
    z.string().max(500),
    z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
);
const feedSchema = z.object({
    next_change_id: exchangeSnapshotSchema.shape.hour,
    markets: z
        .array(
            z.object({
                league: exchangeSnapshotSchema.shape.league,
                market_id: sStashCurrencyHourlyI.shape.marketId.min(1),
                volume_traded: amounts,
                lowest_ratio: amounts,
                highest_ratio: amounts,
                lowest_stock: amounts,
                highest_stock: amounts,
            }),
        )
        .max(50_000),
});
const maximumResponseBytes = 16 * 1024 * 1024;

async function readFeed(response: Response) {
    if (!response.body) throw new Error("Empty currency exchange response.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = "";
    try {
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > maximumResponseBytes) {
                await reader.cancel();
                throw new Error("Currency exchange response exceeded 16 MiB.");
            }
            text += decoder.decode(chunk.value, { stream: true });
        }
        return feedSchema.parse(JSON.parse(text + decoder.decode()));
    } finally {
        reader.releaseLock();
    }
}

export async function updateCurrencyExchange(db: TDatabase, scheduledTime = Date.now()) {
    const { latestHour } = marketObservationRange(undefined, scheduledTime / 1000);
    const failures: Error[] = [];
    let hours = 0;
    let rows = 0;
    for (const realm of ["pc", "poe2"] as const) {
        for (let offset = 0; offset < 6; offset++) {
            const hour = latestHour - offset * 3600;
            const url = `https://web.poecdn.com/api/currency-exchange/${realm === "pc" ? "" : `${realm}/`}${hour}`;
            try {
                const response = await fetch(url, {
                    headers: { "User-Agent": "poe.boats exchange capture (https://poe.boats)" },
                    signal: AbortSignal.timeout(20_000),
                });
                if (!response.ok) {
                    await response.body?.cancel();
                    throw new Error(`Currency exchange returned HTTP ${response.status}.`);
                }
                const feed = await readFeed(response);
                if (feed.next_change_id !== hour && feed.next_change_id !== hour + 3600)
                    throw new Error(
                        "Currency exchange did not return the requested hourly digest.",
                    );
                const identities = new Set<string>();
                const captured = feed.markets.map((market) => {
                    const identity = JSON.stringify([market.league, market.market_id]);
                    if (identities.has(identity))
                        throw new Error(
                            "Currency exchange repeated a market in the hourly digest.",
                        );
                    identities.add(identity);
                    return {
                        realm,
                        hour,
                        league: market.league,
                        marketId: market.market_id,
                        volumeTraded: market.volume_traded,
                        lowestRatio: market.lowest_ratio,
                        highestRatio: market.highest_ratio,
                        lowestStock: market.lowest_stock,
                        highestStock: market.highest_stock,
                    };
                });
                rows += await upsertStashCurrencyHourly(db, captured);
                hours++;
            } catch (cause) {
                const error = new Error(
                    `Currency exchange capture failed for ${realm} at ${hour}.`,
                    { cause },
                );
                failures.push(error);
                logger.error(
                    { realm, hour, error: cause instanceof Error ? cause.message : String(cause) },
                    error.message,
                );
            }
        }
    }
    logger.info({ hours, rows, failures: failures.length }, "Currency exchange capture completed");
    if (failures.length) throw new AggregateError(failures, "Currency exchange capture failed.");
    return { hours, rows };
}
