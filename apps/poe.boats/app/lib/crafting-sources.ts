// biome-ignore-all lint/style/useNamingConvention: Bestiary keys are canonical game-data identifiers.
import { exchangeCurrencyId } from "@poe-tools/market";
import { emptyResonator } from "~/lib/crafting-empty-resonator";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { unavailableExchangePrices } from "~/lib/crafting-exchange";
import { craftingNodeCostKey } from "~/lib/crafting-node-prices";
import { craftingVendorUpgrade, validVendorIngredientQuote } from "~/lib/crafting-vendor-upgrades";
import { yellowBeastId, yellowBeastPolicy, yellowBeastPool } from "~/lib/crafting-yellow-beasts";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import {
    type CommoditySourceIdentity,
    type CraftingSourceOptions,
    type CraftingSourceQuote,
    type CraftingSourceReference,
    commoditySourceQuoteSchema,
    commoditySourceReferenceSchema,
    craftingSourceReferenceSchema,
    vendorUpgradeQuoteSchema,
    vendorUpgradeReferenceSchema,
} from "~/schemas/crafting-sources";

const beasts: Record<string, string> = {
    LegendaryBeastGemFrog: "craicic-croaker",
    LegendaryBeastLynx: "farric-lynx-alpha",
    LegendaryBeastWolf: "farric-wolf-alpha",
    LegendaryBeastSandSpitter: "craicic-sand-spitter",
    LegendaryBeastShieldCrab: "craicic-shield-crab",
    LegendaryBeastCrab: "craicic-savage-crab",
    LegendaryBeastForestSnake: "saqawine-cobra",
    LegendaryBeastDevourer: "fenumal-devourer",
    LegendaryBeastSandSnake: "saqawine-blood-viper",
    LegendaryBeastCarrionQueen: "fenumal-queen",
    LegendaryBeastSquid: "craicic-watcher",
    LegendaryBeastSpiker: "farric-goliath",
    LegendaryBeastSandLeaper: "fenumal-scrabbler",
    LegendaryBeastFrog: "craicic-maw",
    LegendaryBeastPlagueSpider: "fenumal-plagued-arachnid",
    LegendaryBeastSirenSpawn: "craicic-squid",
    LegendaryBeastHellionIce: "farric-frost-hellion-alpha",
    LegendaryBeastParasiticSquid: "craicic-vassal",
    LegendaryBeastScorpion: "fenumal-scorpion",
    MemoryLineLegendaryBeastHarvestBeastT3: "wild-bristle-matron",
    SpiritBossTiger: "farrul-first-of-the-plains",
    SpiritBossAvian: "saqawal-first-of-the-sky",
    SpiritBossSpider: "fenumus-first-of-the-night",
    SpiritBossCrab: "craiceann-first-of-the-deep",
    Morrigan: "black-morrigan",
};

export function craftingSourceRecipe(
    engine: CraftingEngine,
    id: string,
    assumption?: CraftingSourceOptions["assumption"],
) {
    if (engine.catalog.game !== "poe1")
        throw new Error("Beast and temple price sources support PoE 1 PC only.");
    if (id === engine.catalog.crafting.locus?.id)
        return {
            category: "IncursionTemple" as const,
            components: [{ detailsId: "locus-of-corruption-tier-3-temple", quantity: 1 }],
        };
    if (id === "service:recombine")
        throw new Error(
            "Recombination consumes non-tradeable gold and dust. Enter your own service or opportunity-cost assumption.",
        );
    const recipe = engine.catalog.crafting.beasts.find(
        (entry) => entry.id === id && entry.gameMode !== 2,
    );
    if (!recipe || !engine.beastOperation(id))
        throw new Error(
            "No supported beast or temple source for this input. Use equipment cohorts, exchange prices, or a manual price.",
        );
    if (engine.beastRequiresLevel(id) || recipe.components.some((entry) => entry.level > 0))
        throw new Error(
            "This recipe needs a beast level that poe.ninja does not distinguish. Enter a price for beasts matching the selected level.",
        );
    if (assumption)
        throw new Error(
            "This saved species-specific beast estimate is retired. Look up the generic Yellow Beast pool and rebind the recipe.",
        );
    const components = recipe.components.map((entry) => {
        const detailsId = beasts[entry.id];
        if (!detailsId)
            throw new Error(
                `No verified price-source identity for beast component ${entry.id}. Enter a whole-recipe price.`,
            );
        return { detailsId, quantity: 1 };
    });
    if (!components.length || components.length > 4)
        throw new Error("Unsupported beast recipe component count.");
    if (components.length < 4)
        components.push({ detailsId: yellowBeastId, quantity: 4 - components.length });
    return { category: "Beast" as const, components };
}

// Empty commodity signatures do not identify stored item, monster or experience payloads.
const commodityCurrencyActions = new Set([
    "identify",
    "transmute_to_magic",
    "reroll_magic",
    "add_mod_to_magic",
    "transmute_to_rare",
    "upgrade_magic_to_rare",
    "reroll",
    "add_mod_to_rare",
    "remove_random_mod",
    "convert_to_normal",
    "reroll_mod_values",
    "add_influence_mod_to_rare",
    "upgrade_influence_mod",
    "transfer_item_influence",
    "replace_rare_mod_veiled",
    "consume_zana_influence_upgrade_mods",
    "apply_zana_influence",
]);

export function craftingCommodityIdentity(
    engine: CraftingEngine,
    id: string,
): CommoditySourceIdentity | null {
    if (engine.catalog.game !== "poe1") return null;
    const currency = engine.catalog.crafting.currencies.find((entry) => entry.id === id);
    if (!currency) return null;
    if (emptyResonator.ids.some((candidate) => candidate === id)) {
        const family = engine.catalog.crafting.currencies.filter(
            (entry) =>
                emptyResonator.ids.some((candidate) => candidate === entry.id) ||
                entry.name === emptyResonator.baseType,
        );
        if (
            family.length !== emptyResonator.ids.length ||
            !emptyResonator.ids.every(
                (candidate) => family.filter((entry) => entry.id === candidate).length === 1,
            ) ||
            family.some(
                (entry) =>
                    entry.name !== emptyResonator.baseType ||
                    entry.action !== emptyResonator.action ||
                    Number(entry.id.at(-1)) !== 4 ||
                    entry.description !== currency.description ||
                    entry.directions !== currency.directions,
            )
        )
            return null;
        return { id, baseType: emptyResonator.baseType, variant: emptyResonator.variant };
    }
    const essence = engine.catalog.crafting.essences.some((entry) => entry.id === id);
    const fossils = engine.catalog.crafting.fossils.filter(
        (entry) => entry.id === id || entry.name === currency.name,
    );
    const fossil =
        fossils.length === 1 && fossils[0]?.id === id && fossils[0].name === currency.name;
    if (fossils.length && !fossil) return null;
    if (!essence && !fossil && !commodityCurrencyActions.has(currency.action)) return null;
    const currencies = engine.catalog.crafting.currencies.filter(
        (entry) => entry.id === id || entry.name === currency.name,
    );
    return currencies.length === 1 ? { id, baseType: currency.name } : null;
}

const prefixes = {
    "poe.ninja": "poeninja:v1:",
    "stash-commodity": "stash-commodity:v1:",
    "vendor-upgrade": "vendor-upgrade:v1:",
};
const unavailableVendorPrefix = "vendor-upgrade:unavailable:v1:";
export function decodeCraftingSourceReference(value?: string): CraftingSourceReference | null {
    if (value?.startsWith(unavailableVendorPrefix))
        value = value.slice(unavailableVendorPrefix.length);
    const prefix = Object.values(prefixes).find((prefix) => value?.startsWith(prefix));
    if (!prefix) return null;
    try {
        const reference = craftingSourceReferenceSchema.parse(
            JSON.parse(decodeURIComponent(value!.slice(prefix.length))),
        );
        return prefixes[reference.source] === prefix ? reference : null;
    } catch {
        return null;
    }
}
export function markVendorPriceUnavailable(graph: CraftingGraph, id: string): CraftingGraph {
    const price = graph.prices[id];
    if (
        price?.source !== "market" ||
        !price.cohortId ||
        price.cohortId.startsWith(unavailableVendorPrefix) ||
        decodeCraftingSourceReference(price.cohortId)?.source !== "vendor-upgrade"
    )
        return graph;
    return {
        ...graph,
        prices: {
            ...graph.prices,
            [id]: { ...price, cohortId: `${unavailableVendorPrefix}${price.cohortId}` },
        },
    };
}
export function liveSourcePrices(graph: CraftingGraph) {
    return Object.entries(graph.prices).flatMap(([id, price]) => {
        const reference =
            price.source === "market" ? decodeCraftingSourceReference(price.cohortId) : null;
        return reference ? [{ id, reference }] : [];
    });
}
export function invalidEmptyResonatorSourcePrices(graph: CraftingGraph) {
    return Object.entries(graph.prices).flatMap(([key, price]) => {
        if (price.source !== "market" || !price.cohortId?.startsWith(prefixes["stash-commodity"]))
            return [];
        const resonator = emptyResonator.ids.find(
            (id) =>
                key === id || graph.nodes.some((node) => key === craftingNodeCostKey(node.id, id)),
        );
        if (!resonator) return [];
        const reference = decodeCraftingSourceReference(price.cohortId);
        return reference?.source === "stash-commodity" &&
            reference.id === resonator &&
            reference.baseType === emptyResonator.baseType &&
            reference.variant === emptyResonator.variant &&
            reference.game === graph.game &&
            reference.realm === "pc" &&
            reference.league === graph.league &&
            reference.currency === graph.currency
            ? []
            : [key];
    });
}
export function assertCraftingSourcePrices(graph: CraftingGraph) {
    const unavailable = unavailableExchangePrices(graph);
    if (unavailable.length)
        throw new Error(
            `${unavailable.join(", ")}: the exchange price is unavailable. Refresh it or enter a manual price before calculating.`,
        );
    const unavailableVendor = Object.entries(graph.prices).flatMap(([id, price]) =>
        price.source === "market" && price.cohortId?.startsWith(unavailableVendorPrefix)
            ? [id]
            : [],
    );
    if (unavailableVendor.length)
        throw new Error(
            `${unavailableVendor.join(", ")}: the vendor ingredient exchange price is unavailable. Refresh it or enter a manual price before calculating.`,
        );
    const invalid = invalidEmptyResonatorSourcePrices(graph);
    if (invalid.length)
        throw new Error(
            `${invalid.join(", ")}: the saved resonator price has no verified empty provenance. Select a tagged source or enter a manual price.`,
        );
}
export function bindCraftingSourcePrice(
    graph: CraftingGraph,
    engine: CraftingEngine,
    id: string,
    quote: CraftingSourceQuote,
): CraftingGraph {
    if (
        graph.game !== quote.game ||
        graph.league !== quote.league ||
        graph.currency !== quote.currency ||
        id !== quote.id
    )
        throw new Error(
            "The source quote does not match this input, game, league or accounting currency.",
        );
    if (quote.source === "vendor-upgrade") {
        const parsed = vendorUpgradeQuoteSchema.parse(quote);
        const path = craftingVendorUpgrade(engine, id, parsed.path.inputId);
        const ingredient = parsed.ingredient;
        if (JSON.stringify(path) !== JSON.stringify(parsed.path))
            throw new Error(
                "The vendor quote must preserve the exact verified recipe path and quantities.",
            );
        if (
            ingredient.itemId !== path.inputId ||
            ingredient.quoteId !== exchangeCurrencyId(parsed.currency) ||
            ingredient.realm !== parsed.realm ||
            ingredient.league !== parsed.league ||
            ingredient.conversion !== parsed.conversion ||
            !validVendorIngredientQuote(ingredient) ||
            ingredient.hour === null ||
            ingredient.hour > Math.floor(Date.now() / 3_600_000) * 3600 - 3600
        )
            throw new Error(
                "The vendor ingredient needs a positive matching-scope exchange quote from a completed hour.",
            );
        if (
            Math.abs(parsed.amount - path.quantity * ingredient.amount) >
            Math.max(1, parsed.amount) * 1e-10
        )
            throw new Error(
                "The vendor estimate must equal the verified ingredient quantity times its unit quote.",
            );
        const { amount: _, ...details } = parsed;
        const reference = vendorUpgradeReferenceSchema.parse(details);
        return {
            ...graph,
            prices: {
                ...graph.prices,
                [id]: {
                    amount: parsed.amount,
                    currency: parsed.currency,
                    source: "market",
                    confidence: null,
                    observedAt: new Date(ingredient.hour * 1000).toISOString(),
                    cohortId: `${prefixes[reference.source]}${encodeURIComponent(JSON.stringify(reference))}`,
                },
            },
        };
    }
    if (quote.source === "stash-commodity") {
        const parsed = commoditySourceQuoteSchema.parse(quote);
        if (parsed.hour > Math.floor(Date.now() / 3_600_000) * 3600 - 3600)
            throw new Error("A captured asking-price quote must describe a completed hour.");
        const identity = craftingCommodityIdentity(engine, id);
        if (
            !identity ||
            identity.baseType !== parsed.baseType ||
            identity.variant !== parsed.variant
        )
            throw new Error("The commodity quote does not identify this catalog currency.");
        const reference = commoditySourceReferenceSchema.parse({
            source: parsed.source,
            game: parsed.game,
            realm: parsed.realm,
            league: parsed.league,
            currency: parsed.currency,
            ...identity,
            conversion: parsed.conversion,
            exchange: parsed.exchange,
        });
        return {
            ...graph,
            prices: {
                ...graph.prices,
                [id]: {
                    amount: parsed.amount,
                    currency: parsed.currency,
                    source: "market",
                    confidence: null,
                    samples: parsed.samples,
                    observedAt: new Date(parsed.hour * 1000).toISOString(),
                    cohortId: `${prefixes[reference.source]}${encodeURIComponent(JSON.stringify(reference))}`,
                },
            },
        };
    }
    const recipe = craftingSourceRecipe(engine, id, quote.assumption);
    if (quote.yellowBeasts !== (recipe.category === "Beast" ? yellowBeastPolicy : undefined))
        throw new Error("The beast quote must identify the generic Yellow Beast pricing policy.");
    for (const component of quote.components) {
        if (component.detailsId === yellowBeastId) {
            if (
                component.name !== "Yellow Beast" ||
                component.pool?.estimator !== yellowBeastPolicy
            )
                throw new Error("The Yellow Beast component needs its generic pool provenance.");
            const pooled = yellowBeastPool(component.pool.species);
            if (
                pooled.listingCount !== component.listingCount ||
                Math.abs(pooled.unitPrice - component.unitPrice) > 1e-8
            )
                throw new Error(
                    "The Yellow Beast price must equal its listing-count-weighted species estimates.",
                );
        } else if (component.pool) {
            throw new Error(
                "Only the generic Yellow Beast component can contain pooled estimates.",
            );
        }
    }
    const components = quote.components.map(({ detailsId, quantity }) => ({ detailsId, quantity }));
    const amount = quote.components.reduce(
        (sum, entry) => sum + entry.quantity * entry.unitPrice,
        0,
    );
    if (
        JSON.stringify(components) !== JSON.stringify(recipe.components) ||
        Math.abs(amount - quote.amount) > 1e-8
    )
        throw new Error("The quote must include every component of the selected recipe.");
    const reference = craftingSourceReferenceSchema.parse({
        source: quote.source,
        game: quote.game,
        realm: quote.realm,
        league: quote.league,
        currency: quote.currency,
        id,
        assumption: quote.assumption,
        yellowBeasts: quote.yellowBeasts,
    });
    return {
        ...graph,
        prices: {
            ...graph.prices,
            [id]: {
                amount: quote.amount,
                currency: quote.currency,
                source: "market",
                confidence: null,
                observedAt: quote.fetchedAt,
                cohortId: `${prefixes[reference.source]}${encodeURIComponent(JSON.stringify(reference))}`,
            },
        },
    };
}
