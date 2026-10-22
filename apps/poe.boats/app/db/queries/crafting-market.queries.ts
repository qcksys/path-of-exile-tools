import {
    cohortHourlySchema,
    cohortPriceCoverage,
    exchangeCurrencyId,
    isDisplayEquivalentCohort,
    marketCohortDefinitionSchema,
    marketObservationRange,
} from "@poe-tools/market";
import { and, desc, eq, getTableColumns, gte, isNull, lt, lte, max, or, sql } from "drizzle-orm";
import type { TDatabase } from "~/db/client";
import { tStashCohort as cohort } from "~/db/schema/stash.cohort";
import { tStashCohortHourly as hourly } from "~/db/schema/stash.cohort-hourly";
import { selectCraftingMarketPrice } from "~/lib/crafting-market";
import type {
    CraftingMarketCandidate,
    CraftingMarketHistoryInput,
    CraftingMarketInput,
    CraftingMarketResult,
} from "~/schemas/crafting-market";
import { findCraftingExchangePrices } from "./crafting-exchange.queries";

const hourColumns = getTableColumns(hourly);
const definitionColumns = {
    id: cohort.id,
    revision: cohort.revision,
    catalogHash: cohort.catalogHash,
    name: cohort.name,
    purpose: cohort.purpose,
    query: cohort.query,
};
const {
    rowCreatedAt: _created,
    rowUpdatedAt: _updated,
    rowDeletedAt: _deleted,
    ...summaryColumns
} = hourColumns;

export async function craftingMarketDefinition(db: TDatabase, id: string, revision: string) {
    const [row] = await db
        .select(definitionColumns)
        .from(cohort)
        .where(and(eq(cohort.id, id), eq(cohort.revision, revision)))
        .limit(1);
    return row ? marketCohortDefinitionSchema.parse(row) : null;
}

export async function findCraftingMarketPrices(
    db: TDatabase,
    input: CraftingMarketInput,
    cohortId?: string,
): Promise<CraftingMarketResult> {
    if (input.item.game === "poe2")
        return {
            candidates: [],
            truncated: false,
            message: "PoE 2 equipment uses manual prices and trade searches.",
        };
    const range = marketObservationRange(input.at);
    const scope = and(
        eq(hourly.realm, input.realm),
        eq(hourly.league, input.league),
        gte(hourly.hour, range.earliestHour),
        lte(hourly.hour, range.latestHour),
        cohortId === undefined ? undefined : eq(hourly.cohortId, cohortId),
    );
    const latest = db
        .select({
            revision: hourly.revision,
            cohortId: hourly.cohortId,
            hour: max(hourly.hour).as("latest_hour"),
        })
        .from(hourly)
        .where(scope)
        .groupBy(hourly.revision, hourly.cohortId)
        .as("latest");
    const rows = await db
        .select({
            definition: definitionColumns,
            latest: summaryColumns,
        })
        .from(hourly)
        .innerJoin(
            latest,
            and(
                eq(hourly.revision, latest.revision),
                eq(hourly.cohortId, latest.cohortId),
                eq(hourly.hour, latest.hour),
            ),
        )
        .innerJoin(
            cohort,
            and(eq(cohort.revision, hourly.revision), eq(cohort.id, hourly.cohortId)),
        )
        .where(
            and(
                scope,
                or(
                    isNull(cohort.baseTypes),
                    sql`JSON_CONTAINS(${cohort.baseTypes}, ${JSON.stringify(input.item.item.baseType)})`,
                ),
            ),
        )
        .orderBy(desc(hourly.hour), cohort.id, cohort.revision)
        .limit(2001);
    const candidates = rows
        .slice(0, 2000)
        .map((row) => {
            const definition = marketCohortDefinitionSchema.parse(row.definition);
            const latest = cohortHourlySchema.parse(row.latest);
            const assumption = isDisplayEquivalentCohort(definition) ? input.assumption : undefined;
            const coverage = cohortPriceCoverage(
                definition,
                input.item,
                input.requirements,
                assumption,
            );
            return {
                definition,
                latest,
                covered: coverage.covered,
                reasons: coverage.reasons,
                ...(input.window ? { window: input.window } : {}),
                ...(assumption ? { assumption } : {}),
                ...(input.conversion ? { conversion: input.conversion } : {}),
            };
        })
        .filter(
            (candidate) =>
                candidate.covered ||
                !candidate.reasons.includes(
                    "The configured item does not definitely match this cohort.",
                ),
        );
    const exchangeByHour = new Map<
        number,
        Awaited<ReturnType<typeof findCraftingExchangePrices>>
    >();
    const priced: CraftingMarketCandidate[] = [];
    for (const candidate of candidates) {
        const next: CraftingMarketCandidate = candidate;
        if (next.covered && !next.latest.prices[input.currency] && input.conversion) {
            let exchange = exchangeByHour.get(next.latest.hour);
            if (!exchange) {
                exchange = await findCraftingExchangePrices(
                    db,
                    {
                        game: "poe1",
                        realm: input.realm,
                        league: input.league,
                        currency: input.currency,
                        itemIds: ["chaos", "divine", "exalted"].map(
                            (currency) => exchangeCurrencyId(currency)!,
                        ),
                        conversion: "reference-currency-v1",
                        at: next.latest.hour,
                    },
                    { exactHour: true },
                );
                exchangeByHour.set(next.latest.hour, exchange);
            }
            for (const currency of ["chaos", "divine", "exalted"] as const) {
                const quote = exchange.quotes[exchangeCurrencyId(currency)!];
                if (!next.latest.prices[currency] || !quote) continue;
                next.exchange = { currency, quote };
                if (selectCraftingMarketPrice(next, input.currency)) break;
                delete next.exchange;
            }
        }
        if (!selectCraftingMarketPrice(next, input.currency)) {
            next.covered = false;
            next.reasons.push(
                input.conversion
                    ? `No asking price in ${input.currency} or matching-hour exchange conversion is available for this cohort.`
                    : `No asking price in ${input.currency} is available for this cohort.`,
            );
        }
        priced.push(next);
    }
    return {
        candidates: priced,
        truncated: rows.length > 2000,
        message: candidates.length
            ? null
            : "No captured cohort covers this item in the latest 24 completed hours at this cutoff. Enter a manual price or check trade.",
    };
}

export async function craftingMarketHistory(db: TDatabase, input: CraftingMarketHistoryInput) {
    const rows = await db
        .select(summaryColumns)
        .from(hourly)
        .where(
            and(
                eq(hourly.realm, input.realm),
                eq(hourly.league, input.league),
                eq(hourly.revision, input.revision),
                eq(hourly.cohortId, input.cohortId),
                input.before === undefined ? undefined : lt(hourly.hour, input.before),
            ),
        )
        .orderBy(desc(hourly.hour))
        .limit(input.limit + 1);
    const history = rows.slice(0, input.limit).map((row) => cohortHourlySchema.parse(row));
    return { history, nextBefore: rows.length > input.limit ? history.at(-1)!.hour : null };
}
