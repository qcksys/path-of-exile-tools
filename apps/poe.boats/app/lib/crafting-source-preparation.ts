import {
    type ItemQuery,
    type SourcePreparationProfile,
    sourcePreparationProfileSchema,
} from "@poe-tools/item-query";
import type { CraftingItem, CraftingMethod } from "../schemas/crafting";
import type {
    CraftingGraph,
    GraphAcquireNode,
    GraphPurchase,
    SourcePreparation,
} from "../schemas/crafting-graph";
import { usesAllflame } from "./crafting-allflame";
import type { CraftingCost, CraftingEngine, CraftingRandom } from "./crafting-engine";
import { createCraftingItemQuery } from "./crafting-item-query";
import { craftingNodeCostPrice } from "./crafting-node-prices";

const additionalScouringBases = new Set([
    "Metadata/Items/Armours/Boots/BootsAtlas1",
    "Metadata/Items/Armours/BodyArmours/BodyDex16",
    "Metadata/Items/Armours/BodyArmours/BodyInt17",
]);
const influenceReadyBases = new Set([
    "Metadata/Items/Armours/Shields/ShieldStr17",
    "Metadata/Items/Armours/Shields/ShieldInt16",
    "Metadata/Items/Armours/Shields/ShieldStrE3",
]);

export function purchaseSourceProfile(alternative: GraphPurchase) {
    if (!alternative.sourcePreparation) return undefined;
    if (alternative.sourcePreparation.kind !== "fractured-fossil-v1")
        return sourcePreparationProfileSchema.parse(alternative.sourcePreparation);
    const { fossils: _fossils, ...profile } = alternative.sourcePreparation;
    return sourcePreparationProfileSchema.parse(profile);
}

export function validateSourcePreparationRevision(
    engine: string,
    source: SourcePreparationProfile | undefined,
    baseId: string,
) {
    if (!source) return;
    if (source.kind === "influence-ready-v1") {
        if (
            !["crafting-graph-15", "crafting-graph-16"].includes(engine) ||
            !influenceReadyBases.has(baseId) ||
            (baseId === "Metadata/Items/Armours/Shields/ShieldStrE3" &&
                engine !== "crafting-graph-16")
        )
            throw new Error(
                "Influence-ready shield sources require crafting engine 15 or 16; Heat-attuned sources require engine 16.",
            );
        return;
    }
    if (source.kind === "scour-v1") {
        if (
            baseId === "Metadata/Items/Armours/BodyArmours/BodyInt17" &&
            engine !== "crafting-graph-16"
        )
            throw new Error("Scouring Vaal Regalia sources requires crafting engine 16.");
        if (
            ![
                "crafting-graph-12",
                "crafting-graph-13",
                "crafting-graph-14",
                "crafting-graph-15",
                "crafting-graph-16",
            ].includes(engine)
        )
            throw new Error(
                "Scouring source preparation requires crafting engine 12, 13, 14, 15 or 16.",
            );
        if (
            additionalScouringBases.has(baseId) &&
            ![
                "crafting-graph-13",
                "crafting-graph-14",
                "crafting-graph-15",
                "crafting-graph-16",
            ].includes(engine)
        )
            throw new Error(
                "Scouring these boots or body armour requires crafting engine 13, 14, 15 or 16.",
            );
    } else if (
        ![
            "crafting-graph-11",
            "crafting-graph-12",
            "crafting-graph-13",
            "crafting-graph-14",
            "crafting-graph-15",
            "crafting-graph-16",
        ].includes(engine)
    )
        throw new Error("Source preparation requires crafting engine 11, 12, 13, 14, 15 or 16.");
}

export function sourcePreparationMethodList(source: SourcePreparation): CraftingMethod[] {
    if (source.kind === "influence-ready-v1") return [];
    return [
        ...(source.crafted ? [{ kind: "bench" as const, id: "bench:84" }] : []),
        ...(source.enchanted ? [{ kind: "bench" as const, id: "bench:373" }] : []),
        ...(source.kind === "scour-v1"
            ? [{ kind: "currency" as const, id: "Metadata/Items/Currency/CurrencyConvertToNormal" }]
            : [
                  source.fossils,
                  {
                      kind: "currency" as const,
                      id: "Metadata/Items/Currency/CurrencyEldritchIchor1",
                  },
                  {
                      kind: "currency" as const,
                      id: "Metadata/Items/Currency/CurrencyEldritchEmber2",
                  },
              ]),
    ];
}

export function sourcePreparationMethods(engine: CraftingEngine, source: SourcePreparation) {
    return sourcePreparationMethodList(source).map((method) => engine.validateMethod(method));
}

export function sourcePreparationCosts(
    engine: CraftingEngine,
    source: SourcePreparation,
    item: CraftingItem,
) {
    return sourcePreparationMethods(engine, source).flatMap((method) =>
        engine.costs(method, method.kind === "fossils" ? item : undefined),
    );
}

export function validateSourcePreparation(engine: CraftingEngine, purchase: GraphPurchase) {
    const source = purchase.sourcePreparation;
    if (!source) return;
    const item = engine.validateItem(purchase.item);
    if (source.kind === "scour-v1" || source.kind === "influence-ready-v1") {
        const expected = {
            ...engine.createItem(item.baseId, item.level),
            influences: source.kind === "scour-v1" ? item.influences : [],
        };
        if (
            engine.catalog.game !== "poe1" ||
            (source.kind === "influence-ready-v1" && !influenceReadyBases.has(item.baseId)) ||
            (!["Shield", "Helmet"].includes(engine.base(item).item_class) &&
                !additionalScouringBases.has(item.baseId)) ||
            Object.keys(item).some(
                (field) =>
                    JSON.stringify(item[field as keyof CraftingItem]) !==
                    JSON.stringify(expected[field as keyof CraftingItem]),
            )
        )
            throw new Error(
                source.kind === "influence-ready-v1"
                    ? "An influence-ready source requires a clean uninfluenced Normal Pinnacle, Titanium or Heat-attuned shield template with only native implicits."
                    : "A Scouring source requires a baseline Normal shield or helmet, Cold/Lightning Two-Toned Boots, Zodiac Leather or Vaal Regalia template with only its preserved influences and native implicits.",
            );
        sourcePreparationMethods(engine, source);
        return;
    }
    const fracture = item.mods[0];
    if (
        engine.catalog.game !== "poe1" ||
        engine.base(item).item_class !== "Body Armour" ||
        item.rarity !== "rare" ||
        item.mods.length !== 1 ||
        fracture?.id !== source.fractureId ||
        !fracture.fractured ||
        fracture.crafted ||
        !["prefix", "suffix"].includes(engine.mod(fracture.id).generation_type)
    )
        throw new Error(
            "A fractured fossil source requires a Rare body armour template with only its known natural fracture.",
        );
    const baseline = engine.createItem(item.baseId, item.level);
    const expected: CraftingItem = { ...baseline, rarity: "rare", mods: item.mods };
    if (
        Object.keys(item).some(
            (field) =>
                JSON.stringify(item[field as keyof CraftingItem]) !==
                JSON.stringify(expected[field as keyof typeof expected]),
        )
    )
        throw new Error(
            "A fractured fossil source template cannot contain additional prepared state.",
        );
    for (const method of sourcePreparationMethods(engine, source)) engine.validateMethod(method);
    const resonator = engine.catalog.crafting.currencies.find(
        (entry) => entry.id === source.fossils.resonator,
    );
    const available = engine.availableFossils(item);
    if (
        resonator?.action !== "delve_currency_reroll" ||
        Number(resonator.id.at(-1)) !== source.fossils.ids.length ||
        new Set(source.fossils.ids).size !== source.fossils.ids.length ||
        source.fossils.ids.some((id) => !available.some((fossil) => fossil.id === id)) ||
        [...source.fossils.ids, ...(source.fossils.tangled ? [source.fossils.tangled] : [])].some(
            (id) =>
                engine.catalog.crafting.fossils
                    .find((fossil) => fossil.id === id)
                    ?.effects.some(
                        (effect) =>
                            effect === "CorruptedImplicit" ||
                            effect === "Fracture" ||
                            effect === "BetterSellPrice",
                    ),
        )
    )
        throw new Error(
            "Source preparation requires compatible reroll fossils without persistent implicit or fracture effects.",
        );
    engine.costs(source.fossils, item);
}

export function validateSourcePreparationOutput(purchase: GraphPurchase, query: ItemQuery) {
    const source = purchase.sourcePreparation;
    if (!source) return;
    if (source.kind === "scour-v1" || source.kind === "influence-ready-v1") {
        if (
            query.sourcePreparation ||
            query.groups.some(
                (group) =>
                    group.type !== "and" ||
                    group.filters.some(
                        (condition) =>
                            !(
                                condition.kind === "base" &&
                                ["baseId", "baseType", "itemClass"].includes(condition.field)
                            ) &&
                            condition.kind !== "rarity" &&
                            condition.kind !== "influence" &&
                            !(condition.kind === "flag" && condition.field !== "split") &&
                            !(
                                condition.kind === "range" &&
                                ["ilvl", "prefixes", "suffixes"].includes(condition.field)
                            ),
                    ),
            )
        )
            throw new Error(
                source.kind === "influence-ready-v1"
                    ? "An influence-ready source can guarantee only its clean Normal base, level, affix counts, influences and supported flags."
                    : "A Scouring source can guarantee only its Normal base, level, affix counts, influences and supported flags.",
            );
        return;
    }
    if (
        query.sourcePreparation ||
        query.groups.some(
            (group) =>
                group.type !== "and" ||
                group.filters.some(
                    (condition) =>
                        condition.kind !== "base" &&
                        !(condition.kind === "range" && condition.field === "ilvl") &&
                        !(
                            condition.kind === "mod" &&
                            condition.ids?.length === 1 &&
                            condition.ids[0] === source.fractureId
                        ),
                ),
        )
    )
        throw new Error(
            "A prepared source acquisition can guarantee only its base, level and retained fracture.",
        );
}

export function estimateSourcePurchase(
    engine: CraftingEngine,
    graph: CraftingGraph,
    node: GraphAcquireNode,
    purchase: GraphPurchase,
) {
    const key = `purchase:${node.id}:${purchase.id}`;
    const price = graph.prices[key] ?? purchase.price;
    const missingPrices = new Set(price ? [] : [key]);
    let total = price?.amount ?? 0;
    const methods = purchase.sourcePreparation
        ? sourcePreparationMethods(engine, purchase.sourcePreparation)
        : [];
    const costs = purchase.sourcePreparation
        ? sourcePreparationCosts(engine, purchase.sourcePreparation, purchase.item)
        : [];
    for (const cost of costs) {
        const input = craftingNodeCostPrice(graph.prices, node.id, cost.id);
        if (!input) missingPrices.add(cost.id);
        else total += input.amount * cost.amount;
    }
    return {
        expectedCost: missingPrices.size ? null : total,
        expectedActions: methods.length,
        missingPrices: [...missingPrices],
        confidence: price?.confidence ?? null,
    };
}

export function prepareSourcePurchase(
    engine: CraftingEngine,
    purchase: GraphPurchase,
    random: CraftingRandom,
    preferences: ItemQuery[] = [],
    onAction?: (costs: CraftingCost[]) => void,
) {
    validateSourcePreparation(engine, purchase);
    const source = purchase.sourcePreparation;
    if (!source) return { item: structuredClone(purchase.item), costs: [], actions: 0 };
    let item = structuredClone(purchase.item);
    const costs: CraftingCost[] = [];
    const methods = sourcePreparationMethods(engine, source);
    for (const method of methods) {
        if (method.kind === "bench" || source.kind === "scour-v1") {
            // The source policy proves these discarded fields exist; the template does not invent their IDs.
            const paid = engine.costs(method);
            costs.push(...paid);
            onAction?.(paid);
            continue;
        }
        const result = usesAllflame(method)
            ? engine.prepareAllflame(item, method, random)
            : engine.apply(item, method, random);
        costs.push(...result.cost);
        onAction?.(result.cost);
        item = result.item;
        if (item.allflameCopies) {
            const queries = createCraftingItemQuery(engine);
            const choices = item.allflameCopies;
            let selected = 0;
            for (const query of preferences) {
                const index = choices.findIndex((copy) => queries.matches(copy, query) === "match");
                if (index < 0) continue;
                selected = index;
                break;
            }
            item = engine.chooseAllflame(item, selected);
        }
    }
    return { item, costs, actions: methods.length };
}
