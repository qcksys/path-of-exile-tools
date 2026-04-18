import leaguesData from "~/data/leagues.json";
import type { TDatabase } from "~/db/client";
import { upsertPriceCache } from "~/db/queries/idol-planner.queries";
import { PoeNinjaExchangeResponseSchema, type ScarabPricesData } from "~/schemas/scarab";
import { logger } from "~/services/logger";

const POE_NINJA_API_URL = "https://poe.ninja/poe1/api/economy/exchange/current/overview";

const PC_LEAGUES = leaguesData.result
    .filter((league) => league.realm === "pc")
    .map((league) => league.id);

export function normalizeExchangeId(exchangeId: string): string {
    return exchangeId.replace(/-/g, "_");
}

export function parseScarabPricesFromExchangeResponse(
    data: unknown,
    league: string,
): ScarabPricesData | null {
    const parsed = PoeNinjaExchangeResponseSchema.safeParse(data);
    if (!parsed.success) {
        return null;
    }

    const itemNameMap = new Map<string, string>();
    for (const item of parsed.data.items) {
        itemNameMap.set(item.id, item.name);
    }

    const prices: ScarabPricesData["prices"] = {};
    for (const line of parsed.data.lines) {
        if (!line.id.includes("scarab")) continue;

        const id = normalizeExchangeId(line.id);
        const name = itemNameMap.get(line.id) ?? line.id;
        prices[id] = {
            name,
            chaosValue: line.primaryValue,
        };
    }

    return {
        league,
        prices,
        updatedAt: new Date().toISOString(),
    };
}

async function fetchScarabPricesForLeague(league: string): Promise<ScarabPricesData | null> {
    const url = new URL(POE_NINJA_API_URL);
    url.searchParams.set("league", league);
    url.searchParams.set("type", "Scarab");

    try {
        const response = await fetch(url.toString());
        if (!response.ok) {
            logger.warn({ league, status: response.status }, "POE Ninja API request failed");
            return null;
        }

        const data = await response.json();
        const result = parseScarabPricesFromExchangeResponse(data, league);
        if (!result) {
            logger.warn({ league }, "POE Ninja API response validation failed");
            return null;
        }

        return result;
    } catch (error) {
        logger.error(
            { league, error: error instanceof Error ? error.message : String(error) },
            "POE Ninja API fetch error",
        );
        return null;
    }
}

export async function updateScarabPrices(
    db: TDatabase,
): Promise<{ successCount: number; errorCount: number }> {
    let successCount = 0;
    let errorCount = 0;

    for (const league of PC_LEAGUES) {
        const pricesData = await fetchScarabPricesForLeague(league);
        if (pricesData) {
            await upsertPriceCache(db, league, pricesData.prices);
            successCount++;
        } else {
            errorCount++;
        }
    }

    return { successCount, errorCount };
}
