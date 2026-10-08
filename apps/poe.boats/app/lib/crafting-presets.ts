import { type ItemQuery, itemQuerySchema } from "@poe-tools/item-query";
import type { CraftingItem, CraftingMethod } from "../schemas/crafting";
import type { CraftingGraph, GraphCraftNode, GraphNode } from "../schemas/crafting-graph";
import type { CraftingPreset, CraftingPresetId } from "../schemas/crafting-presets";
import type { CraftingRuleset } from "../schemas/crafting-rulesets";
import { type CraftingEngine, seededRandom } from "./crafting-engine";
import { projectFromItem } from "./crafting-graph-authoring";
import { validateCraftingGraph } from "./crafting-graph-validation";
import { janusRarityModifier } from "./crafting-janus";
import { elevatedBootsPreset } from "./crafting-preset-boots";
import { helicalRingPreset } from "./crafting-preset-helical";
import { alterationDonor } from "./crafting-preset-preparation";
import { nonNativeEssenceSources } from "./crafting-recombination";
import { validateRulesetGraph } from "./crafting-rulesets";

export const craftingPresets: readonly CraftingPreset[] = [
    {
        id: "life-block-shield",
        game: "poe1",
        name: "Life on block shield",
        description:
            "Recombine life recovery on block onto a Shaper Heat-attuned Tower Shield with T1 block chance and +2% all maximum resistances. Rebuild consumed donors and recover usable misses.",
    },
    {
        id: "es-block-shield",
        game: "poe1",
        name: "Energy shield on block shield",
        description:
            "Build overlapping flat ES / percent ES and flat ES / block prefix pairs with non-native natural evasion essence donors. Recombine 2p + 2p, retaining Shaper ES recovery on block; recover partial donors.",
    },
    {
        id: "tailwind-boots",
        game: "poe1",
        name: "Tailwind and Elusive boots",
        description:
            "Prepare and elevate Hunter Tailwind and Redeemer Onslaught donors, awaken them, keep T3+ resistance and add elevated Elusive, then unveil movement speed and craft life. Misses restore the receiver imprint or retry protected prefixes.",
    },
    {
        id: "physical-bow",
        game: "poe1",
        name: "Physical bow",
        description:
            "Build physical / hybrid and physical / flat prefix pairs separately (1p + 1p), then recombine 2p + 2p for all three. Recover pairs and single-prefix misses into their preparation steps.",
    },
    {
        id: "elemental-bow",
        game: "poe1",
        name: "Elemental bow",
        description:
            "Build fire / cold and fire / lightning prefix pairs separately (1p + 1p), then recombine 2p + 2p. Recover pairs and single-prefix misses into their preparation steps.",
    },
    {
        id: "suppression-chest",
        game: "poe1",
        name: "Suppression chest",
        description:
            "Roll and isolate T1 suppression on Zodiac Leather, craft a non-native Strength essence donor, then recombine onto Necrotic Armour. Misses return to donor preparation.",
    },
    {
        id: "global-defence-chest",
        game: "poe1",
        name: "Global defence chest",
        description:
            "Acquire the drop-only global defences Grasping Mail modifier, roll and isolate T1 flat energy shield on Necrotic Armour, then recombine. Recover surviving modifiers and rebuild missing donors.",
    },
    {
        id: "rarity-helmet",
        game: "poe1",
        name: "Rarity helmet",
        description:
            "Transfer a purchased Janus unveiled rarity suffix alongside normal T1 rarity, life and chaos resistance. Build two pairs, then recombine; recover surviving pairs and single modifiers into preparation.",
    },
    {
        id: "energy-shield-chest",
        game: "poe1",
        name: "Triple energy shield chest",
        description:
            "Build flat / percent ES and flat / hybrid ES pairs, then recombine 2p + 2p. NNN evasion/armour essence prefixes improve prefix-count selection without surviving on Vaal Regalia. Recover partial donors.",
    },
    {
        id: "strength-helical-ring",
        game: "poe1",
        name: "Replica Alberon's strength-stacking Helical Ring",
        description:
            "70+ memory strands, low-consumption Strength essence, isolated Strength imprint, T1 all Attributes, accuracy/light radius regal, protected T3+ chaos reforge, Unravelling and a Hunter life-on-hit slam. Misses annul or restore the appropriate imprint.",
    },
];

export function listCraftingPresets(game: "poe1" | "poe2") {
    return craftingPresets.filter((preset) => preset.game === game);
}

export function projectFromPreset(
    engine: CraftingEngine,
    ruleset: CraftingRuleset,
    presetId: CraftingPresetId,
): CraftingGraph {
    const preset = listCraftingPresets(engine.catalog.game).find((entry) => entry.id === presetId);
    if (!preset || ruleset.game !== engine.catalog.game)
        throw new Error("This preset is unavailable for the selected game.");
    const random = seededRandom(42);
    const any = itemQuerySchema.parse({ game: preset.game });
    const query = (mods: string[], baseId?: string): ItemQuery =>
        itemQuerySchema.parse({
            game: preset.game,
            groups: [
                {
                    type: "and",
                    filters: [
                        ...mods.map((id) => ({ kind: "mod", ids: [id] })),
                        ...(baseId ? [{ kind: "base", field: "baseId", values: [baseId] }] : []),
                    ],
                },
            ],
        });
    const base = (name: string) => {
        const found = Object.entries(engine.catalog.bases).find(([, entry]) => entry.name === name);
        if (!found) throw new Error(`Preset base is unavailable: ${name}`);
        return engine.createItem(found[0], 86);
    };
    const prepared = (name: string, mods: string[]) =>
        mods.reduce(
            (item, id) =>
                engine.addStartingMod(
                    item,
                    id,
                    random,
                    engine.catalog.crafting.modRules[id]?.influence != null
                        ? "influence"
                        : "natural",
                ),
            base(name),
        );
    const natural = (item: CraftingItem, name: string) => {
        const found = engine
            .pool({ ...item, rarity: "rare" })
            .find((entry) => entry.mod.name === name);
        if (!found) throw new Error(`Preset modifier is unavailable: ${name}`);
        return found.id;
    };
    const currency = (action: string): CraftingMethod => {
        const found = engine.catalog.crafting.currencies.find((entry) => entry.action === action);
        if (!found) throw new Error(`Preset currency is unavailable: ${action}`);
        return { kind: "currency", id: found.id };
    };
    const nodes: GraphNode[] = [];
    const buy = (id: string, name: string, item: CraftingItem, output = any) => {
        nodes.push({
            kind: "acquire",
            id,
            name,
            output,
            choice: { mode: "pinned", alternativeId: "buy" },
            alternatives: [{ kind: "purchase", id: "buy", name, item, price: null }],
        });
        return id;
    };
    const craft = (
        id: string,
        name: string,
        sources: string[],
        method: CraftingMethod,
        output = any,
    ) => {
        const node: GraphCraftNode = {
            kind: "craft",
            id,
            name,
            output,
            method,
            inputs: sources.map((source, index) => ({
                id: `input-${index}`,
                name: index ? "Donor" : "Item",
                source,
            })),
            branches: [],
            ordering: "manual",
            fallback: { kind: "return" },
        };
        nodes.push(node);
        return node;
    };
    const combine = (
        id: string,
        sources: string[],
        target: ItemQuery,
        recover: ItemQuery[] = [],
    ) => {
        const node = craft(
            id,
            "Recombine donors",
            sources,
            { kind: "recombine", id: "recombine" },
            target,
        );
        node.branches = [
            {
                id: "hit",
                name: "Target modifiers and base",
                query: target,
                destination: { kind: "return" },
            },
            ...recover.map((query, index) => ({
                id: `recover-${index}`,
                name: `Recover ${index ? "donor" : "item"}`,
                query,
                destination: { kind: "recover" as const, nodeId: id, inputId: `input-${index}` },
            })),
        ];
        node.fallback = { kind: "discard" };
        return node;
    };
    let entry: string;
    let target: ItemQuery;
    if (presetId === "life-block-shield" || presetId === "es-block-shield") {
        const life = presetId === "life-block-shield";
        const item = base(life ? "Heat-attuned Tower Shield" : "Titanium Spirit Shield");
        const mod = life
            ? "RecoverLifePercentOnBlockUber1_"
            : "RecoverEnergyShieldPercentOnBlockUber1";
        const influence = engine.catalog.crafting.modRules[mod]?.influence;
        if (influence == null) throw new Error("Shaper block recovery is unavailable.");
        item.influences = [influence];
        const block = "LocalIncreasedBlockPercentage7";
        const donor = (id: string, name: string, ids: string[], nnn = false) => {
            let value = ids.reduce((value, id) => engine.addStartingMod(value, id, random), item);
            if (nnn) {
                const essence = nonNativeEssenceSources(engine, value).find(
                    (entry) => entry.side === "prefix",
                )!;
                value = engine.addStartingMod(value, essence.modId, random, "essence");
            }
            return buy(id, name, value, query(ids, item.baseId));
        };
        if (life) {
            const maxRes = "MaximumAllResist2";
            const pair = combine(
                "heist-pair",
                [
                    donor("block", "Buy T1 block Heist base", [block]),
                    donor("max-res", "Buy +2 all maximum resistance Heist donor", [maxRes]),
                ],
                query([block, maxRes], item.baseId),
                [query([block], item.baseId), query([maxRes], item.baseId)],
            );
            const recovery = prepared("Pinnacle Tower Shield", [mod]);
            target = query([block, maxRes, mod], item.baseId);
            const finish = combine(
                "transfer",
                [
                    pair.id,
                    buy(
                        "recovery",
                        "Buy isolated Shaper life on block donor",
                        recovery,
                        query([mod]),
                    ),
                ],
                target,
                [pair.output, query([mod])],
            );
            finish.name = "Transfer life on block onto the Heist base";
            entry = finish.id;
        } else {
            const flat = natural(item, "Incandescent");
            const percent = natural(item, "Unfaltering");
            const pair = combine(
                "pair",
                [
                    donor("flat", "Buy isolated T1 flat ES donor", [flat]),
                    donor("percent", "Buy percent ES + NNN evasion essence donor", [percent], true),
                ],
                query([flat, percent], item.baseId),
                [query([flat], item.baseId), query([percent], item.baseId)],
            );
            const other = combine(
                "block-pair",
                [
                    donor("flat-block", "Buy flat ES + ES recovery on block donor", [flat, mod]),
                    donor("block", "Buy block + NNN evasion essence donor", [block], true),
                ],
                query([flat, block, mod], item.baseId),
                [query([flat, mod], item.baseId), query([block], item.baseId)],
            );
            target = query([flat, percent, block, mod], item.baseId);
            const finish = combine("finish", [pair.id, other.id], target, [
                pair.output,
                other.output,
            ]);
            finish.name = "2p + 2p: ES, block and recovery shield";
            finish.branches.push({
                id: "recover-flat",
                name: "Flat ES survives: rebuild the ES pair",
                query: query([flat], item.baseId),
                destination: { kind: "recover", nodeId: pair.id, inputId: "input-0" },
            });
            entry = finish.id;
        }
    } else if (presetId === "tailwind-boots") {
        ({ entry, target } = elevatedBootsPreset({ engine, base, buy, craft, currency }));
    } else if (presetId === "rarity-helmet") {
        const janus = janusRarityModifier;
        const rarity = "ItemFoundRarityIncreasePrefix3";
        const life = "IncreasedLife9";
        const chaos = "ChaosResist6";
        const groups = [
            [janus, rarity],
            [life, chaos],
        ];
        const recoveryQuery = (mods: string[], pair: number) => {
            const requirements = query(mods);
            if (pair === 1)
                requirements.groups.push({
                    type: "not",
                    filters: [{ kind: "mod", ids: [janus], count: { min: 1 } }],
                });
            return requirements;
        };
        const pairs = groups.map((mods, index) => {
            const pair = combine(
                `pair-${index}`,
                mods.map((mod, position) =>
                    buy(
                        `donor-${index}-${position}`,
                        mod === janus
                            ? "Buy isolated Janus unveiled rarity donor"
                            : `Buy isolated ${engine.mod(mod).name} donor`,
                        prepared("Hubris Circlet", [mod]),
                        query([mod]),
                    ),
                ),
                query(mods),
                mods.map((mod) => query([mod])),
            );
            pair.name = index
                ? "Build life + chaos resistance pair"
                : "Combine Janus + normal rarity";
            return pair;
        });
        target = query(groups.flat(), base("Hubris Circlet").baseId);
        const finish = combine(
            "finish",
            pairs.map((pair) => pair.id),
            target,
            groups.map((mods, index) => recoveryQuery(mods, index)),
        );
        finish.name = "Recombine double rarity, life and chaos resistance";
        groups.forEach((mods, index) => {
            mods.forEach((mod, position) => {
                finish.branches.push({
                    id: `recover-single-${index}-${position}`,
                    name: `Recover ${engine.mod(mod).name} into pair preparation`,
                    query: recoveryQuery([mod], index),
                    destination: {
                        kind: "recover",
                        nodeId: pairs[index]!.id,
                        inputId: `input-${position}`,
                    },
                });
            });
        });
        entry = finish.id;
    } else if (presetId === "strength-helical-ring") {
        ({ entry, target } = helicalRingPreset({ engine, base, buy, craft, currency }));
    } else if (presetId === "suppression-chest") {
        const donor = base("Zodiac Leather");
        const suppression = natural(donor, "of Nullification");
        const essence = engine.catalog.crafting.essences.find(
            (entry) => entry.name === "Screaming Essence of Rage",
        );
        if (!essence?.mods["Body Armour"]) throw new Error("Strength essence is unavailable.");
        const item = base("Necrotic Armour");
        const strength = essence.mods["Body Armour"];
        const essenceRoll = craft(
            "strength-essence",
            "Essence of Rage: roll non-native Strength",
            [buy("strength-base", "Acquire unrolled Necrotic Armour", item)],
            { kind: "essence", id: essence.id },
        );
        const isolate = craft(
            "strength",
            "Annul until only non-native Strength remains",
            [essenceRoll.id],
            currency("remove_random_mod"),
        );
        isolate.applyWhen = itemQuerySchema.parse({
            game: "poe1",
            groups: [{ type: "and", filters: [{ kind: "mod", count: { min: 2 } }] }],
        });
        isolate.branches = [
            {
                id: "ready",
                name: "Isolated NNN Strength donor",
                query: itemQuerySchema.parse({
                    game: "poe1",
                    groups: [
                        {
                            type: "and",
                            filters: [
                                { kind: "mod", ids: [strength] },
                                { kind: "mod", count: { min: 1, max: 1 } },
                            ],
                        },
                    ],
                }),
                destination: { kind: "return" },
            },
            {
                id: "annul",
                name: "Strength survives: annul again",
                query: query([strength]),
                destination: { kind: "recover", nodeId: isolate.id, inputId: "input-0" },
            },
        ];
        isolate.fallback = { kind: "recover", nodeId: essenceRoll.id, inputId: "input-0" };
        target = query([suppression], item.baseId);
        entry = combine(
            "transfer",
            [
                alterationDonor(
                    { engine, base, buy, craft, currency },
                    "suppression",
                    donor,
                    suppression,
                ),
                isolate.id,
            ],
            target,
        ).id;
    } else if (presetId === "global-defence-chest") {
        const item = base("Necrotic Armour");
        const es = natural(item, "Phantasm's");
        target = query(["BreachBodyAllDefences1", es], item.baseId);
        entry = combine(
            "transfer",
            [
                buy(
                    "defences",
                    "Buy isolated global defences Grasping Mail",
                    prepared("Grasping Mail", ["BreachBodyAllDefences1"]),
                ),
                alterationDonor({ engine, base, buy, craft, currency }, "es", item, es),
            ],
            target,
            [query(["BreachBodyAllDefences1"]), query([es], item.baseId)],
        ).id;
    } else {
        const item = base(presetId === "energy-shield-chest" ? "Vaal Regalia" : "Spine Bow");
        const names =
            presetId === "physical-bow"
                ? ["Merciless", "Dictator's", "Flaring"]
                : presetId === "elemental-bow"
                  ? ["Carbonising", "Crystalising", "Vapourising"]
                  : ["Resplendent", "Unfaltering", "Seraphim's"];
        const mods = names.map((name) => natural(item, name));
        const inputs = mods.map((mod, index) =>
            buy(
                `donor-${index}`,
                `Buy ${names[index]} donor`,
                engine.addStartingMod(item, mod, random),
                query([mod], item.baseId),
            ),
        );
        if (presetId === "energy-shield-chest") {
            const essences = nonNativeEssenceSources(engine, item).filter(
                (entry) => entry.side === "prefix" && entry.rerollsRare,
            );
            for (const id of inputs) {
                const node = nodes.find((node) => node.id === id)!;
                if (node.kind !== "acquire" || node.alternatives[0]?.kind !== "purchase") continue;
                const source = essences.find(
                    (source) =>
                        !engine
                            .mod(source.modId)
                            .groups.some(
                                (group) =>
                                    node.alternatives[0]?.kind === "purchase" &&
                                    node.alternatives[0].item.mods.some((mod) =>
                                        engine.mod(mod.id).groups.includes(group),
                                    ),
                            ),
                );
                if (!source) continue;
                node.alternatives[0].item = engine.addStartingMod(
                    node.alternatives[0].item,
                    source.modId,
                    random,
                    "essence",
                );
                node.name += ` + NNN ${engine.mod(source.modId).name}`;
            }
        }
        const first = combine(
            "pair",
            inputs.slice(0, 2),
            query(mods.slice(0, 2), item.baseId),
            mods.slice(0, 2).map((id) => query([id], item.baseId)),
        );
        target = query(mods, item.baseId);
        const second = combine(
            "second-pair",
            [inputs[0]!, inputs[2]!],
            query([mods[0]!, mods[2]!], item.baseId),
            [query([mods[0]!], item.baseId), query([mods[2]!], item.baseId)],
        );
        first.name = "1p + 1p: build the first prefix pair";
        second.name = "1p + 1p: build the overlapping prefix pair";
        const finish = combine("finish", [first.id, second.id], target, [
            first.output,
            second.output,
        ]);
        finish.name = "2p + 2p: combine all three target prefixes";
        for (const [index, mod] of mods.entries())
            finish.branches.push({
                id: `salvage-${index}`,
                name: `Recover ${names[index]} into pair preparation`,
                query: query([mod], item.baseId),
                destination: {
                    kind: "recover",
                    nodeId: index === 2 ? second.id : first.id,
                    inputId: index === 0 ? "input-0" : "input-1",
                },
            });
        entry = finish.id;
    }
    const graph = projectFromItem(ruleset, base("Spine Bow"), preset.name);
    graph.nodes = nodes;
    graph.entry = entry;
    graph.outcomes[0]!.query = target;
    graph.outcomes[0]!.name = preset.name;
    graph.iterations = 100;
    if (presetId === "tailwind-boots") graph.maxSteps = 100_000;
    validateRulesetGraph(ruleset, graph);
    return validateCraftingGraph(engine.catalog, graph);
}
