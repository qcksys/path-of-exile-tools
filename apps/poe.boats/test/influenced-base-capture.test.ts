import { readFileSync } from "node:fs";
import { normalizeApiItem } from "@poe-tools/item-query";
import {
    cohortPriceCoverage,
    compileMarketCohorts,
    marketCohortManifestSchema,
} from "@poe-tools/market";
import { expect, it } from "vite-plus/test";
import { createCraftingItemQuery } from "../app/lib/crafting-item-query";
import { bindCohortPurchasePrice } from "../app/lib/crafting-market";
import { projectFromPreset } from "../app/lib/crafting-presets";
import {
    estimateSourcePurchase,
    purchaseSourceProfile,
} from "../app/lib/crafting-source-preparation";
import { rolledModText } from "../app/lib/crafting-text";
import { craftingPresetCohorts } from "../scripts/crafting-preset-cohorts";
import { catalog, currency, engine } from "./crafting-fixtures";
import { quote } from "./crafting-graph-fixtures";
import { historyIndex } from "./crafting-history-fixtures";
import { marketCandidate } from "./crafting-market-fixtures";

const ruleset = {
    ...historyIndex.revisions.find((entry) => entry.game === "poe1" && entry.revision === "r14")!,
    engine: "crafting-graph-15",
    revision: "r15",
};
const manifest = marketCohortManifestSchema.parse(
    JSON.parse(readFileSync("../../packages/poe-market/data/cohorts-poe1.json", "utf8")),
);
const generated = craftingPresetCohorts(engine, ruleset);
const queries = createCraftingItemQuery(engine);
const scour = currency("convert_to_normal").id;
const sources = [
    ["life-block-shield", "recovery-make-base-influence-base"],
    ["es-block-shield", "flat-make-base-influence-base"],
] as const;
const alternatives = [
    "buy",
    "buy-scour",
    "buy-scour-crafted",
    "buy-scour-enchanted",
    "buy-scour-crafted-enchanted",
];

function fixture(presetId: (typeof sources)[number][0], nodeId: string, alternativeId: string) {
    const graph = projectFromPreset(engine, ruleset, presetId);
    const node = graph.nodes.find((entry) => entry.id === nodeId);
    if (node?.kind !== "acquire") throw new Error("Missing plain influence-source acquisition.");
    const purchase = node.alternatives.find((entry) => entry.id === alternativeId);
    if (purchase?.kind !== "purchase") throw new Error("Missing plain source purchase.");
    const record = queries.record(purchase.item);
    const profile = purchaseSourceProfile(purchase);
    const cleanup = profile?.kind === "scour-v1" ? profile : undefined;
    const definitions = generated.filter(
        (cohort) => cohortPriceCoverage(cohort, record, node.output, undefined, profile).covered,
    );
    expect(definitions).toHaveLength(1);
    const definition = definitions[0]!;
    const classifier = compileMarketCohorts({ ...manifest, cohorts: [definition] });
    const baseType = engine.base(purchase.item).name;
    const raw = {
        baseType,
        typeLine: baseType,
        ilvl: purchase.item.level,
        rarity: cleanup ? "Rare" : "Normal",
        frameType: cleanup ? 2 : 0,
        identified: true,
        corrupted: false,
        duplicated: false,
        fractured: false,
        synthesised: false,
        influences: {},
        implicitMods: purchase.item.implicits.flatMap((mod) =>
            rolledModText(catalog, mod, purchase.item)!.split("\n"),
        ),
        explicitMods: cleanup ? ["Unresolved disposable affix"] : [],
        craftedMods: cleanup?.crafted ? ["Prefixes Cannot Be Changed"] : [],
        enchantMods: cleanup?.enchanted
            ? [
                  "Quality does not increase Defences",
                  "Grants +1% to Lightning Resistance per 2% Quality",
              ]
            : [],
    };
    return { graph, node, purchase, profile, definition, classifier, raw };
}

it.each(sources)("publishes exact clean and paid cleanup families for %s", (presetId, nodeId) => {
    const ids = new Set<string>();
    for (const alternativeId of alternatives) {
        const { definition, classifier, raw, purchase } = fixture(presetId, nodeId, alternativeId);
        expect(purchase.item).toMatchObject({
            level: 86,
            quality: 0,
            rarity: "normal",
            influences: [],
            mods: [],
        });
        ids.add(definition.id);
        const record = normalizeApiItem("poe1", "stash", raw);
        const before = structuredClone(record);
        expect(classifier.classify(record)).toEqual({ matches: [definition.id], unknown: [] });
        expect(record).toEqual(before);
        expect(manifest.cohorts.find((cohort) => cohort.id === definition.id)).toEqual(definition);
    }
    expect(ids.size).toBe(5);
});

it.each(sources)("refuses unguarded or mismatched source prices for %s", (presetId, nodeId) => {
    const { graph, node, purchase, definition, profile } = fixture(presetId, nodeId, "buy");
    graph.league = "Standard";
    const candidate = structuredClone(marketCandidate);
    candidate.definition = {
        ...definition,
        revision: candidate.latest.revision,
        catalogHash: manifest.catalogHash,
    };
    candidate.latest.cohortId = definition.id;
    candidate.sourcePreparation = profile;
    expect(() =>
        bindCohortPurchasePrice(graph, engine, node.id, purchase.id, candidate),
    ).not.toThrow();
    const unguarded = structuredClone(candidate);
    delete unguarded.definition.query.sourcePreparation;
    expect(() => bindCohortPurchasePrice(graph, engine, node.id, purchase.id, unguarded)).toThrow();
    delete candidate.sourcePreparation;
    expect(() => bindCohortPurchasePrice(graph, engine, node.id, purchase.id, candidate)).toThrow(
        "different source preparation",
    );
});

it.each(
    sources,
)("refuses incompatible influence-ready lookup templates for %s", (presetId, nodeId) => {
    const { node, purchase, definition, profile } = fixture(presetId, nodeId, "buy");
    const record = queries.record(purchase.item);
    expect(cohortPriceCoverage(definition, record, node.output, undefined, profile).covered).toBe(
        true,
    );
    const changes: Array<(input: typeof record) => void> = [
        (input) => {
            input.item.searing = true;
        },
        (input) => {
            input.item.tangled = true;
        },
        (input) => {
            input.item.intangibility = 84;
        },
        (input) => {
            input.item.properties = [{ name: "Intangibility", values: [["84%", 0]] }];
        },
        (input) => {
            input.item.enchantMods = ["Unremoved enchantment"];
        },
        (input) => {
            input.item.implicitMods = ["Unknown persistent implicit"];
        },
        (input) => {
            input.facts.modifiers.push({ id: "unknown-persistent-implicit", side: "implicit" });
        },
        (input) => {
            input.facts.memoryStrands = 1;
        },
        (input) => {
            input.facts.quality = 20;
        },
    ];
    for (const change of changes) {
        const incompatible = structuredClone(record);
        change(incompatible);
        expect(
            cohortPriceCoverage(definition, incompatible, node.output, undefined, profile).covered,
        ).toBe(false);
    }
});

it.each(
    sources,
)("keeps incompatible or uncertain source states unpriced for %s", (presetId, nodeId) => {
    for (const alternativeId of alternatives) {
        const { classifier, raw } = fixture(presetId, nodeId, alternativeId);
        for (const change of [
            { influences: { shaper: true } },
            { influences: { hunter: true } },
            { fractured: true, fracturedMods: ["+70 to maximum Life"] },
            { synthesised: true },
            { searing: true },
            { tangled: true },
            { implicitMods: [...raw.implicitMods, "An unknown persistent implicit"] },
            { corrupted: true },
            { duplicated: true },
            { ilvl: 85 },
            { ilvl: 87 },
            { identified: false },
            {
                properties: [
                    {
                        name: "[Intangibility|Intangibility]",
                        type: 110,
                        displayMode: 0,
                        values: [["84%", 0]],
                    },
                ],
            },
        ]) {
            const result = classifier.classify(
                normalizeApiItem("poe1", "stash", { ...raw, ...change }),
            );
            expect(result.matches, `${nodeId}/${alternativeId} ${JSON.stringify(change)}`).toEqual(
                [],
            );
        }
    }
});

it.each(
    sources,
)("prices cleanup separately and leaves an absent cleanup quote unknown for %s", (presetId, nodeId) => {
    for (const alternativeId of alternatives) {
        const { graph, node, purchase, profile } = fixture(presetId, nodeId, alternativeId);
        purchase.price = quote(7);
        graph.prices = {};
        if (profile?.kind !== "scour-v1") {
            expect(estimateSourcePurchase(engine, graph, node, purchase)).toMatchObject({
                expectedCost: 7,
                expectedActions: 0,
                missingPrices: [],
            });
            continue;
        }
        expect(estimateSourcePurchase(engine, graph, node, purchase)).toMatchObject({
            expectedCost: null,
            missingPrices: [scour],
        });
        graph.prices[scour] = quote(2);
        const scours = 1 + Number(profile.crafted) + 3 * Number(profile.enchanted);
        expect(estimateSourcePurchase(engine, graph, node, purchase)).toMatchObject({
            expectedCost: 7 + 2 * scours,
            expectedActions: 1 + Number(profile.crafted) + Number(profile.enchanted),
            missingPrices: [],
        });
    }
});
