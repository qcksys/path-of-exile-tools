import { exchangeCurrencyId, exchangeRealmMatchesGame } from "@poe-tools/market";
import type { TDatabase } from "~/db/client";
import { findCraftingExchangePrices } from "~/db/queries/crafting-exchange.queries";
import {
    craftingMarketDefinition,
    findCraftingMarketPrices,
} from "~/db/queries/crafting-market.queries";
import { CraftingEngine } from "~/lib/crafting-engine";
import { bindExchangePrice, liveExchangePrices } from "~/lib/crafting-exchange";
import { createCraftingItemQuery } from "~/lib/crafting-item-query";
import {
    bindCohortPurchasePrice,
    craftingMarketItemIssue,
    latestCompatibleCohort,
    livePurchasePrices,
} from "~/lib/crafting-market";
import { resolveRuleset } from "~/lib/crafting-rulesets";
import { craftingCatalogSchema } from "~/schemas/crafting";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import type { OperationContext } from "./operation";

export async function craftingMarketEngine(graph: CraftingGraph, context: OperationContext) {
    const ruleset = resolveRuleset(await context.loadCraftingRulesets(), graph.game, graph.ruleset);
    const loaded = await context.loadCraftingRevision(ruleset);
    return new CraftingEngine(craftingCatalogSchema.parse(loaded.catalog));
}

export async function refreshCraftingMarketPrices(
    db: TDatabase,
    graph: CraftingGraph,
    engine: CraftingEngine,
    at?: number,
) {
    let next = graph;
    const issues: string[] = [];
    const adapter = createCraftingItemQuery(engine);
    for (const { node, alternative, reference } of livePurchasePrices(graph)) {
        const itemIssue = craftingMarketItemIssue(engine, alternative.item);
        if (itemIssue) {
            issues.push(`${node.name}: ${itemIssue}`);
            continue;
        }
        if (reference.league !== graph.league) {
            issues.push(`${node.name}: the saved market price belongs to another league.`);
            continue;
        }
        const result = await findCraftingMarketPrices(
            db,
            {
                item: adapter.record(alternative.item),
                requirements: node.output,
                realm: reference.realm,
                league: reference.league,
                currency: graph.currency,
                window: reference.window,
                assumption: reference.assumption,
                at,
            },
            reference.cohortId,
        );
        if (result.truncated) {
            issues.push(
                `${node.name}: market results were truncated; the latest compatible price cannot be established.`,
            );
            continue;
        }
        const sameCohort = result.candidates.filter(
            (entry) => entry.definition.id === reference.cohortId,
        );
        const original =
            sameCohort.find((entry) => entry.definition.revision === reference.revision)
                ?.definition ??
            (sameCohort.length
                ? await craftingMarketDefinition(db, reference.cohortId, reference.revision)
                : null);
        const candidate = original ? latestCompatibleCohort(sameCohort, original) : undefined;
        if (!candidate?.covered) {
            issues.push(
                `${node.name}: ${candidate?.reasons.join(" ") || "The selected cohort has no usable price. Choose another cohort or enter a manual price."}`,
            );
            continue;
        }
        next = bindCohortPurchasePrice(next, engine, node.id, alternative.id, candidate);
    }
    const groups = new Map<string, ReturnType<typeof liveExchangePrices>>();
    for (const binding of liveExchangePrices(graph)) {
        if (
            binding.reference.league !== graph.league ||
            binding.reference.quoteId !== exchangeCurrencyId(graph.currency) ||
            binding.reference.itemId !== binding.id ||
            !exchangeRealmMatchesGame(binding.reference.realm, graph.game)
        ) {
            issues.push(
                `${binding.id}: the saved exchange price does not match this input, game, league or accounting currency.`,
            );
            continue;
        }
        const key = JSON.stringify([binding.reference.realm, binding.reference.window]);
        groups.set(key, [...(groups.get(key) ?? []), binding]);
    }
    for (const bindings of groups.values()) {
        const reference = bindings[0]!.reference;
        const result = await findCraftingExchangePrices(db, {
            game: graph.game,
            realm: reference.realm,
            league: reference.league,
            currency: graph.currency,
            itemIds: bindings.map((binding) => binding.id),
            window: reference.window,
            at,
        });
        for (const { id } of bindings) {
            const quote = result.quotes[id];
            if (quote) next = bindExchangePrice(next, id, quote);
            else
                issues.push(
                    `${id}: ${result.missing[id] ?? "The exchange price is unavailable; enter a manual price."}`,
                );
        }
    }
    return { graph: next, issues };
}

export async function craftingMarketSnapshots(
    db: TDatabase,
    graph: CraftingGraph,
    engine: CraftingEngine,
    hours: number[],
) {
    const recognized = new Set([
        ...livePurchasePrices(graph).map(
            ({ node, alternative }) => `purchase:${node.id}:${alternative.id}`,
        ),
        ...liveExchangePrices(graph).map(({ id }) => id),
    ]);
    const prices = { ...graph.prices };
    for (const node of graph.nodes) {
        if (node.kind === "acquire") {
            for (const alternative of node.alternatives)
                if (alternative.kind === "purchase" && alternative.price)
                    prices[`purchase:${node.id}:${alternative.id}`] ??= alternative.price;
        } else {
            for (const { id, destination } of [
                ...node.branches,
                { id: "fallback", destination: node.fallback },
            ])
                if (destination.kind === "sell" && destination.price)
                    prices[`sale:${node.id}:${id}`] ??= destination.price;
        }
    }
    for (const outcome of graph.outcomes)
        if (outcome.price) prices[`outcome:${outcome.id}`] ??= outcome.price;
    const unbound = Object.entries(prices)
        .filter(([id, price]) => price.source === "market" && !recognized.has(id))
        .map(
            ([id]) =>
                `${id}: this market price has no supported historical binding. Enter a manual assumption or bind a supported source.`,
        );
    const points = [];
    for (const at of [...new Set(hours)].sort((a, b) => a - b)) {
        if (unbound.length) {
            points.push({ at, graph: null, issues: unbound });
            continue;
        }
        const refreshed = await refreshCraftingMarketPrices(db, graph, engine, at);
        points.push({
            at,
            graph: refreshed.issues.length ? null : refreshed.graph,
            issues: refreshed.issues,
        });
    }
    return { points };
}
