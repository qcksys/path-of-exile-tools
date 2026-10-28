import {
    cohortHourlySchema,
    cohortPriceCoverage,
    exchangeCurrencyId,
    exchangeListingCurrencySchema,
    isDisplayEquivalentCohort,
    marketCohortDefinitionSchema,
    marketObservationRange,
} from "@poe-tools/market";
import {
    and,
    desc,
    eq,
    gt,
    gte,
    inArray,
    isNull,
    lt,
    lte,
    max,
    or,
    type SQL,
    sql,
} from "drizzle-orm";
import type { TDatabase } from "~/db/client";
import { tStashCohort as cohort } from "~/db/schema/stash.cohort";
import { tStashCohortHourly as hourly } from "~/db/schema/stash.cohort-hourly";
import { tStashCohortRevision as revisions } from "~/db/schema/stash.cohort-revision";
import {
    type CohortPriceWindows,
    tStashCohortWindow as window,
} from "~/db/schema/stash.cohort-window";
import { selectCraftingMarketPrice } from "~/lib/crafting-market";
import type {
    CraftingMarketCandidate,
    CraftingMarketHistoryInput,
    CraftingMarketInput,
    CraftingMarketResult,
} from "~/schemas/crafting-market";
import type { ServerTiming } from "~/services/server-timing.server";
import { findCraftingExchangePrices } from "./crafting-exchange.queries";

const definitionColumns = {
    id: cohort.id,
    revision: cohort.revision,
    catalogHash: cohort.catalogHash,
    name: cohort.name,
    purpose: cohort.purpose,
    query: cohort.query,
};
const summaryColumns = {
    realm: hourly.realm,
    league: hourly.league,
    hour: hourly.hour,
    revision: revisions.revision,
    cohortId: hourly.cohortId,
    listingCount: hourly.listingCount,
    uniqueSellers: hourly.uniqueSellers,
    unknownCount: hourly.unknownCount,
    prices: hourly.prices,
    confidenceMethod: hourly.confidenceMethod,
    firstSeenAt: hourly.firstSeenAt,
    lastSeenAt: hourly.lastSeenAt,
    windows: window.windows,
};
// Windows count only while they belong to the hourly row's revision.
const summaryJoins = {
    revision: eq(revisions.seq, hourly.revisionSeq),
    window: and(
        eq(window.realm, hourly.realm),
        eq(window.league, hourly.league),
        eq(window.hour, hourly.hour),
        eq(window.cohortId, hourly.cohortId),
        eq(window.revisionSeq, hourly.revisionSeq),
    ) as SQL,
};
const noCoverageMessage =
    "No captured cohort covers this item in the latest 24 completed hours at this cutoff. Enter a manual price or check trade.";

/** A stored cohort hour with its price windows, if they are still kept, merged back in. */
function cohortSummary({
    windows,
    ...row
}: {
    windows: CohortPriceWindows | null;
    prices: Record<string, object>;
}) {
    const prices = Object.fromEntries(
        Object.entries(row.prices).map(([currency, price]) => [
            currency,
            windows?.[currency] ? { ...price, windows: windows[currency] } : price,
        ]),
    );
    return cohortHourlySchema.parse({ ...row, prices });
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
    let databaseMs = 0;
    let parseMs = 0;
    let fxStarted: number | undefined;
    let queries = 0;
    let rowCount = 0;
    let exchangeRows = 0;
    async function read<T>(query: PromiseLike<T[]>) {
        const start = performance.now();
        queries++;
        try {
            const rows = await query;
            rowCount += rows.length;
            return rows;
        } finally {
            databaseMs += performance.now() - start;
        }
    }
    try {
        const range = marketObservationRange(input.at);
        const scope = and(
            eq(hourly.realm, input.realm),
            eq(hourly.league, input.league),
            gte(hourly.hour, range.earliestHour),
            lte(hourly.hour, range.latestHour),
            cohortId === undefined ? undefined : eq(hourly.cohortId, cohortId),
        );
        // Without observations in the window no definition can produce a candidate.
        const [observed] = await read(
            db
                .select({ hour: hourly.hour })
                .from(hourly)
                .where(
                    and(
                        eq(hourly.realm, input.realm),
                        eq(hourly.league, input.league),
                        gte(hourly.hour, range.earliestHour),
                        lte(hourly.hour, range.latestHour),
                    ),
                )
                .limit(1),
        );
        if (!observed) return { candidates: [], truncated: false, message: noCoverageMessage };
        const bases = or(
            isNull(cohort.baseTypes),
            sql`JSON_CONTAINS(${cohort.baseTypes}, ${JSON.stringify(input.item.item.baseType)})`,
        );
        const latestHour = db
            .select({ hour: max(hourly.hour) })
            .from(hourly)
            .where(and(scope, eq(hourly.cohortId, cohort.id)));
        let ranked: CraftingMarketCandidate[] = [];
        const identity = (value: { id: string }) => value.id;
        async function orderIdentities(candidates: CraftingMarketCandidate[], limit: number) {
            return read(
                db
                    .select({ id: cohort.id })
                    .from(cohort)
                    .where(
                        inArray(
                            cohort.id,
                            candidates.map(({ definition }) => definition.id),
                        ),
                    )
                    .orderBy(cohort.id)
                    .limit(limit),
            );
        }
        let cursor: { id: string; baseTypeKey: string | null } | undefined;
        while (true) {
            const definitions = await read(
                db
                    .select({ ...definitionColumns, baseTypeKey: cohort.baseTypeKey })
                    .from(cohort, { forceIndex: "stash_cohort_base_page_idx" })
                    .where(
                        and(
                            bases,
                            inArray(cohort.baseTypeKey, ["", input.item.item.baseType]),
                            cohortId === undefined ? undefined : eq(cohort.id, cohortId),
                            cursor
                                ? or(
                                      gt(cohort.baseTypeKey, cursor.baseTypeKey!),
                                      and(
                                          eq(cohort.baseTypeKey, cursor.baseTypeKey!),
                                          gt(cohort.id, cursor.id),
                                      ),
                                  )
                                : undefined,
                        ),
                    )
                    .orderBy(cohort.baseTypeKey, cohort.id)
                    .limit(500),
            );
            const parseStarted = performance.now();
            const matching = definitions
                .map(({ baseTypeKey: _baseTypeKey, ...row }) => {
                    const definition = marketCohortDefinitionSchema.parse(row);
                    const assumption = isDisplayEquivalentCohort(definition)
                        ? input.assumption
                        : undefined;
                    const coverage = cohortPriceCoverage(
                        definition,
                        input.item,
                        input.requirements,
                        assumption,
                        input.sourcePreparation,
                    );
                    return {
                        definition,
                        covered: coverage.covered,
                        reasons: coverage.reasons,
                        ...(input.window ? { window: input.window } : {}),
                        ...(assumption ? { assumption } : {}),
                        ...(input.sourcePreparation
                            ? { sourcePreparation: input.sourcePreparation }
                            : {}),
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
            parseMs += performance.now() - parseStarted;
            if (matching.length) {
                // Match definitions before reading their latest buckets; unrelated histories must not consume the result limit.
                const latest = db
                    .select({
                        cohortId: cohort.id,
                        hour: sql<number>`(${latestHour})`.as("latest_hour"),
                    })
                    .from(cohort)
                    .where(
                        inArray(
                            cohort.id,
                            matching.map(({ definition }) => definition.id),
                        ),
                    )
                    .as("latest");
                const rows = await read(
                    db
                        .select({ summary: summaryColumns })
                        .from(hourly)
                        .innerJoin(
                            latest,
                            and(eq(hourly.cohortId, latest.cohortId), eq(hourly.hour, latest.hour)),
                        )
                        .innerJoin(revisions, summaryJoins.revision)
                        .leftJoin(window, summaryJoins.window)
                        .where(scope),
                );
                const summaryStarted = performance.now();
                const byId = new Map(
                    matching.map((candidate) => [candidate.definition.id, candidate]),
                );
                for (const row of rows) {
                    const latest = cohortSummary(row.summary);
                    ranked.push({ ...byId.get(latest.cohortId)!, latest });
                }
                ranked.sort((a, b) => b.latest.hour - a.latest.hour);
                parseMs += performance.now() - summaryStarted;
                if (ranked.length > 2001) {
                    const boundaryStarted = performance.now();
                    const boundary = ranked[2000]!.latest.hour;
                    const newer = ranked.filter((candidate) => candidate.latest.hour > boundary);
                    const tied = ranked.filter((candidate) => candidate.latest.hour === boundary);
                    const remaining = 2001 - newer.length;
                    parseMs += performance.now() - boundaryStarted;
                    // The database resolves only the boundary tie; PK scan order cannot decide the global result cap.
                    const selectedIdentities =
                        tied.length > remaining
                            ? await orderIdentities(tied, remaining)
                            : undefined;
                    const mergeStarted = performance.now();
                    if (selectedIdentities) {
                        const selected = new Set(selectedIdentities.map(identity));
                        ranked = [
                            ...newer,
                            ...tied.filter((candidate) =>
                                selected.has(identity(candidate.definition)),
                            ),
                        ];
                    } else ranked = [...newer, ...tied];
                    parseMs += performance.now() - mergeStarted;
                }
            }
            if (definitions.length < 500) break;
            cursor = definitions.at(-1)!;
        }
        if (ranked.length > 1) {
            const ordered = await orderIdentities(ranked, ranked.length);
            const sortStarted = performance.now();
            const order = new Map(ordered.map((value, index) => [identity(value), index]));
            ranked.sort(
                (a, b) =>
                    b.latest.hour - a.latest.hour ||
                    order.get(identity(a.definition))! - order.get(identity(b.definition))!,
            );
            parseMs += performance.now() - sortStarted;
        }
        const candidates = ranked.slice(0, 2000);
        fxStarted = performance.now();
        const currencyIdsByHour = new Map<number, Set<string>>();
        if (input.conversion) {
            for (const candidate of candidates) {
                if (!candidate.covered || candidate.latest.prices[input.currency]) continue;
                const ids = currencyIdsByHour.get(candidate.latest.hour) ?? new Set<string>();
                for (const currency of exchangeListingCurrencySchema.options)
                    if (candidate.latest.prices[currency]) ids.add(exchangeCurrencyId(currency)!);
                if (ids.size) currencyIdsByHour.set(candidate.latest.hour, ids);
            }
        }
        const exchangeByHour = new Map<
            number,
            Awaited<ReturnType<typeof findCraftingExchangePrices>>
        >();
        const priced: CraftingMarketCandidate[] = [];
        for (const candidate of candidates) {
            const next: CraftingMarketCandidate = candidate;
            const currencyIds = currencyIdsByHour.get(next.latest.hour);
            if (next.covered && !next.latest.prices[input.currency] && currencyIds) {
                let exchange = exchangeByHour.get(next.latest.hour);
                if (!exchange) {
                    exchange = await findCraftingExchangePrices(
                        db,
                        {
                            game: "poe1",
                            realm: input.realm,
                            league: input.league,
                            currency: input.currency,
                            itemIds: [...currencyIds],
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
                for (const currency of exchangeListingCurrencySchema.options) {
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
            truncated: ranked.length > 2000,
            message: candidates.length ? null : noCoverageMessage,
        };
    } finally {
        const ended = performance.now();
        timing?.add("equipment_db", databaseMs);
        timing?.add("equipment_parse", parseMs);
        timing?.add("equipment_fx", fxStarted === undefined ? 0 : ended - fxStarted);
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
        .from(hourly, { forceIndex: "stash_cohort_history_idx" })
        .innerJoin(revisions, summaryJoins.revision)
        .leftJoin(window, summaryJoins.window)
        .where(
            and(
                eq(hourly.realm, input.realm),
                eq(hourly.league, input.league),
                eq(hourly.cohortId, input.cohortId),
                input.before === undefined ? undefined : lt(hourly.hour, input.before),
            ),
        )
        .orderBy(desc(hourly.hour))
        .limit(input.limit + 1);
    const history = rows.slice(0, input.limit).map(cohortSummary);
    return { history, nextBefore: rows.length > input.limit ? history.at(-1)!.hour : null };
}
