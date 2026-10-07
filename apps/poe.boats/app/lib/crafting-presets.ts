import { type ItemQuery, itemQuerySchema } from "@poe-tools/item-query";
import type { CraftingItem, CraftingMethod } from "../schemas/crafting";
import type { CraftingGraph, GraphCraftNode, GraphNode } from "../schemas/crafting-graph";
import type { CraftingPreset, CraftingPresetId } from "../schemas/crafting-presets";
import type { CraftingRuleset } from "../schemas/crafting-rulesets";
import { type CraftingEngine, seededRandom } from "./crafting-engine";
import { projectFromItem } from "./crafting-graph-authoring";
import { validateCraftingGraph } from "./crafting-graph-validation";
import { validateRulesetGraph } from "./crafting-rulesets";

export const craftingPresets: readonly CraftingPreset[] = [
    {
        id: "life-block-shield",
        game: "poe1",
        name: "Life on block shield",
        description:
            "Transmute a Shaper Pinnacle Tower Shield, alter until life recovery on block, then regal. Misses reuse the magic shield.",
    },
    {
        id: "es-block-shield",
        game: "poe1",
        name: "Energy shield on block shield",
        description:
            "Transmute a Shaper Titanium Spirit Shield, alter until energy shield recovery on block, then regal. Misses reuse the magic shield.",
    },
    {
        id: "tailwind-boots",
        game: "poe1",
        name: "Tailwind and Elusive boots",
        description:
            "Buy boots with isolated Hunter Tailwind and Redeemer Elusive. Use an Awakener's Orb to keep both on the target boots; other rolls remain unconstrained.",
    },
    {
        id: "physical-bow",
        game: "poe1",
        name: "Physical bow",
        description:
            "Combine T1 physical damage and hybrid physical donors, then add T1 flat physical damage. Recover usable partial results into their matching inputs.",
    },
    {
        id: "elemental-bow",
        game: "poe1",
        name: "Elemental bow",
        description:
            "Combine T1 fire and cold donors, then add T1 lightning damage. Recover usable partial results into their matching inputs.",
    },
    {
        id: "suppression-chest",
        game: "poe1",
        name: "Suppression chest",
        description:
            "Transfer isolated T1 suppression from Zodiac Leather onto Necrotic Armour using an isolated non-native Strength essence donor. The target requires the Necrotic base.",
    },
    {
        id: "global-defence-chest",
        game: "poe1",
        name: "Global defence chest",
        description:
            "Buy an isolated 50% global defences Grasping Mail donor and a flat energy shield Necrotic Armour donor, then recombine. Keep only both modifiers on Necrotic Armour.",
    },
    {
        id: "rarity-helmet",
        game: "poe1",
        name: "Rarity helmet",
        description:
            "Buy a Hubris Circlet with fractured T1 rarity prefix. Repeat Deafening Essences of Greed until T1 rarity suffix; keep the guaranteed life and fractured rarity.",
    },
    {
        id: "energy-shield-chest",
        game: "poe1",
        name: "Triple energy shield chest",
        description:
            "Combine T1 flat and percent energy shield donors, then add hybrid energy shield. Recover usable partial results into their matching inputs.",
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
    const retry = (node: GraphCraftNode, target: ItemQuery) => {
        node.output = target;
        node.branches = [
            { id: "hit", name: "Target modifiers", query: target, destination: { kind: "return" } },
        ];
        node.fallback = { kind: "recover", nodeId: node.id, inputId: "input-0" };
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
        const item = base(life ? "Pinnacle Tower Shield" : "Titanium Spirit Shield");
        const mod = life
            ? "RecoverLifePercentOnBlockUber1_"
            : "RecoverEnergyShieldPercentOnBlockUber1";
        const influence = engine.catalog.crafting.modRules[mod]?.influence;
        if (influence == null) throw new Error("Shaper block recovery is unavailable.");
        item.influences = [influence];
        target = query([mod], item.baseId);
        const transmute = craft(
            "transmute",
            "Transmute shield",
            [buy("base", "Buy Shaper shield base", item)],
            currency("transmute_to_magic"),
        );
        const alter = craft(
            "alter",
            "Alter until recovery on block",
            [transmute.id],
            currency("reroll_magic"),
        );
        alter.applyWhen = itemQuerySchema.parse({
            game: preset.game,
            groups: [{ type: "not", filters: [{ kind: "mod", ids: [mod] }] }],
        });
        retry(alter, target);
        entry = craft(
            "regal",
            "Regal the recovery shield",
            [alter.id],
            currency("upgrade_magic_to_rare"),
            target,
        ).id;
    } else if (presetId === "tailwind-boots") {
        const tailwind = "TailwindOnCriticalStrikeInfluence1";
        const elusive = "ElusiveOnCriticalStrikeInfluence1";
        const item = prepared("Two-Toned Boots", [tailwind]);
        target = query([tailwind, elusive], item.baseId);
        entry = craft(
            "awaken",
            "Awakener's Orb: keep Tailwind and Elusive",
            [
                buy("target", "Buy isolated Tailwind target boots", item, query([tailwind])),
                buy(
                    "donor",
                    "Buy isolated Elusive donor boots",
                    prepared("Two-Toned Boots", [elusive]),
                    query([elusive]),
                ),
            ],
            currency("transfer_item_influence"),
            target,
        ).id;
    } else if (presetId === "rarity-helmet") {
        const item = prepared("Hubris Circlet", ["ItemFoundRarityIncreasePrefix3"]);
        item.mods[0]!.fractured = true;
        const essence = engine.catalog.crafting.essences.find(
            (entry) => entry.name === "Deafening Essence of Greed",
        );
        if (!essence?.mods.Helmet) throw new Error("Helmet life essence is unavailable.");
        target = query(
            [item.mods[0]!.id, "ItemFoundRarityIncrease4", essence.mods.Helmet],
            item.baseId,
        );
        const node = craft(
            "essence",
            "Essence until T1 rarity suffix",
            [buy("base", "Buy fractured T1 rarity helmet", item)],
            { kind: "essence", id: essence.id },
        );
        retry(node, target);
        entry = node.id;
    } else if (presetId === "suppression-chest") {
        const donor = base("Zodiac Leather");
        const suppression = natural(donor, "of Nullification");
        const essence = engine.catalog.crafting.essences.find(
            (entry) => entry.name === "Screaming Essence of Rage",
        );
        if (!essence?.mods["Body Armour"]) throw new Error("Strength essence is unavailable.");
        const item = engine.addStartingMod(
            base("Necrotic Armour"),
            essence.mods["Body Armour"],
            random,
            "essence",
        );
        target = query([suppression], item.baseId);
        entry = combine(
            "transfer",
            [
                buy(
                    "suppression",
                    "Buy isolated T1 suppression donor",
                    engine.addStartingMod(donor, suppression, random),
                ),
                buy("strength", "Buy isolated non-native Strength donor", item),
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
                buy(
                    "es",
                    "Buy T1 flat ES Necrotic Armour",
                    engine.addStartingMod(item, es, random),
                ),
            ],
            target,
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
        const first = combine(
            "pair",
            inputs.slice(0, 2),
            query(mods.slice(0, 2), item.baseId),
            mods.slice(0, 2).map((id) => query([id], item.baseId)),
        );
        target = query(mods, item.baseId);
        entry = combine("finish", [first.id, inputs[2]!], target, [
            first.output,
            query([mods[2]!], item.baseId),
        ]).id;
    }
    const graph = projectFromItem(ruleset, base("Spine Bow"), preset.name);
    graph.nodes = nodes;
    graph.entry = entry;
    graph.outcomes[0]!.query = target;
    graph.outcomes[0]!.name = preset.name;
    graph.iterations = 100;
    validateRulesetGraph(ruleset, graph);
    return validateCraftingGraph(engine.catalog, graph);
}
