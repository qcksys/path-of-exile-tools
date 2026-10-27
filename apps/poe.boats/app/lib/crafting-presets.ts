import { type ItemQuery, itemQuerySchema } from "@poe-tools/item-query";
import type { CraftingItem, CraftingMethod } from "../schemas/crafting";
import type { CraftingGraph, GraphCraftNode, GraphNode } from "../schemas/crafting-graph";
import type { CraftingPreset, CraftingPresetId } from "../schemas/crafting-presets";
import type { CraftingRuleset } from "../schemas/crafting-rulesets";
import { type CraftingEngine, seededRandom } from "./crafting-engine";
import { projectFromItem } from "./crafting-graph-authoring";
import { CRAFTING_GRAPH_ENGINE, validateCraftingGraph } from "./crafting-graph-validation";
import { janusRarityModifier } from "./crafting-janus";
import { elevatedBootsPreset } from "./crafting-preset-boots";
import { helicalRingPreset } from "./crafting-preset-helical";
import {
    alterationDonor,
    presetMod,
    presetNot,
    presetQuery,
    presetRange,
    presetRecover,
} from "./crafting-preset-preparation";
import { rfHelmetPreparation } from "./crafting-preset-rf-preparation";
import { spicySushiPreset, spicySushiPresets } from "./crafting-preset-spicysushi";
import { nonNativeEssenceSources } from "./crafting-recombination";
import { rulesetAllowsPresetPreparation, validateRulesetGraph } from "./crafting-rulesets";

const recombinationAssumption =
    " Recombination assumes self-service at 0 chaos, excluding gold and dust opportunity cost.";

export const craftingPresets: readonly CraftingPreset[] = [
    {
        id: "life-block-shield",
        game: "poe1",
        name: "Life on block shield",
        description:
            "Recombine life recovery on block onto a Shaper Heat-attuned Tower Shield with T1 block chance and +2% all maximum resistances. Rebuild consumed donors and recover usable misses." +
            recombinationAssumption,
    },
    {
        id: "es-block-shield",
        game: "poe1",
        name: "Energy shield on block shield",
        description:
            "Build overlapping flat ES / percent ES and flat ES / block prefix pairs with non-native natural evasion essence donors. Recombine 2p + 2p, retaining Shaper ES recovery on block; recover partial donors." +
            recombinationAssumption,
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
            "Build physical / hybrid and physical / flat prefix pairs separately (1p + 1p), then recombine 2p + 2p for all three. Recover pairs and single-prefix misses into their preparation steps." +
            recombinationAssumption,
    },
    {
        id: "elemental-bow",
        game: "poe1",
        name: "Elemental bow",
        description:
            "Build fire / cold and fire / lightning prefix pairs separately (1p + 1p), then recombine 2p + 2p. Recover pairs and single-prefix misses into their preparation steps." +
            recombinationAssumption,
    },
    {
        id: "suppression-chest",
        game: "poe1",
        name: "Suppression chest",
        description:
            "Roll and isolate T1 suppression on Zodiac Leather, craft a non-native Strength essence donor, then recombine onto Necrotic Armour. Misses return to donor preparation." +
            recombinationAssumption,
    },
    {
        id: "global-defence-chest",
        game: "poe1",
        name: "Global defence chest",
        description:
            "Buy or isolate the global defences Grasping Mail modifier with Annulments, roll and isolate T1 flat energy shield on Necrotic Armour, then recombine. Recover surviving modifiers and rebuild missing donors." +
            recombinationAssumption,
    },
    {
        id: "rarity-helmet",
        game: "poe1",
        name: "Rarity helmet",
        description:
            "Transfer a purchased Janus unveiled rarity suffix alongside normal T1 rarity, life and chaos resistance. Build two pairs, then recombine; recover surviving pairs and single modifiers into preparation." +
            recombinationAssumption,
    },
    {
        id: "energy-shield-chest",
        game: "poe1",
        name: "Triple energy shield chest",
        description:
            "Build flat / percent ES and flat / hybrid ES pairs, then recombine 2p + 2p. NNN evasion/armour essence prefixes improve prefix-count selection without surviving on Vaal Regalia. Recover partial donors." +
            recombinationAssumption,
    },
    {
        id: "strength-helical-ring",
        game: "poe1",
        name: "Replica Alberon's strength-stacking Helical Ring",
        description:
            "70+ memory strands, low-consumption Strength essence, isolated Strength imprint, T1 all Attributes, accuracy/light radius regal, protected T3+ chaos reforge, Unravelling and a Hunter life-on-hit slam. Misses annul or restore the appropriate imprint.",
    },
    ...spicySushiPresets,
];

export function listCraftingPresets(game: "poe1" | "poe2") {
    return craftingPresets.filter((preset) => preset.game === game);
}

const magicDonors: Partial<Record<CraftingPresetId, readonly string[]>> = {
    "life-block-shield": ["block", "max-res", "recovery"],
    "es-block-shield": ["flat", "flat-block"],
    "physical-bow": ["donor-0", "donor-1", "donor-2"],
    "elemental-bow": ["donor-0", "donor-1", "donor-2"],
    "rarity-helmet": ["donor-0-1", "donor-1-0", "donor-1-1"],
    "energy-shield-chest": ["donor-0"],
};

const scouringSources: Partial<Record<CraftingPresetId, readonly string[]>> = {
    "life-block-shield": ["block-make-base", "max-res-make-base", "recovery-make-base"],
    "es-block-shield": ["flat-make-base"],
    "rarity-helmet": ["donor-0-1-make-base", "donor-1-0-make-base", "donor-1-1-make-base"],
};

const extendedScouringSources: Partial<Record<CraftingPresetId, readonly string[]>> = {
    "tailwind-boots": ["tailwind-base-make-base"],
    "suppression-chest": ["suppression-base"],
};

const rfScouringSources: Partial<Record<CraftingPresetId, readonly string[]>> = {
    "sushi-rf-helmet": ["suffixes-make-base"],
};

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
    if (spicySushiPresets.some((entry) => entry.id === presetId)) {
        const prepareSource = [
            "crafting-graph-11",
            "crafting-graph-12",
            "crafting-graph-13",
            "crafting-graph-14",
            "crafting-graph-15",
            "crafting-graph-16",
        ].includes(ruleset.engine);
        ({ entry, target } = spicySushiPreset(
            { engine, base, buy, craft, currency },
            presetId,
            prepareSource,
        ));
        if (
            ["crafting-graph-14", "crafting-graph-15", "crafting-graph-16"].includes(
                ruleset.engine,
            ) &&
            presetId === "sushi-rf-helmet"
        ) {
            const acquisition = nodes.find((node) => node.id === "suffixes");
            const purchase =
                acquisition?.kind === "acquire" ? acquisition.alternatives[0] : undefined;
            if (acquisition?.kind !== "acquire" || purchase?.kind !== "purchase")
                throw new Error("RF suffix preparation requires the original prepared purchase.");
            acquisition.alternatives.push({
                kind: "production",
                id: "make-suffixes",
                name: "Prepare the exact suffixes from a safely scourable Royal Burgonet",
                nodeId: rfHelmetPreparation({ engine, base, buy, craft, currency }, purchase.item),
            });
        }
        if (prepareSource && presetId === "sushi-mercenary-chest") {
            const acquisition = nodes.find((node) => node.id === "fractured-base");
            const roll = nodes.find((node) => node.id === "fossils");
            if (
                acquisition?.kind !== "acquire" ||
                acquisition.alternatives[0]?.kind !== "purchase" ||
                roll?.kind !== "craft" ||
                roll.method.kind !== "fossils"
            )
                throw new Error("The mercenary source preparation is unavailable.");
            const purchase = acquisition.alternatives[0];
            const fossilMethod = roll.method;
            acquisition.alternatives = [
                {
                    id: "buy",
                    name: "Uncrafted, unenchanted fractured source",
                    crafted: false,
                    enchanted: false,
                },
                {
                    id: "buy-crafted",
                    name: "Crafted fractured source; remove crafted modifiers",
                    crafted: true,
                    enchanted: false,
                },
                {
                    id: "buy-enchanted",
                    name: "Enchanted fractured source; remove enchantments",
                    crafted: false,
                    enchanted: true,
                },
                {
                    id: "buy-crafted-enchanted",
                    name: "Crafted and enchanted fractured source; remove both",
                    crafted: true,
                    enchanted: true,
                },
            ].map(({ id, name, crafted, enchanted }) => ({
                ...purchase,
                id,
                name,
                sourcePreparation: {
                    kind: "fractured-fossil-v1",
                    fractureId: purchase.item.mods[0]!.id,
                    crafted,
                    enchanted,
                    fossils: structuredClone(fossilMethod),
                },
            }));
        }
    } else if (presetId === "life-block-shield" || presetId === "es-block-shield") {
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
        if (rulesetAllowsPresetPreparation(ruleset)) {
            const receiver = nodes.find((node) => node.id === "tailwind-base");
            const purchase = receiver?.kind === "acquire" ? receiver.alternatives[0] : undefined;
            if (receiver?.kind !== "acquire" || purchase?.kind !== "purchase")
                throw new Error("Hunter receiver must have a base purchase.");
            const uninfluencedBase = buy(
                "tailwind-base-make-base",
                "Buy uninfluenced Normal Two-Toned Boots",
                engine.validateItem({ ...purchase.item, influences: [] }),
            );
            let source = uninfluencedBase;
            for (const [id, name, method] of [
                ["transmute", "Transmute the uninfluenced base", currency("transmute_to_magic")],
                ["regal", "Regal the magic base", currency("upgrade_magic_to_rare")],
                [
                    "hunter",
                    "Add Hunter influence with a Hunter's Exalted Orb",
                    { kind: "currency", id: "Metadata/Items/AtlasExiles/AddModToRareHunter" },
                ],
                [
                    "scour",
                    "Scour modifiers, keeping Hunter influence",
                    currency("convert_to_normal"),
                ],
            ] satisfies [string, string, CraftingMethod][]) {
                source = craft(`tailwind-base-make-${id}`, name, [source], method).id;
            }
            receiver.alternatives.push({
                kind: "production",
                id: "make-hunter",
                name: "Add Hunter influence to an unrolled base",
                nodeId: source,
            });
            const donor = nodes.find((node) => node.id === "onslaught-base");
            const donorPurchase = donor?.kind === "acquire" ? donor.alternatives[0] : undefined;
            if (donor?.kind !== "acquire" || donorPurchase?.kind !== "purchase")
                throw new Error("Redeemer donor must have a purchase.");
            source = uninfluencedBase;
            for (const [id, name, method] of [
                ["transmute", "Transmute the uninfluenced base", currency("transmute_to_magic")],
                ["regal", "Regal the magic base", currency("upgrade_magic_to_rare")],
                [
                    "redeemer",
                    "Add Redeemer influence with a Redeemer's Exalted Orb",
                    { kind: "currency", id: "Metadata/Items/AtlasExiles/AddModToRareRedeemer" },
                ],
                [
                    "scour",
                    "Scour modifiers, keeping Redeemer influence",
                    currency("convert_to_normal"),
                ],
            ] satisfies [string, string, CraftingMethod][]) {
                source = craft(`onslaught-base-make-${id}`, name, [source], method).id;
            }
            const onslaught = "OnslaughtOnKillInfluence2_";
            const isolated = alterationDonor(
                { engine, base, buy: () => source, craft, currency },
                "onslaught-base-make-isolate",
                engine.validateItem({ ...donorPurchase.item, rarity: "normal", mods: [] }),
                onslaught,
            );
            const regal = craft(
                "onslaught-base-make-regal-elusive",
                "Regal the isolated Onslaught donor for Elusive",
                [isolated],
                currency("upgrade_magic_to_rare"),
            );
            const ready = presetQuery(
                presetMod(onslaught),
                presetMod("ElusiveOnCriticalStrikeInfluence1"),
                presetRange("prefixes", 1, 1),
                presetRange("suffixes", 1, 1),
                { kind: "rarity", values: ["Rare"] },
            );
            const reset = craft(
                "onslaught-base-make-reset",
                "Miss: Scour and reuse the Redeemer base",
                [regal.id],
                currency("convert_to_normal"),
            );
            reset.applyWhen = presetNot(ready);
            reset.branches = [
                {
                    id: "ready",
                    name: "Onslaught and Elusive donor ready",
                    query: ready,
                    destination: { kind: "return" },
                },
            ];
            reset.fallback = presetRecover("onslaught-base-make-isolate-transmute");
            donor.alternatives.push({
                kind: "production",
                id: "make-onslaught",
                name: "Roll and isolate Onslaught, then Regal Elusive",
                nodeId: reset.id,
            });
        }
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
        if (
            ["crafting-graph-14", "crafting-graph-15", "crafting-graph-16"].includes(ruleset.engine)
        ) {
            const donor = nodes.find((node) => node.id === "donor-0-0");
            const purchase = donor?.kind === "acquire" ? donor.alternatives[0] : undefined;
            if (donor?.kind !== "acquire" || purchase?.kind !== "purchase")
                throw new Error("The Magic Janus alternative requires the original Rare purchase.");
            donor.alternatives.push({
                ...purchase,
                id: "buy-magic",
                name: "Buy isolated Magic Janus unveiled rarity donor",
                item: engine.validateItem({ ...purchase.item, rarity: "magic" }),
            });
        }
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
        if (rulesetAllowsPresetPreparation(ruleset)) {
            const wanted = "BreachBodyAllDefences1";
            const sourceId = "defences-make-source";
            const sources = [
                {
                    id: "buy",
                    name: "Buy level 84 global defences with hybrid defences, fire resistance and recharge",
                    level: 84,
                    mods: [
                        wanted,
                        "FireResist7",
                        "FasterStartEnergyShieldRecharge4",
                        "LocalIncreasedArmourEvasionEnergyShieldStunRecovery3",
                    ],
                },
                {
                    id: "buy-two-prefixes",
                    name: "Buy level 85 global defences with uncapped fire resistance armour",
                    level: 85,
                    mods: ["BreachBodyArmourIncreasedByUncappedFireResistance1____", wanted],
                },
                {
                    id: "buy-life",
                    name: "Buy level 85 global defences with life, cold resistance and reflected damage",
                    level: 85,
                    mods: [wanted, "AttackerTakesDamage3", "ColdResist3", "IncreasedLife11"],
                },
            ];
            nodes.push({
                kind: "acquire",
                id: sourceId,
                name: "Acquire a Grasping Mail donor for Annulments",
                output: any,
                choice: { mode: "pinned", alternativeId: "buy" },
                alternatives: sources.map((source) => ({
                    kind: "purchase",
                    id: source.id,
                    name: source.name,
                    item: source.mods.reduce(
                        (input, mod) => engine.addStartingMod(input, mod, random),
                        engine.createItem(base("Grasping Mail").baseId, source.level),
                    ),
                    price: null,
                })),
            });
            const ready = presetQuery(
                presetMod(wanted),
                presetRange("prefixes", 1, 1),
                presetRange("suffixes", 0, 0),
            );
            const isolate = craft(
                "defences-make-isolate",
                "Annul other modifiers; rebuy if global defences is lost",
                [sourceId],
                currency("remove_random_mod"),
                ready,
            );
            isolate.applyWhen = presetNot(ready);
            isolate.branches = [
                {
                    id: "ready",
                    name: "Global defences isolated",
                    query: ready,
                    destination: { kind: "return" },
                },
                {
                    id: "continue",
                    name: "Global defences survives: Annul again",
                    query: presetQuery(presetMod(wanted)),
                    destination: presetRecover(isolate.id),
                },
            ];
            isolate.fallback = { kind: "discard" };
            const donor = nodes.find((node) => node.id === "defences");
            if (donor?.kind !== "acquire")
                throw new Error("Global defences must have a donor acquisition.");
            donor.alternatives.push({
                kind: "production",
                id: "make-isolate",
                name: "Isolate global defences from a Grasping Mail with Annulments",
                nodeId: isolate.id,
            });
        }
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
                node.alternatives[0].name = node.name;
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
    for (const node of nodes) {
        if (node.kind !== "acquire" || !magicDonors[presetId]?.includes(node.id)) continue;
        const rare = node.alternatives[0]!;
        if (rare.kind !== "purchase") throw new Error("Preset donor must be a purchase.");
        node.alternatives.push({
            ...rare,
            id: "buy-magic",
            name: `${rare.name} (Magic)`,
            item: engine.validateItem({ ...rare.item, rarity: "magic" }),
        });
        if (rulesetAllowsPresetPreparation(ruleset) && rare.item.mods.length === 1)
            node.alternatives.push({
                kind: "production",
                id: "make-magic",
                name: "Roll and isolate with Alterations",
                nodeId: alterationDonor(
                    { engine, base, buy, craft, currency },
                    `${node.id}-make`,
                    engine.validateItem({ ...rare.item, rarity: "normal", mods: [] }),
                    rare.item.mods[0]!.id,
                ),
            });
    }
    if (presetId === "energy-shield-chest" && rulesetAllowsPresetPreparation(ruleset)) {
        const nnn = "LocalIncreasedEvasionRating8";
        for (const id of ["donor-1", "donor-2"]) {
            const donor = nodes.find((node) => node.id === id);
            const purchase = donor?.kind === "acquire" ? donor.alternatives[0] : undefined;
            if (donor?.kind !== "acquire" || purchase?.kind !== "purchase")
                throw new Error("NNN ES chest donor must have a purchase.");
            const wanted = purchase.item.mods.find((mod) => mod.id !== nnn)!.id;
            const pair = presetQuery(presetMod(nnn), presetMod(wanted));
            const ready = presetQuery(
                presetMod(nnn),
                presetMod(wanted),
                presetRange("prefixes", 2, 2),
                presetRange("suffixes", 0, 0),
                { kind: "rarity", values: ["Rare"] },
            );
            const essence = craft(
                `${id}-make-essence`,
                `Screaming Doubt until ${engine.mod(wanted).name}`,
                ["donor-0-make-base"],
                { kind: "essence", id: "Metadata/Items/Currency/CurrencyEssenceDoubt3" },
            );
            essence.branches = [
                {
                    id: "pair",
                    name: "NNN evasion and required ES prefix rolled",
                    query: pair,
                    destination: { kind: "return" },
                },
            ];
            essence.fallback = presetRecover(essence.id);
            const isolate = craft(
                `${id}-make-isolate`,
                "Annul extras while keeping both required prefixes",
                [essence.id],
                currency("remove_random_mod"),
                ready,
            );
            isolate.applyWhen = presetNot(ready);
            isolate.branches = [
                {
                    id: "ready",
                    name: "Required ES prefix and NNN donor ready",
                    query: ready,
                    destination: { kind: "return" },
                },
                {
                    id: "continue",
                    name: "Both required prefixes survive: annul another modifier",
                    query: pair,
                    destination: presetRecover(isolate.id),
                },
            ];
            isolate.fallback = presetRecover(essence.id);
            donor.alternatives.push({
                kind: "production",
                id: "make-nnn",
                name: "Roll the ES prefix with Screaming Doubt, then isolate",
                nodeId: isolate.id,
            });
        }
    }
    if (presetId === "es-block-shield" && rulesetAllowsPresetPreparation(ruleset)) {
        const nnn = "LocalIncreasedEvasionRating4";
        const hasNNN = presetQuery(presetMod(nnn));
        const isolated = presetQuery(
            presetMod(nnn),
            presetRange("prefixes", 1, 1),
            presetRange("suffixes", 0, 0),
            { kind: "rarity", values: ["Rare"] },
        );
        for (const id of ["percent", "block"]) {
            const donor = nodes.find((node) => node.id === id);
            const purchase = donor?.kind === "acquire" ? donor.alternatives[0] : undefined;
            if (donor?.kind !== "acquire" || purchase?.kind !== "purchase")
                throw new Error("NNN shield donor must have a purchase.");
            const wanted = purchase.item.mods.find((mod) => mod.id !== nnn)!.id;
            const ready = presetQuery(
                presetMod(nnn),
                presetMod(wanted),
                presetRange("prefixes", 2, 2),
                presetRange("suffixes", 0, 0),
                { kind: "rarity", values: ["Rare"] },
            );
            const essence = craft(
                `${id}-make-essence`,
                "Apply Weeping Essence of Doubt",
                ["flat-make-base"],
                { kind: "essence", id: "Metadata/Items/Currency/CurrencyEssenceDoubt1" },
            );
            const isolate = craft(
                `${id}-make-isolate`,
                "Annul until only the NNN evasion prefix remains",
                [essence.id],
                currency("remove_random_mod"),
            );
            isolate.applyWhen = {
                ...hasNNN,
                groups: [...hasNNN.groups, ...presetNot(isolated).groups],
            };
            isolate.branches = [
                {
                    id: "isolated",
                    name: "Only the NNN prefix remains",
                    query: isolated,
                    destination: { kind: "return" },
                },
                {
                    id: "continue",
                    name: "NNN survives: annul another modifier",
                    query: hasNNN,
                    destination: presetRecover(isolate.id),
                },
            ];
            const exalt = craft(
                `${id}-make-exalt`,
                `Exalt for ${engine.mod(wanted).name} at item level 86`,
                [isolate.id],
                currency("add_mod_to_rare"),
            );
            exalt.applyWhen = isolated;
            const annul = craft(
                `${id}-make-annul`,
                "Miss: annul the unwanted added modifier",
                [exalt.id],
                currency("remove_random_mod"),
            );
            annul.applyWhen = {
                ...hasNNN,
                groups: [...hasNNN.groups, ...presetNot(ready).groups],
            };
            annul.branches = [
                {
                    id: "ready",
                    name: "Required prefix and NNN donor ready",
                    query: ready,
                    destination: { kind: "return" },
                },
                {
                    id: "retry-exalt",
                    name: "Only NNN remains: Exalt again",
                    query: isolated,
                    destination: presetRecover(exalt.id),
                },
            ];
            const reset = craft(
                `${id}-make-reset`,
                "NNN lost: Scour before another Essence",
                [annul.id],
                currency("convert_to_normal"),
            );
            reset.applyWhen = presetNot(hasNNN);
            reset.branches = [
                {
                    id: "ready",
                    name: "Required prefix and NNN donor ready",
                    query: ready,
                    destination: { kind: "return" },
                },
            ];
            reset.fallback = presetRecover(essence.id);
            donor.alternatives.push({
                kind: "production",
                id: "make-nnn",
                name: "Isolate NNN evasion, then Exalt the required prefix",
                nodeId: reset.id,
            });
        }
    }
    if (presetId === "es-block-shield" && rulesetAllowsPresetPreparation(ruleset)) {
        const donor = nodes.find((node) => node.id === "flat-block");
        const magic =
            donor?.kind === "acquire"
                ? donor.alternatives.find((alternative) => alternative.id === "buy-magic")
                : undefined;
        if (donor?.kind !== "acquire" || magic?.kind !== "purchase")
            throw new Error("Flat ES recovery donor must have a Magic purchase.");
        const ready = presetQuery(
            ...magic.item.mods.map((mod) => presetMod(mod.id)),
            presetRange("prefixes", 1, 1),
            presetRange("suffixes", 1, 1),
            { kind: "rarity", values: ["Magic"] },
        );
        const transmute = craft(
            "flat-block-make-transmute",
            "Transmute the unrolled Shaper base",
            ["flat-make-base"],
            currency("transmute_to_magic"),
        );
        const roll = craft(
            "flat-block-make-alteration",
            "Alterations until flat ES and ES recovery on block",
            [transmute.id],
            currency("reroll_magic"),
            ready,
        );
        roll.applyWhen = presetNot(ready);
        roll.branches = [
            {
                id: "ready",
                name: "Exact Magic flat ES and recovery donor ready",
                query: ready,
                destination: { kind: "return" },
            },
        ];
        roll.fallback = presetRecover(roll.id);
        donor.alternatives.push({
            kind: "production",
            id: "make-magic",
            name: "Roll the Magic flat ES and recovery pair with Alterations",
            nodeId: roll.id,
        });
    }
    if (
        (presetId === "life-block-shield" || presetId === "es-block-shield") &&
        rulesetAllowsPresetPreparation(ruleset)
    ) {
        const sources =
            presetId === "life-block-shield"
                ? [
                      {
                          id: "heat",
                          targets: ["block-make-base", "max-res-make-base"],
                          mod: "Strength7",
                          name: "Buy Magic Shaper Heat-attuned Tower Shield with Strength",
                      },
                      {
                          id: "pinnacle",
                          targets: ["recovery-make-base"],
                          mod: "DisplaySocketedGemsGetReducedReservationUber2",
                          name: "Buy Magic Shaper Pinnacle Tower Shield with reservation efficiency",
                      },
                  ]
                : [
                      {
                          id: "titanium",
                          targets: ["flat-make-base"],
                          mod: "LocalIncreasedBlockPercentage7",
                          name: "Buy Magic Shaper Titanium Spirit Shield with T1 block",
                      },
                  ];
        for (const source of sources) {
            const targets = source.targets.map((id) => {
                const node = nodes.find((node) => node.id === id);
                if (node?.kind !== "acquire" || node.alternatives[0]?.kind !== "purchase")
                    throw new Error("Shield preparation must have a Normal base purchase.");
                return { node, item: node.alternatives[0].item };
            });
            const first = targets[0]!;
            const input = buy(
                `shield-make-${source.id}-base`,
                source.name,
                engine.addStartingMod(
                    { ...first.item, rarity: "magic" },
                    source.mod,
                    random,
                    engine.catalog.crafting.modRules[source.mod]?.influence != null
                        ? "influence"
                        : "natural",
                ),
            );
            if (source.id === "titanium") {
                const acquisition = nodes.find((node) => node.id === input);
                if (
                    acquisition?.kind !== "acquire" ||
                    acquisition.alternatives[0]?.kind !== "purchase"
                )
                    throw new Error("Titanium preparation must have a Magic base purchase.");
                acquisition.alternatives.push(
                    {
                        kind: "purchase",
                        id: "buy-rare-block",
                        name: "Buy Rare Shaper Titanium Spirit Shield with only T1 block",
                        item: { ...acquisition.alternatives[0].item, rarity: "rare" },
                        price: null,
                    },
                    {
                        kind: "purchase",
                        id: "buy-magic-life-recovery",
                        name: "Buy Magic Shaper Titanium Spirit Shield with ES/Mana and life recovery",
                        item: engine.addStartingMod(
                            engine.addStartingMod(
                                { ...first.item, rarity: "magic" },
                                "LocalBaseEnergyShieldAndMana3",
                                random,
                                "natural",
                            ),
                            "RecoverLifePercentOnBlockUber1_",
                            random,
                            "influence",
                        ),
                        price: null,
                    },
                );
            }
            const scour = craft(
                `shield-make-${source.id}-scour`,
                `Scour the ${source.id === "titanium" ? "" : "Magic "}Shaper ${engine.base(first.item).name}`,
                [input],
                currency("convert_to_normal"),
                first.node.output,
            );
            for (const { node } of targets)
                node.alternatives.push({
                    kind: "production",
                    id: "make-scour",
                    name:
                        source.id === "titanium"
                            ? "Scour a Shaper Titanium base"
                            : "Scour a Magic Shaper base",
                    nodeId: scour.id,
                });
        }
    }
    const influenceSourceIds: string[] = [];
    if (
        ["crafting-graph-15", "crafting-graph-16"].includes(ruleset.engine) &&
        (presetId === "life-block-shield" || presetId === "es-block-shield")
    ) {
        const targetId = presetId === "life-block-shield" ? "recovery-make-base" : "flat-make-base";
        const sources = [
            { id: targetId, targets: [targetId] },
            ...(ruleset.engine === "crafting-graph-16" && presetId === "life-block-shield"
                ? [{ id: "shield-make-heat", targets: ["block-make-base", "max-res-make-base"] }]
                : []),
        ];
        for (const definition of sources) {
            const targets = definition.targets.map((id) => {
                const node = nodes.find((node) => node.id === id);
                const purchase = node?.kind === "acquire" ? node.alternatives[0] : undefined;
                if (node?.kind !== "acquire" || purchase?.kind !== "purchase")
                    throw new Error(
                        "Influence preparation requires the original Normal base purchase.",
                    );
                return { node, item: purchase.item };
            });
            const item = targets[0]!.item;
            if (targets.some((target) => JSON.stringify(target.item) !== JSON.stringify(item)))
                throw new Error(
                    "A shared influence source requires identical Normal base checkpoints.",
                );
            const name = engine.base(item).name;
            let source = buy(
                `${definition.id}-influence-base`,
                `Buy uninfluenced Normal ${name}`,
                engine.validateItem({ ...item, influences: [] }),
            );
            const acquisition = nodes.find((node) => node.id === source);
            if (acquisition?.kind !== "acquire" || acquisition.alternatives[0]?.kind !== "purchase")
                throw new Error("Influence preparation requires an uninfluenced base purchase.");
            acquisition.alternatives[0].sourcePreparation = { kind: "influence-ready-v1" };
            influenceSourceIds.push(source);
            for (const [id, label, method] of [
                ["transmute", "Transmute the uninfluenced base", currency("transmute_to_magic")],
                ["regal", "Regal the magic base", currency("upgrade_magic_to_rare")],
                [
                    "shaper",
                    "Add Shaper influence with a Shaper's Exalted Orb",
                    { kind: "currency", id: "Metadata/Items/Currency/CurrencyAddModToRareShaper" },
                ],
                [
                    "scour",
                    "Scour modifiers, keeping Shaper influence",
                    currency("convert_to_normal"),
                ],
            ] satisfies [string, string, CraftingMethod][]) {
                source = craft(`${definition.id}-influence-${id}`, label, [source], method).id;
            }
            for (const { node } of targets)
                node.alternatives.push({
                    kind: "production",
                    id: "make-shaper",
                    name: `Add Shaper influence to an unrolled ${name}`,
                    nodeId: source,
                });
        }
    }
    if (
        [
            "crafting-graph-12",
            "crafting-graph-13",
            "crafting-graph-14",
            "crafting-graph-15",
            "crafting-graph-16",
        ].includes(ruleset.engine)
    ) {
        const sourceIds = [
            ...(scouringSources[presetId] ?? []),
            ...([
                "crafting-graph-13",
                "crafting-graph-14",
                "crafting-graph-15",
                "crafting-graph-16",
            ].includes(ruleset.engine)
                ? (extendedScouringSources[presetId] ?? [])
                : []),
            ...(["crafting-graph-14", "crafting-graph-15", "crafting-graph-16"].includes(
                ruleset.engine,
            )
                ? (rfScouringSources[presetId] ?? [])
                : []),
            ...influenceSourceIds,
            ...(ruleset.engine === "crafting-graph-16" && presetId === "energy-shield-chest"
                ? ["donor-0-make-base"]
                : []),
        ];
        for (const id of sourceIds) {
            const node = nodes.find((entry) => entry.id === id);
            const purchase = node?.kind === "acquire" ? node.alternatives[0] : undefined;
            if (
                node?.kind !== "acquire" ||
                purchase?.kind !== "purchase" ||
                purchase.item.rarity !== "normal"
            )
                throw new Error("Scouring preparation must have a Normal base purchase.");
            node.alternatives.push(
                ...[
                    {
                        id: "buy-scour",
                        name: "Uncrafted, unenchanted Magic/Rare source; Scour",
                        crafted: false,
                        enchanted: false,
                    },
                    {
                        id: "buy-scour-crafted",
                        name: "Crafted Magic/Rare source; remove crafts and Scour",
                        crafted: true,
                        enchanted: false,
                    },
                    {
                        id: "buy-scour-enchanted",
                        name: "Enchanted Magic/Rare source; remove enchantments and Scour",
                        crafted: false,
                        enchanted: true,
                    },
                    {
                        id: "buy-scour-crafted-enchanted",
                        name: "Crafted and enchanted Magic/Rare source; remove both and Scour",
                        crafted: true,
                        enchanted: true,
                    },
                ].map(({ id, name, crafted, enchanted }) => ({
                    kind: "purchase" as const,
                    id,
                    name,
                    item: structuredClone(purchase.item),
                    price: null,
                    sourcePreparation: { kind: "scour-v1" as const, crafted, enchanted },
                })),
            );
            if (
                ["crafting-graph-14", "crafting-graph-15", "crafting-graph-16"].includes(
                    ruleset.engine,
                ) &&
                rfScouringSources[presetId]?.includes(id)
            ) {
                node.alternatives = node.alternatives.filter((entry) => entry.id !== "buy");
                node.choice = { mode: "pinned", alternativeId: "buy-scour" };
            }
        }
    }
    const graph = projectFromItem(ruleset, base("Spine Bow"), preset.name);
    graph.nodes = nodes;
    graph.entry = entry;
    graph.outcomes[0]!.query = target;
    graph.outcomes[0]!.name = preset.name;
    graph.iterations = 100;
    if (nodes.some((node) => node.kind === "craft" && node.method.kind === "recombine"))
        graph.prices["service:recombine"] = {
            amount: 0,
            currency: graph.currency,
            source: "manual",
            confidence: null,
        };
    if (presetId === "tailwind-boots") graph.maxSteps = 100_000;
    const validated = validateRulesetGraph(ruleset, graph);
    return ruleset.engine === CRAFTING_GRAPH_ENGINE
        ? validateCraftingGraph(engine.catalog, validated)
        : validated;
}
