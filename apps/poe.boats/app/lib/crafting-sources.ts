// biome-ignore-all lint/style/useNamingConvention: Bestiary keys are canonical game-data identifiers.
import { exchangeCurrencyId } from "@poe-tools/market";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { craftingVendorUpgrade, validVendorIngredientQuote } from "~/lib/crafting-vendor-upgrades";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import {
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
    if (!assumption)
        throw new Error(
            "Choose the Mountain Lynx estimate for the remaining rare beasts before pricing the whole recipe.",
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
        components.push({ detailsId: "mountain-lynx", quantity: 4 - components.length });
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

export function craftingCommodityIdentity(engine: CraftingEngine, id: string) {
    if (engine.catalog.game !== "poe1") return null;
    const currency = engine.catalog.crafting.currencies.find((entry) => entry.id === id);
    if (!currency) return null;
    const essence = engine.catalog.crafting.essences.some((entry) => entry.id === id);
    if (!essence && !commodityCurrencyActions.has(currency.action)) return null;
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
export function decodeCraftingSourceReference(value?: string): CraftingSourceReference | null {
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
export function liveSourcePrices(graph: CraftingGraph) {
    return Object.entries(graph.prices).flatMap(([id, price]) => {
        const reference =
            price.source === "market" ? decodeCraftingSourceReference(price.cohortId) : null;
        return reference ? [{ id, reference }] : [];
    });
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
        if (!identity || identity.baseType !== parsed.baseType)
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
