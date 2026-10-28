import {
    cohortPriceCoverage,
    decodeCohortPriceReference,
    encodeCohortPriceReference,
    exchangeCurrencyId,
    isDisplayEquivalentCohort,
    sameSourcePreparation,
    selectCohortPrice,
} from "@poe-tools/market";
import type { CraftingItem } from "~/schemas/crafting";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import type { CraftingMarketCandidate } from "~/schemas/crafting-market";
import type { CraftingEngine } from "./crafting-engine";
import { createCraftingItemQuery } from "./crafting-item-query";
import {
    purchaseSourceProfile,
    validateSourcePreparation,
    validateSourcePreparationOutput,
    validateSourcePreparationRevision,
} from "./crafting-source-preparation";

export function selectCraftingMarketPrice(candidate: CraftingMarketCandidate, currency: string) {
    const native = selectCohortPrice(candidate.latest, currency, candidate.window);
    if (native) return native;
    const { latest, exchange } = candidate;
    if (candidate.conversion !== "exchange-v1" || !exchange) return null;
    const { quote } = exchange;
    if (
        quote.realm !== latest.realm ||
        quote.league !== latest.league ||
        quote.hour !== latest.hour ||
        quote.window !== undefined ||
        (quote.windowStart !== undefined && quote.windowStart !== latest.hour) ||
        quote.itemId !== exchangeCurrencyId(exchange.currency) ||
        quote.quoteId !== exchangeCurrencyId(currency)
    )
        return null;
    const source = selectCohortPrice(latest, exchange.currency);
    if (!source) return null;
    const min = source.min * quote.amount;
    const median = source.median * quote.amount;
    const max = source.max * quote.amount;
    if (![min, median, max].every((amount) => Number.isFinite(amount) && amount > 0)) return null;
    return { ...source, min, median, max };
}

export function craftingMarketItemIssue(engine: CraftingEngine, item: CraftingItem) {
    const base = engine.base(item);
    const baseline: Record<string, unknown> = engine.createItem(item.baseId, item.level);
    const coveredFields = new Set([
        "baseId",
        "level",
        "rarity",
        "mods",
        "implicits",
        "influences",
        "sockets",
        "socketLinks",
    ]);
    const extra = Object.entries(item)
        .filter(
            ([field, value]) =>
                !coveredFields.has(field) &&
                JSON.stringify(value) !== JSON.stringify(baseline[field]),
        )
        .map(([field]) => field);
    const nativeImplicits = base.implicits;
    if (
        JSON.stringify(item.implicits.map((modifier) => modifier.id).sort()) !==
        JSON.stringify([...nativeImplicits].sort())
    )
        extra.push("modified implicits");
    return extra.length
        ? `Equipment cohorts do not price this prepared state (${extra.join(", ")}). Enter a manual price or add preparation after acquiring the base.`
        : null;
}

export function livePurchasePrices(graph: CraftingGraph) {
    return graph.nodes.flatMap((node) =>
        node.kind === "acquire"
            ? node.alternatives.flatMap((alternative) => {
                  if (alternative.kind !== "purchase") return [];
                  const price =
                      graph.prices[`purchase:${node.id}:${alternative.id}`] ?? alternative.price;
                  const reference =
                      price?.source === "market"
                          ? decodeCohortPriceReference(price.cohortId)
                          : null;
                  return reference ? [{ node, alternative, reference }] : [];
              })
            : [],
    );
}

export function bindCohortPurchasePrice(
    graph: CraftingGraph,
    engine: CraftingEngine,
    nodeId: string,
    alternativeId: string,
    candidate: CraftingMarketCandidate,
): CraftingGraph {
    const node = graph.nodes.find((entry) => entry.id === nodeId);
    const alternative =
        node?.kind === "acquire"
            ? node.alternatives.find((entry) => entry.id === alternativeId)
            : undefined;
    if (node?.kind !== "acquire" || alternative?.kind !== "purchase")
        throw new Error("Choose a purchase alternative.");
    if (graph.game !== "poe1" || engine.catalog.game !== graph.game)
        throw new Error("PoE 2 equipment uses manual prices.");
    const itemIssue = craftingMarketItemIssue(engine, alternative.item);
    if (itemIssue) throw new Error(itemIssue);
    const { definition, latest } = candidate;
    const sourcePreparation = purchaseSourceProfile(alternative);
    validateSourcePreparationRevision(
        graph.ruleset.engine,
        sourcePreparation,
        alternative.item.baseId,
    );
    validateSourcePreparation(engine, alternative);
    validateSourcePreparationOutput(alternative, node.output);
    if (!sameSourcePreparation(sourcePreparation, candidate.sourcePreparation))
        throw new Error("The price requires a different source preparation.");
    if (candidate.assumption) {
        if (!isDisplayEquivalentCohort(definition))
            throw new Error(
                "A representative assumption requires a display-equivalent donor family.",
            );
        for (const filter of definition.query.groups.flatMap((group) => group.filters)) {
            if (filter.kind !== "mod" || !filter.ids || filter.ids.length < 2) continue;
            const signatures = filter.ids.map((id) => {
                const modifier = engine.catalog.mods[id];
                if (!modifier)
                    throw new Error("The donor family is absent from this crafting revision.");
                const { required_level: _requiredLevel, ...properties } = modifier;
                return JSON.stringify(properties);
            });
            if (new Set(signatures).size !== 1)
                throw new Error(
                    "These donor modifiers are not display-equivalent in this crafting revision.",
                );
        }
    }
    if (latest.cohortId !== definition.id || latest.league !== graph.league)
        throw new Error("The price belongs to a different cohort or league.");
    const coverage = cohortPriceCoverage(
        definition,
        createCraftingItemQuery(engine).record(alternative.item),
        node.output,
        candidate.assumption,
        sourcePreparation,
    );
    if (!coverage.covered) throw new Error(coverage.reasons.join(" "));
    const price = selectCraftingMarketPrice(candidate, graph.currency);
    if (!price) throw new Error(`No asking price in ${graph.currency} is available.`);
    const nextPrice = {
        amount: price.median,
        currency: graph.currency,
        source: "market" as const,
        confidence: latest.prices[graph.currency] ? price.confidence : null,
        samples: price.count,
        observedAt: new Date(latest.hour * 1000).toISOString(),
        cohortId: encodeCohortPriceReference({
            realm: latest.realm,
            league: latest.league,
            cohortId: latest.cohortId,
            window: candidate.window,
            assumption: candidate.assumption,
            sourcePreparation,
            conversion: candidate.conversion,
            exchange: latest.prices[graph.currency] ? undefined : candidate.exchange,
        }),
    };
    const prices = { ...graph.prices };
    delete prices[`purchase:${node.id}:${alternative.id}`];
    return {
        ...graph,
        prices,
        nodes: graph.nodes.map((entry) =>
            entry.id === node.id
                ? {
                      ...node,
                      alternatives: node.alternatives.map((entry) =>
                          entry.id === alternative.id
                              ? { ...alternative, price: nextPrice }
                              : entry,
                      ),
                  }
                : entry,
        ),
    };
}
