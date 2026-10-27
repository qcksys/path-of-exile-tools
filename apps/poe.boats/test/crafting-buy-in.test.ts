import type { TradeListing } from "@poe-tools/trade-bridge";
import { describe, expect, it } from "vite-plus/test";
import {
    BUY_IN_FRESH_MS,
    BUY_IN_STALE_MS,
    buyInEntry,
    buyInFreshness,
    buyInGraph,
    buyInStages,
    buyInTradeSearches,
    calculateBuyIn,
    recordBuyInStage,
    setBuyInIncludeInPerson,
} from "../app/lib/crafting-buy-in";
import {
    type CheckedSearch,
    checkTradeListing,
    priceBuyInStage,
    priceStageListings,
    stageDecision,
    tradeItemText,
} from "../app/lib/crafting-buy-in-price";
import { seededRandom } from "../app/lib/crafting-engine";
import { runtimeGraph } from "../app/lib/crafting-ruleset-loader";
import { resolveRuleset } from "../app/lib/crafting-rulesets";
import { loadCraftingTradeMetadata } from "../app/lib/crafting-trade";
import type { CheckedListing } from "../app/schemas/crafting-buy-in";
import { craftingGraphSchema } from "../app/schemas/crafting-graph";
import { catalog, engine } from "./crafting-fixtures";
import {
    firstItem,
    firstMod,
    graphFixture,
    queryMods,
    secondItem,
    secondMod,
} from "./crafting-graph-fixtures";
import { historyIndex, retainedRevision } from "./crafting-history-fixtures";

const base = "Plate Vest";
const lifeItem = {
    rarity: "Rare",
    name: "Doom Bane",
    typeLine: base,
    baseType: base,
    ilvl: 86,
    identified: true,
    explicitMods: ["+7 to maximum Life"],
    extended: {
        mods: { explicit: [{ name: "Hale", tier: "P9", level: 1 }] },
        hashes: { explicit: [["explicit.stat_3299347043", [0]]] },
    },
};
const armourItem = {
    ...lifeItem,
    explicitMods: ["23% increased Armour"],
    extended: {
        mods: { explicit: [{ name: "Reinforced", tier: "P6", level: 3 }] },
        hashes: { explicit: [["explicit.stat_1062208444", [0]]] },
    },
};
let listingId = 0;
const listing = (
    item: Record<string, unknown>,
    amount = 5,
    currency = "chaos",
    sale: TradeListing["sale"] = "instant",
): TradeListing => ({
    id: `listing-${listingId++}`,
    indexed: "2026-10-27T10:00:00Z",
    price: { amount, currency },
    sale,
    item,
});
const checked = (amount: number | null, status: CheckedListing["status"] = "match") => ({
    listing: listing(lifeItem, amount ?? 1),
    status,
    amount,
    item: status === "match" ? firstItem : null,
});
const search = (
    checks: CheckedListing[],
    sale: CheckedSearch["sale"] = "instant",
    extra: Partial<CheckedSearch> = {},
): CheckedSearch => ({
    sale,
    results: checks.length,
    available: checks.length,
    fetches: 1,
    checks,
    ...extra,
});
const bothItem = engine.addStartingMod(firstItem, secondMod, seededRandom(3));

describe("trade listing checks", () => {
    it("writes trade items as advanced item text", () => {
        expect(
            tradeItemText({ ...lifeItem, influences: { shaper: true }, corrupted: true }),
        ).toBe(`Rarity: Rare
Doom Bane
${base}
--------
Item Level: 86
--------
{ Prefix Modifier "Hale" (Tier: 9) }
+7 to maximum Life
--------
Shaper Item
Corrupted`);
    });

    it("matches a listing against the stage query with the graph catalog", () => {
        const result = checkTradeListing(engine, queryMods(firstMod), listing(lifeItem), {
            chaos: 1,
        });
        expect(result.status).toBe("match");
        expect(result.amount).toBe(5);
        expect(result.item?.mods.map((mod) => mod.id)).toEqual([firstMod]);
        expect(result.item?.level).toBe(86);
    });

    it("matches listings without modifier details by their text", () => {
        const { extended: _, ...plain } = lifeItem;
        expect(
            checkTradeListing(engine, queryMods(firstMod), listing(plain), { chaos: 1 }).status,
        ).toBe("match");
    });

    it("separates non-matching, unreadable and unconverted listings", () => {
        const query = queryMods(firstMod);
        expect(checkTradeListing(engine, query, listing(armourItem), { chaos: 1 }).status).toBe(
            "no-match",
        );
        expect(
            checkTradeListing(engine, query, listing({ ...lifeItem, rarity: "Unique" }), {}).status,
        ).toBe("unreadable");
        expect(
            checkTradeListing(
                engine,
                query,
                listing({ ...lifeItem, baseType: "Not A Base", typeLine: "Not A Base" }),
                {},
            ).status,
        ).toBe("unreadable");
        const divine = checkTradeListing(engine, query, listing(lifeItem, 2, "divine"), {
            chaos: 1,
            divine: 150,
        });
        expect(divine.amount).toBe(300);
        expect(checkTradeListing(engine, query, listing(lifeItem, 2, "mirror"), {}).amount).toBe(
            null,
        );
    });
});

describe("stage price rule", () => {
    it("prices a stage at the cheapest matching instant-buyout listing with high confidence", () => {
        const result = priceStageListings(
            search(
                [checked(12), checked(9), checked(10.5), checked(30), checked(1, "no-match")],
                "instant",
                {
                    results: 40,
                },
            ),
            null,
            "chaos",
        );
        expect(result).toMatchObject({
            status: "priced",
            price: { amount: 9, currency: "chaos" },
            sale: "instant",
            confidence: "high",
            counts: {
                results: 40,
                fetched: 5,
                matching: 4,
                nearPrice: 2,
                notMatching: 1,
                bait: 0,
            },
        });
    });

    it("treats a single instant-buyout listing as high confidence", () => {
        expect(priceStageListings(search([checked(50)]), null, "chaos").confidence).toBe("high");
    });

    it("leaves the price unknown without matching listings", () => {
        const result = priceStageListings(
            search([checked(1, "no-match"), checked(null), checked(1, "unreadable")]),
            null,
            "chaos",
        );
        expect(result).toMatchObject({
            status: "no-listings",
            price: null,
            confidence: null,
            item: null,
            counts: { matching: 0, notMatching: 1, unreadable: 1, unconverted: 1 },
        });
    });

    it("drops in-person bait under half the median of the five cheapest", () => {
        const result = priceStageListings(
            search([]),
            search([checked(14), checked(2), checked(11), checked(9), checked(10)], "in-person"),
            "chaos",
        );
        expect(result).toMatchObject({
            status: "priced",
            price: { amount: 9 },
            sale: "in-person",
            confidence: "medium",
            counts: { matching: 5, bait: 1, nearPrice: 2 },
        });
        expect(
            priceStageListings(search([]), search([checked(9), checked(10)], "in-person"), "chaos")
                .confidence,
        ).toBe("low");
    });

    it("never uses in-person listings when an instant-buyout listing matched", () => {
        const result = priceStageListings(
            search([checked(20)]),
            search([checked(5)], "in-person"),
            "chaos",
        );
        expect(result).toMatchObject({ sale: "instant", price: { amount: 20 } });
    });

    it("decides whether to fetch more, search in person or stop", () => {
        expect(stageDecision(search([checked(5)]), true)).toBe("done");
        expect(
            stageDecision(search([checked(1, "no-match")], "instant", { available: 40 }), false),
        ).toBe("more");
        expect(
            stageDecision(
                search([checked(1, "no-match")], "instant", { available: 40, fetches: 2 }),
                true,
            ),
        ).toBe("in-person");
        expect(stageDecision(search([checked(1, "no-match")]), false)).toBe("done");
        expect(stageDecision(search([checked(5)], "in-person", { available: 30 }), true)).toBe(
            "more",
        );
        expect(
            stageDecision(
                search([checked(5), checked(6), checked(7), checked(8), checked(9)], "in-person", {
                    available: 30,
                }),
                true,
            ),
        ).toBe("done");
    });
});

describe("buy-in stages", () => {
    const priced = (graph = graphFixture(), amount = 1) =>
        recordBuyInStage(
            graph,
            "combine",
            {
                status: "priced",
                price: { amount, currency: "chaos" },
                sale: "instant",
                confidence: "high",
                counts: {
                    results: 3,
                    fetched: 3,
                    matching: 3,
                    nearPrice: 1,
                    notMatching: 0,
                    unreadable: 0,
                    unconverted: 0,
                    bait: 0,
                },
                item: bothItem,
            },
            "2026-10-27T10:00:00.000Z",
        );

    it("lists visited craft steps and keeps prices only for their current query", () => {
        const graph = priced();
        expect(buyInStages(graph).map((node) => node.id)).toEqual(["combine"]);
        const node = buyInStages(graph)[0]!;
        expect(buyInEntry(graph, node)?.price?.amount).toBe(1);
        expect(buyInEntry({ ...graph, league: "Another league" }, node)).toBeNull();
        expect(buyInEntry({ ...graph, currency: "divine" }, node)).toBeNull();
        const edited = {
            ...graph,
            nodes: graph.nodes.map((entry) =>
                entry.id === "combine" ? { ...entry, output: queryMods(firstMod) } : entry,
            ),
        };
        expect(buyInEntry(edited, buyInStages(edited)[0]!)).toBeNull();
    });

    it("ignores in-person prices unless the project includes them", () => {
        const graph = recordBuyInStage(
            graphFixture(),
            "combine",
            { ...priced().buyIn!.stages.combine!, sale: "in-person", confidence: "low" },
            "2026-10-27T10:00:00.000Z",
        );
        const node = buyInStages(graph)[0]!;
        expect(buyInEntry(graph, node)).toBeNull();
        expect(buyInEntry(setBuyInIncludeInPerson(graph, true), node)).not.toBeNull();
    });

    it("refuses prices in another currency", () => {
        expect(() =>
            recordBuyInStage(
                graphFixture(),
                "combine",
                { ...priced().buyIn!.stages.combine!, price: { amount: 1, currency: "divine" } },
                "2026-10-27T10:00:00.000Z",
            ),
        ).toThrow("project's currency");
    });

    it("ages saved prices at 6 and 24 hours", () => {
        const observedAt = "2026-10-27T00:00:00.000Z";
        const start = Date.parse(observedAt);
        expect(buyInFreshness({ observedAt }, start + BUY_IN_FRESH_MS - 1)).toBe("fresh");
        expect(buyInFreshness({ observedAt }, start + BUY_IN_FRESH_MS)).toBe("aging");
        expect(buyInFreshness({ observedAt }, start + BUY_IN_STALE_MS)).toBe("stale");
    });

    it("builds instant-buyout searches, and in-person searches only when enabled", async () => {
        const metadata = await loadCraftingTradeMetadata("poe1");
        const graph = { ...graphFixture(), league: "Standard" };
        const [stage] = buyInTradeSearches(graph, catalog, metadata);
        expect(stage?.instant?.payload.query.status).toEqual({ option: "securable" });
        expect(stage?.instant?.payload.query.filters.trade_filters).toEqual({
            filters: { collapse: { option: "true" } },
        });
        expect(stage?.inPerson).toBeNull();
        const [withInPerson] = buyInTradeSearches(
            setBuyInIncludeInPerson(graph, true),
            catalog,
            metadata,
        );
        expect(withInPerson?.inPerson?.payload.query.status).toEqual({ option: "online" });
        expect(withInPerson?.inPerson?.payload.query.filters.trade_filters).toEqual({
            filters: { indexed: { option: "1week" }, collapse: { option: "true" } },
        });
        expect(buyInTradeSearches(graphFixture(), catalog, metadata)[0]?.error).toContain("league");
    });

    it("replaces a stage with a pinned purchase of the cheapest listing's item", () => {
        const graph = buyInGraph(priced(), "combine", priced().buyIn!.stages.combine!);
        expect(graph.buyIn).toBeUndefined();
        expect(graph.entry).toBe("buy-in-combine");
        const purchase = graph.nodes.find((node) => node.id === "buy-in-combine");
        expect(purchase).toMatchObject({
            kind: "acquire",
            choice: { mode: "pinned", alternativeId: "trade" },
            alternatives: [
                { kind: "purchase", item: bothItem, price: { amount: 1, currency: "chaos" } },
                { kind: "production", nodeId: "combine" },
            ],
        });
        expect(craftingGraphSchema.safeParse(graph).success).toBe(true);
    });

    it("strips trade prices before graphs reach retained engines", () => {
        const graph = priced();
        expect(runtimeGraph(graph)).not.toHaveProperty("buyIn");
        expect(runtimeGraph(graphFixture())).toEqual(graphFixture());
    });

    it("recommends buying in when the stage costs less than crafting to the end", async () => {
        const ruleset = resolveRuleset(historyIndex, "poe1", graphFixture().ruleset);
        const { runtime, catalog: retained } = await retainedRevision(ruleset);
        const options = {
            simulation: { estimateIterations: 2, workLimit: 5000 },
            now: Date.parse("2026-10-27T20:00:00Z"),
        };
        const cheap = await calculateBuyIn(runtime, retained, priced(graphFixture(), 1), options);
        expect(cheap?.stages[0]).toMatchObject({
            stageId: "combine",
            status: "priced",
            total: 1,
            probability: 1,
            freshness: "aging",
        });
        expect(cheap?.scratch.total).toBeGreaterThan(1);
        expect(cheap?.recommendation).toEqual({ stageId: "combine", total: 1 });
        expect(cheap?.stalePrices).toBe(false);
        const dear = await calculateBuyIn(
            runtime,
            retained,
            priced(graphFixture(), 1_000_000),
            options,
        );
        expect(dear?.recommendation?.stageId).toBeNull();
    });

    it("prices a stage from listings and records it with the stage key", () => {
        const graph = { ...graphFixture(), league: "Standard" };
        const both = {
            ...lifeItem,
            explicitMods: ["+7 to maximum Life", "23% increased Armour"],
            extended: {
                mods: {
                    explicit: [
                        { name: "Hale", tier: "P9", level: 1 },
                        { name: "Reinforced", tier: "P6", level: 3 },
                    ],
                },
                hashes: {
                    explicit: [
                        ["explicit.stat_3299347043", [0]],
                        ["explicit.stat_1062208444", [1]],
                    ],
                },
            },
        };
        const result = priceBuyInStage(
            engine,
            graph,
            "combine",
            {
                sale: "instant",
                results: 3,
                available: 3,
                fetches: 1,
                listings: [listing(both, 4), listing(lifeItem, 1), listing(both, 1, "divine")],
            },
            null,
            { chaos: 1, divine: 150 },
        );
        expect(result.instant.checks.map((check) => check.status)).toEqual([
            "match",
            "no-match",
            "match",
        ]);
        expect(result.inPerson).toBeNull();
        expect(result.stage).toMatchObject({
            status: "priced",
            price: { amount: 4, currency: "chaos" },
            counts: { matching: 2, notMatching: 1 },
        });
        expect(result.stage.item?.mods.map((mod) => mod.id).sort()).toEqual(
            [firstMod, secondMod].sort(),
        );
        expect(secondItem.mods[0]?.id).toBe(secondMod);
    });
});
