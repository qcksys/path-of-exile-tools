// biome-ignore-all lint/style/useNamingConvention: Bestiary keys are canonical game-data identifiers.
import type { CraftingEngine } from "~/lib/crafting-engine";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import {
    type CraftingSourceQuote,
    type CraftingSourceReference,
    craftingSourceReferenceSchema,
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
    assumption?: CraftingSourceReference["assumption"],
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

const prefix = "poeninja:v1:";
export function decodeCraftingSourceReference(value?: string): CraftingSourceReference | null {
    if (!value?.startsWith(prefix)) return null;
    try {
        return craftingSourceReferenceSchema.parse(
            JSON.parse(decodeURIComponent(value.slice(prefix.length))),
        );
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
                cohortId: `${prefix}${encodeURIComponent(JSON.stringify(reference))}`,
            },
        },
    };
}
