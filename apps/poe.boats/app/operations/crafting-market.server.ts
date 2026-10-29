import {
    exchangeCurrencyId,
    exchangeRealmMatchesGame,
    sameSourcePreparation,
} from "@poe-tools/market";
import type { TDatabase } from "~/db/client";
import { findCraftingExchangePrices } from "~/db/queries/crafting-exchange.queries";
import {
    exchangeMembershipAt,
    knownCraftingExchangeItems,
    loadCraftingExchangeMembership,
} from "~/db/queries/crafting-exchange-membership.queries";
import { findCraftingMarketPrices } from "~/db/queries/crafting-market.queries";
import { CraftingEngine } from "~/lib/crafting-engine";
import {
    bindExchangePrice,
    liveExchangePrices,
    markExchangePriceUnavailable,
} from "~/lib/crafting-exchange";
import { createCraftingItemQuery } from "~/lib/crafting-item-query";
import {
    bindCohortPurchasePrice,
    craftingMarketItemIssue,
    livePurchasePrices,
} from "~/lib/crafting-market";
import { resolveRuleset } from "~/lib/crafting-rulesets";
import { purchaseSourceProfile } from "~/lib/crafting-source-preparation";
import {
    bindCraftingSourcePrice,
    craftingCommodityIdentity,
    invalidEmptyResonatorSourcePrices,
    liveSourcePrices,
    markCommodityExchangePrice,
    markVendorPriceUnavailable,
} from "~/lib/crafting-sources";
import { craftingVendorUpgrade } from "~/lib/crafting-vendor-upgrades";
import { craftingCatalogSchema } from "~/schemas/crafting";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import { findCraftingSourcePrices } from "~/services/crafting-sources.server";
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
    membership?: Set<string> | null,
) {
    let next = graph;
    const issues: string[] = [];
    const invalid = invalidEmptyResonatorSourcePrices(graph);
    if (invalid.length) {
        const prices = { ...graph.prices };
        for (const id of invalid) {
            delete prices[id];
            issues.push(
                `${id}: the saved resonator price has no verified empty provenance. Select a tagged source or enter a manual price.`,
            );
        }
        next = { ...graph, prices };
    }
    const adapter = createCraftingItemQuery(engine);
    for (const { node, alternative, reference } of livePurchasePrices(graph)) {
        const sourcePreparation = purchaseSourceProfile(alternative);
        if (!sameSourcePreparation(sourcePreparation, reference.sourcePreparation)) {
            issues.push(`${node.name}: the saved price requires a different source preparation.`);
            continue;
        }
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
                sourcePreparation,
                conversion: reference.conversion,
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
        const candidate = result.candidates.find(
            (entry) => entry.definition.id === reference.cohortId,
        );
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
            next = markExchangePriceUnavailable(next, binding.id);
            issues.push(
                `${binding.id}: the saved exchange price does not match this input, game, league or accounting currency.`,
            );
            continue;
        }
        const key = JSON.stringify([
            binding.reference.realm,
            binding.reference.window,
            binding.reference.conversion,
        ]);
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
            conversion: reference.conversion,
            at,
        });
        for (const { id } of bindings) {
            const quote = result.quotes[id];
            if (quote) next = bindExchangePrice(next, id, quote);
            else {
                next = markExchangePriceUnavailable(next, id);
                issues.push(
                    `${id}: ${result.missing[id] ?? "The exchange price is unavailable; enter a manual price."}`,
                );
            }
        }
    }
    const sourceBindings = liveSourcePrices(next);
    const hasCommodities = sourceBindings.some(
        ({ reference }) => reference.source === "stash-commodity",
    );
    const known =
        hasCommodities && graph.league
            ? membership === undefined
                ? await knownCraftingExchangeItems(db, graph.league, at)
                : membership
            : new Set<string>();
    const exchangePriority: string[] = [];
    const sources = new Map<string, ReturnType<typeof liveSourcePrices>>();
    for (const binding of sourceBindings) {
        const { reference, id } = binding;
        if (reference.source === "vendor-upgrade") {
            try {
                if (
                    JSON.stringify(craftingVendorUpgrade(engine, id, reference.path.inputId)) !==
                    JSON.stringify(reference.path)
                )
                    throw new Error("The saved vendor recipe path no longer matches this catalog.");
            } catch (error) {
                next = markVendorPriceUnavailable(next, id);
                issues.push(
                    `${id}: ${error instanceof Error ? error.message : "Invalid vendor recipe path."}`,
                );
                continue;
            }
        }
        const commodity =
            reference.source === "stash-commodity" ? craftingCommodityIdentity(engine, id) : null;
        if (
            reference.game !== graph.game ||
            reference.league !== graph.league ||
            reference.currency !== graph.currency ||
            reference.id !== id ||
            (reference.source === "stash-commodity" &&
                (reference.realm !== "pc" ||
                    commodity?.baseType !== reference.baseType ||
                    commodity?.variant !== reference.variant))
        ) {
            if (reference.source === "vendor-upgrade") next = markVendorPriceUnavailable(next, id);
            if (reference.source === "stash-commodity") next = markCommodityExchangePrice(next, id);
            issues.push(
                `${id}: the saved source price does not match this input, game, league or currency.`,
            );
            continue;
        }
        if (reference.source === "stash-commodity" && (!known || known.has(id))) {
            if (known) exchangePriority.push(id);
            else {
                next = markCommodityExchangePrice(next, id);
                issues.push(`${id}: exchange market membership exceeds the safe lookup limit.`);
            }
            continue;
        }
        const key = JSON.stringify([
            reference.source,
            reference.source === "poe.ninja" ? reference.assumption : undefined,
            reference.source === "stash-commodity" ? reference.conversion : undefined,
            reference.source === "vendor-upgrade"
                ? [reference.path, reference.conversion]
                : undefined,
        ]);
        sources.set(key, [...(sources.get(key) ?? []), binding]);
    }
    for (let offset = 0; offset < exchangePriority.length; offset += 500) {
        const ids = exchangePriority.slice(offset, offset + 500);
        const result = await findCraftingExchangePrices(db, {
            game: graph.game,
            realm: "pc",
            league: graph.league!,
            currency: graph.currency,
            itemIds: ids,
            conversion: "two-leg-exchange-v1",
            at,
        });
        for (const id of ids) {
            const quote = result.quotes[id];
            if (quote)
                next = markCommodityExchangePrice(next, id, bindExchangePrice(next, id, quote));
            else {
                next = markCommodityExchangePrice(next, id);
                issues.push(`${id}: ${result.missing[id] ?? "The exchange price is unavailable."}`);
            }
        }
    }
    for (const bindings of sources.values()) {
        const reference = bindings[0]!.reference;
        const result = await findCraftingSourcePrices(
            graph,
            engine,
            {
                realm: "pc",
                ids: bindings.map(({ id }) => id),
                assumption: reference.source === "poe.ninja" ? reference.assumption : undefined,
                conversion:
                    reference.source === "stash-commodity" ? reference.conversion : undefined,
                vendorUpgrade:
                    reference.source === "vendor-upgrade"
                        ? {
                              inputId: reference.path.inputId,
                              conversion: reference.conversion,
                          }
                        : undefined,
                at,
            },
            db,
            known,
        );
        for (const { id } of bindings) {
            const quote = result.quotes[id];
            if (quote) {
                // A price saved from poe.ninja is rebound to the captured listings that replace it.
                const updated = bindCraftingSourcePrice(next, engine, id, quote);
                if (JSON.stringify(updated.prices[id]) !== JSON.stringify(next.prices[id]))
                    next = updated;
            } else {
                if (reference.source === "vendor-upgrade")
                    next = markVendorPriceUnavailable(next, id);
                issues.push(`${id}: ${result.missing[id] ?? "The source price is unavailable."}`);
            }
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
        ...liveSourcePrices(graph).map(({ id }) => id),
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
    const orderedHours = [...new Set(hours)].sort((a, b) => a - b);
    const hasCommodities = liveSourcePrices(graph).some(
        ({ reference }) => reference.source === "stash-commodity",
    );
    const membership =
        hasCommodities && graph.league && orderedHours.length && !unbound.length
            ? await loadCraftingExchangeMembership(db, graph.league, orderedHours.at(-1))
            : undefined;
    for (const at of orderedHours) {
        if (unbound.length) {
            points.push({ at, graph: null, issues: unbound });
            continue;
        }
        const refreshed = await refreshCraftingMarketPrices(
            db,
            graph,
            engine,
            at,
            membership === undefined ? undefined : exchangeMembershipAt(membership, at),
        );
        points.push({
            at,
            graph: refreshed.issues.length ? null : refreshed.graph,
            issues: refreshed.issues,
        });
    }
    return { points };
}
