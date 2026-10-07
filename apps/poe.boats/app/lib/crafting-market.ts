import {
    cohortPriceCoverage,
    decodeCohortPriceReference,
    encodeCohortPriceReference,
    isDisplayEquivalentCohort,
    type MarketCohortDefinition,
    selectCohortPrice,
} from "@poe-tools/market";
import type { CraftingItem } from "~/schemas/crafting";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import type { CraftingMarketCandidate } from "~/schemas/crafting-market";
import type { CraftingEngine } from "./crafting-engine";
import { createCraftingItemQuery } from "./crafting-item-query";

export function latestCompatibleCohort(
    candidates: CraftingMarketCandidate[],
    original: MarketCohortDefinition,
) {
    return candidates
        .filter(
            (candidate) =>
                candidate.definition.id === original.id &&
                candidate.definition.purpose === original.purpose &&
                JSON.stringify(candidate.definition.query) === JSON.stringify(original.query),
        )
        .sort(
            (a, b) =>
                b.latest.hour - a.latest.hour ||
                Date.parse(b.latest.lastSeenAt ?? "1970-01-01T00:00:00Z") -
                    Date.parse(a.latest.lastSeenAt ?? "1970-01-01T00:00:00Z") ||
                Number(b.definition.revision === original.revision) -
                    Number(a.definition.revision === original.revision) ||
                a.definition.revision.localeCompare(b.definition.revision),
        )[0];
}

export function craftingMarketItemIssue(engine: CraftingEngine, item: CraftingItem) {
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
    const nativeImplicits = engine.base(item).implicits;
    if (item.implicits.some((modifier) => !nativeImplicits.includes(modifier.id)))
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
    if (
        latest.cohortId !== definition.id ||
        latest.revision !== definition.revision ||
        latest.league !== graph.league
    )
        throw new Error("The price belongs to a different cohort or league.");
    const coverage = cohortPriceCoverage(
        definition,
        createCraftingItemQuery(engine).record(alternative.item),
        node.output,
        candidate.assumption,
    );
    if (!coverage.covered) throw new Error(coverage.reasons.join(" "));
    const price = selectCohortPrice(latest, graph.currency, candidate.window);
    if (!price) throw new Error(`No asking price in ${graph.currency} is available.`);
    const nextPrice = {
        amount: price.median,
        currency: graph.currency,
        source: "market" as const,
        confidence: price.confidence,
        samples: price.count,
        observedAt: new Date(latest.hour * 1000).toISOString(),
        cohortId: encodeCohortPriceReference({
            realm: latest.realm,
            league: latest.league,
            revision: latest.revision,
            cohortId: latest.cohortId,
            window: candidate.window,
            assumption: candidate.assumption,
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
