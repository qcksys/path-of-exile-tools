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
import type { ServerTiming } from "~/services/server-timing.server";
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
    timing?: ServerTiming,
): Promise<CraftingMarketResult> {
    if (input.item.game === "poe2")
        return {
            candidates: [],
            truncated: false,
            message: "PoE 2 equipment uses manual prices and trade searches.",
        };
    const started = performance.now();
    const phases: number[] = [];
    let queries = 0;
    let rowCount = 0;
    let exchangeRows = 0;
    try {
        const range = marketObservationRange(input.at);
        const scope = and(
            eq(hourly.realm, input.realm),
            eq(hourly.league, input.league),
            gte(hourly.hour, range.earliestHour),
            lte(hourly.hour, range.latestHour),
            cohortId === undefined ? undefined : eq(hourly.cohortId, cohortId),
        );
        const bases = or(
            isNull(cohort.baseTypes),
            sql`JSON_CONTAINS(${cohort.baseTypes}, ${JSON.stringify(input.item.item.baseType)})`,
        );
        // Avoid repeating a broad history range scan for each matching definition.
        const latestHour = db
            .select({ hour: max(hourly.hour) })
            .from(hourly, { forceIndex: "PRIMARY" })
            .where(
                and(scope, eq(hourly.revision, cohort.revision), eq(hourly.cohortId, cohort.id)),
            );
        // Resolve each matching definition's hour without grouping unrelated cohort histories.
        const latest = db
            .select({
                revision: cohort.revision,
                cohortId: cohort.id,
                hour: sql<number>`(${latestHour})`.as("latest_hour"),
            })
            .from(cohort)
            .where(and(bases, cohortId === undefined ? undefined : eq(cohort.id, cohortId)))
            .as("latest");
        const query = db
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
            .where(and(scope, bases))
            .orderBy(desc(hourly.hour), cohort.id, cohort.revision)
            .limit(2001);
        phases[0] = performance.now();
        queries++;
        const rows = await query;
        rowCount = rows.length;
        phases[1] = performance.now();
        const candidates = rows
            .slice(0, 2000)
            .map((row) => {
                const definition = marketCohortDefinitionSchema.parse(row.definition);
                const latest = cohortHourlySchema.parse(row.latest);
                const assumption = isDisplayEquivalentCohort(definition)
                    ? input.assumption
                    : undefined;
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
        phases[2] = performance.now();
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
                        (count) => {
                            queries++;
                            exchangeRows += count;
                        },
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
    } finally {
        const ended = performance.now();
        for (const [index, name] of ["equipment_db", "equipment_parse", "equipment_fx"].entries()) {
            const start = phases[index];
            timing?.add(name, start === undefined ? 0 : (phases[index + 1] ?? ended) - start);
        }
        timing?.add("equipment_total", ended - started);
        timing?.add(
            "equipment_counts",
            0,
            `queries=${queries} rows=${rowCount} exchange_rows=${exchangeRows}`,
        );
    }
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
