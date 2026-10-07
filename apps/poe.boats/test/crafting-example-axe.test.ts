import { type ItemCondition, itemQuerySchema } from "@poe-tools/item-query";
import { describe, expect, it } from "vite-plus/test";
import { seededRandom } from "../app/lib/crafting-engine";
import { nonNativeEssenceSources } from "../app/lib/crafting-recombination";
import { craftingItemSchema } from "../app/schemas/crafting";
import { craftingGraphSchema } from "../app/schemas/crafting-graph";
import { catalog, currency, engine } from "./crafting-fixtures";
import { anyItem, graphFixture, queryMods, quote, runGraphTrial } from "./crafting-graph-fixtures";
import { nnnBase } from "./crafting-nnn-fixtures";

const percent = "LocalIncreasedPhysicalDamagePercent8";
const hybrid = "LocalIncreasedPhysicalDamagePercentAndAccuracyRating8";
const flat = "LocalAddedPhysicalDamageTwoHand9";
const transmute = currency("transmute_to_magic");
const alteration = currency("reroll_magic");
const exalt = currency("add_mod_to_rare");
const influence = currency("add_influence_mod_to_rare");
const essence = catalog.crafting.essences.find(
    (entry) => entry.name === "Screaming Essence of Torment",
)!;
const nnn = essence.mods["Two Hand Axe"]!;
const block = catalog.crafting.bench.find(
    (entry) => entry.mod === "EinharMasterIncreasedManaTwoHandWeapon1___",
)!;
const remove = catalog.crafting.bench.find((entry) => entry.action === 0 && !entry.mod)!;
const query = (...filters: ItemCondition[]) =>
    itemQuerySchema.parse({ game: "poe1", groups: [{ type: "and", filters }] });

function axeGraph() {
    const ready = queryMods(percent, hybrid);
    const essenceReady = itemQuerySchema.parse({
        ...queryMods(flat, nnn),
        groups: [
            ...queryMods(flat, nnn).groups,
            ...query({ kind: "range", field: "prefixes", value: { max: 2 } }).groups,
        ],
    });
    const needsSuffix = query({ kind: "range", field: "openSuffixes", value: { min: 1 } });
    const goodBase = nnnBase("Despot Axe");
    const good = query({ kind: "base", field: "baseId", values: [goodBase.baseId] });
    const output = itemQuerySchema.parse({
        ...good,
        groups: [...good.groups, ...queryMods(percent, hybrid, flat).groups],
    });
    const graph = craftingGraphSchema.parse({
        ...graphFixture(),
        id: "physical-axe",
        name: "Alteration donors to three physical prefixes",
        nodes: [
            ...([percent, hybrid] as const).flatMap((mod, index) => {
                const id = index === 0 ? "percent" : "hybrid";
                const missing = itemQuerySchema.parse({
                    game: "poe1",
                    groups: [{ type: "not", filters: [{ kind: "mod", ids: [mod] }] }],
                });
                return [
                    {
                        kind: "acquire",
                        id: `${id}-base`,
                        name: `${id} donor base`,
                        output: anyItem,
                        alternatives: [
                            {
                                kind: "purchase",
                                id: "buy",
                                name: "Buy Jade Chopper",
                                item: nnnBase("Jade Chopper"),
                                price: quote(2),
                            },
                        ],
                    },
                    {
                        kind: "craft",
                        id: `${id}-magic`,
                        name: `Transmute ${id} donor`,
                        output: anyItem,
                        method: transmute,
                        inputs: [{ id: "item", name: "Normal base", source: `${id}-base` }],
                    },
                    {
                        kind: "craft",
                        id,
                        name: `Alter until ${id}`,
                        output: queryMods(mod),
                        method: alteration,
                        inputs: [{ id: "item", name: "Magic donor", source: `${id}-magic` }],
                        applyWhen: missing,
                        branches: [
                            {
                                id: "retry",
                                name: "Roll again",
                                query: missing,
                                destination: { kind: "recover", nodeId: id, inputId: "item" },
                            },
                        ],
                    },
                ];
            }),
            {
                kind: "craft",
                id: "join",
                name: "Combine physical donors",
                output: ready,
                method: { kind: "recombine", id: "recombine" },
                inputs: [
                    { id: "percent", name: "Percent donor", source: "percent" },
                    { id: "hybrid", name: "Hybrid donor", source: "hybrid" },
                ],
                branches: [
                    {
                        id: "percent",
                        name: "Recover percent",
                        query: queryMods(percent),
                        destination: { kind: "recover", nodeId: "join", inputId: "percent" },
                    },
                    {
                        id: "hybrid",
                        name: "Recover hybrid",
                        query: queryMods(hybrid),
                        destination: { kind: "recover", nodeId: "join", inputId: "hybrid" },
                    },
                    {
                        id: "both",
                        name: "Both prefixes",
                        query: ready,
                        destination: { kind: "return" },
                    },
                ],
                fallback: { kind: "discard" },
            },
            {
                kind: "craft",
                id: "block",
                name: "Craft spare prefix",
                output: ready,
                method: { kind: "bench", id: block.id },
                inputs: [{ id: "item", name: "Two-prefix donor", source: "join" }],
            },
            {
                kind: "craft",
                id: "fill",
                name: "Fill suffixes",
                output: ready,
                method: exalt,
                applyWhen: needsSuffix,
                inputs: [{ id: "item", name: "Blocked donor", source: "block" }],
                branches: [
                    {
                        id: "retry",
                        name: "Suffixes still open",
                        query: needsSuffix,
                        destination: { kind: "recover", nodeId: "fill", inputId: "item" },
                    },
                ],
            },
            {
                kind: "craft",
                id: "unblock",
                name: "Remove crafted prefix",
                output: ready,
                method: { kind: "bench", id: remove.id },
                inputs: [{ id: "item", name: "Filled donor", source: "fill" }],
            },
            {
                kind: "craft",
                id: "influence",
                name: "Slam an influenced prefix",
                output: ready,
                method: influence,
                inputs: [{ id: "item", name: "Five-mod donor", source: "unblock" }],
            },
            {
                kind: "acquire",
                id: "good",
                name: "Desired base",
                output: anyItem,
                alternatives: [
                    {
                        kind: "purchase",
                        id: "buy",
                        name: "Buy Despot Axe",
                        item: goodBase,
                        price: quote(10),
                    },
                ],
            },
            {
                kind: "craft",
                id: "essence",
                name: "NNN essence until T1 flat physical",
                output: essenceReady,
                method: { kind: "essence", id: essence.id },
                inputs: [{ id: "item", name: "Desired base", source: "good" }],
                branches: [
                    {
                        id: "hit",
                        name: "Flat physical and NNN",
                        query: essenceReady,
                        destination: { kind: "return" },
                    },
                ],
                fallback: { kind: "recover", nodeId: "essence", inputId: "item" },
            },
            {
                kind: "craft",
                id: "final",
                name: "Final recombination",
                output: anyItem,
                method: { kind: "recombine", id: "recombine" },
                inputs: [
                    { id: "left", name: "Influenced donor", source: "influence" },
                    { id: "right", name: "Desired base", source: "essence" },
                ],
            },
        ],
        entry: "final",
        outcomes: [
            { id: "target", name: "Three T1 physical prefixes", query: output },
            {
                id: "miss",
                name: "Excluded recovery",
                query: anyItem,
                success: false,
                disposition: "discard",
            },
        ],
        prices: {
            [transmute.id]: quote(0.1),
            [alteration.id]: quote(0.1),
            [exalt.id]: quote(2),
            [influence.id]: quote(20),
            [essence.id]: quote(1),
            "service:recombine": quote(1),
            ...Object.fromEntries(
                [...block.cost, ...remove.cost].map((entry) => [entry.id, quote(0.1)]),
            ),
        },
    });
    return { graph, block, goodBase };
}

describe("physical axe multi-stage recombination", () => {
    it.each([
        true,
        false,
    ])("accounts for both production chains and recovered partials (final desired base: %s)", (win) => {
        const { graph, block, goodBase } = axeGraph();
        expect(
            nonNativeEssenceSources(engine, goodBase).some(
                (entry) => entry.id === essence.id && entry.side === "prefix",
            ),
        ).toBe(true);
        const before = structuredClone(graph);
        const donors = ["miss", percent, hybrid, hybrid];
        let combinations = 0;
        const random = seededRandom(42);
        const result = runGraphTrial(graph, {
            integer: random.integer,
            pick: (choices) => {
                if (craftingItemSchema.safeParse(choices[0]?.value).success) {
                    combinations++;
                    const expected =
                        combinations === 1
                            ? [percent]
                            : combinations === 2
                              ? [percent, hybrid]
                              : [percent, hybrid, flat];
                    const selected = choices.find(({ value, weight }) => {
                        const parsed = craftingItemSchema.safeParse(value);
                        return (
                            weight > 0 &&
                            parsed.success &&
                            (combinations < 3
                                ? parsed.data.mods.length === expected.length &&
                                  expected.every((id) =>
                                      parsed.data.mods.some((mod) => mod.id === id),
                                  )
                                : (parsed.data.baseId === goodBase.baseId) === win &&
                                  (!win ||
                                      expected.every((id) =>
                                          parsed.data.mods.some((mod) => mod.id === id),
                                      )))
                        );
                    });
                    if (!selected)
                        throw new Error(
                            "The requested axe outcome is absent from the real engine distribution.",
                        );
                    return selected.value;
                }
                if (donors.length && choices.some((entry) => entry.value === percent)) {
                    const next = donors.shift();
                    return choices.find(
                        (entry) =>
                            entry.weight > 0 &&
                            (next === "miss"
                                ? entry.value !== percent && entry.value !== hybrid
                                : entry.value === next),
                    )!.value;
                }
                return (choices.find((entry) => entry.weight > 0 && entry.value === flat) ??
                    choices.find(
                        (entry) =>
                            entry.weight > 0 &&
                            typeof entry.value === "string" &&
                            catalog.mods[entry.value]?.generation_type === "suffix",
                    ) ??
                    choices.find((entry) => entry.weight > 0))!.value;
            },
        });
        expect(result).toMatchObject({
            status: "terminal",
            success: win,
            outcomeId: win ? "target" : "miss",
            purchases: 4,
            missingPrices: [],
        });
        expect(result.spending).toMatchObject({
            "purchase:percent-base:buy": 1,
            "purchase:hybrid-base:buy": 2,
            "purchase:good:buy": 1,
            [transmute.id]: 3,
            [alteration.id]: 1,
            [exalt.id]: 3,
            [influence.id]: 1,
            [essence.id]: 1,
            "service:recombine": 3,
        });
        const preparation = [...block.cost, ...remove.cost].reduce(
            (sum, entry) => sum + entry.amount * graph.prices[entry.id]!.amount,
            0,
        );
        expect(result.cost).toBeCloseTo(16 + 0.3 + 0.1 + 6 + 20 + 1 + 3 + preparation);
        expect(result.visits.join!.recovered).toBe(1);
        expect(result.revenue).toBe(0);
        const consumed = result.trace
            .filter((entry) => !entry.skipped)
            .flatMap((entry) => entry.inputs);
        expect(new Set(consumed).size).toBe(consumed.length);
        expect(graph).toEqual(before);
    });
});
