import type { ItemQuery } from "@poe-tools/item-query";
import type { CraftingItem, CraftingMethod } from "../schemas/crafting";
import type { GraphCraftNode } from "../schemas/crafting-graph";
import type { CraftingPreset, CraftingPresetId } from "../schemas/crafting-presets";
import { seededRandom } from "./crafting-engine";
import {
    presetMod as mod,
    presetNot as not,
    type PresetBuilder,
    presetQuery as query,
    presetRecover as recover,
} from "./crafting-preset-preparation";

const recombination =
    " Recombination assumes self-service at 0 chaos, excluding gold and dust opportunity cost.";
const purchases = " Prepared purchases have unknown prices; destructive misses buy fresh inputs.";

export const spicySushiPresets: readonly CraftingPreset[] = [
    {
        id: "sushi-rf-totem-shield",
        game: "poe1",
        name: "Sushi's RF Scorching Ray shield",
        description:
            "Allflame 3.29: finish prepared Shaper Heat-attuned suffixes with an influence reforge for +1 totem, a blocked Allflame Foulborn spell-block slam and crafted life." +
            purchases,
    },
    {
        id: "sushi-rf-helmet",
        game: "poe1",
        name: "Sushi's magic find RF helmet",
        description:
            "Allflame 3.29: start from the Horror/Burning Damage recombination checkpoint, elevate Burning Damage, reforge prefix rarity, then Allflame slam life and craft rare/unique rarity." +
            purchases,
    },
    {
        id: "sushi-mercenary-chest",
        game: "poe1",
        name: "Sushi's Luminary mercenary chest",
        description:
            "Allflame 3.29: finish a purchased fractured Breach-crit Conquest Lamellar with Hollow/Glyphic/Jagged/Fundamental fossils for Onslaught and an Abyss socket, then Eldritch armour/evasion prefixes and crafted life." +
            purchases,
    },
    {
        id: "sushi-spectre-boots",
        game: "poe1",
        name: "Sushi's Luminary Spectre boots",
        description:
            "Allflame 3.29: finish prepared Elder Leviathan Greaves with +2 socketed minion gems and unveiled movement speed. Elevate Spectre levels, craft life, then Allflame slam T2+ resistance; misses restart instead of assuming successful lock previews." +
            purchases,
    },
    {
        id: "sushi-luminary-shield",
        game: "poe1",
        name: "Sushi's Luminary double-block shield",
        description:
            "Allflame 3.29: add Pantheon aspects to prepared Shaper shield donors and recombine attack block, spell block, reduced critical damage, maximum fire resistance and life recovery onto Heat-attuned Tower Shield." +
            purchases +
            recombination,
    },
];

function helpers(builder: PresetBuilder) {
    const { engine, base, buy, craft, currency } = builder;
    const random = seededRandom(42);
    const item = (name: string, ids: string[]): CraftingItem =>
        ids.reduce(
            (value, id) =>
                engine.addStartingMod(
                    value,
                    id,
                    random,
                    engine.catalog.crafting.modRules[id]?.influence != null
                        ? "influence"
                        : engine.mod(id).is_essence_only
                          ? "essence"
                          : "natural",
                ),
            base(name),
        );
    const bench = (id: string): CraftingMethod => {
        const recipe = engine.catalog.crafting.bench.find((entry) => entry.mod === id);
        if (!recipe) throw new Error(`Preset bench craft is unavailable: ${id}`);
        return { kind: "bench", id: recipe.id };
    };
    const boat = (action: string): CraftingMethod => {
        const method = currency(action);
        if (method.kind !== "currency") throw new Error("Expected a currency method.");
        return { ...method, allflame: true };
    };
    const step = (id: string, name: string, source: string, method: CraftingMethod) =>
        craft(id, name, [source], method);
    const keep = (node: GraphCraftNode, target: ItemQuery, retry?: string) => {
        node.output = target;
        node.branches = [
            {
                id: "keep",
                name: "Keep the required result",
                query: target,
                destination: { kind: "return" },
            },
        ];
        node.fallback = retry ? recover(retry) : { kind: "discard" };
        return node.id;
    };
    const trim = (
        id: string,
        source: string,
        ids: string[],
        retry?: { query: ItemQuery; nodeId: string },
    ) => {
        const required = query(...ids.map((id) => mod(id)));
        const counts = query(
            ...(["prefix", "suffix"] as const).map((side) => ({
                kind: "range" as const,
                field: side === "prefix" ? ("prefixes" as const) : ("suffixes" as const),
                value: { max: ids.filter((id) => engine.mod(id).generation_type === side).length },
            })),
        );
        const node = step(
            id,
            "Allflame annul extras; select surviving required modifiers",
            source,
            boat("remove_random_mod"),
        );
        node.applyWhen = not(counts);
        keep(node, { ...required, groups: [...required.groups, ...counts.groups] });
        node.branches.push({
            id: "again",
            name: "Required modifiers survive: annul another extra",
            query: required,
            destination: recover(id),
        });
        if (retry)
            node.branches.push({
                id: "rebuild-prefix",
                name: "Elevated suffixes survive: reforge rarity again",
                query: retry.query,
                destination: recover(retry.nodeId),
            });
        return node.id;
    };
    const purchase = (id: string, name: string, value: CraftingItem) =>
        buy(
            id,
            name,
            value,
            query(
                { kind: "base", field: "baseId", values: [value.baseId] },
                ...value.mods.map((rolled) => ({
                    ...mod(rolled.id),
                    fractured: rolled.fractured,
                    crafted: rolled.crafted,
                })),
            ),
        );
    const lockSuffixes = (id: string, source: string) =>
        step(
            id,
            "Suffixes cannot be changed",
            source,
            bench("DexMasterItemGenerationCannotChangeSuffixes"),
        ).id;
    const life = "EinharMasterIncreasedLife4";
    return { ...builder, item, bench, boat, step, keep, trim, purchase, lockSuffixes, life };
}

export function spicySushiPreset(builder: PresetBuilder, id: CraftingPresetId) {
    const {
        engine,
        item,
        bench,
        boat,
        step,
        keep,
        trim,
        purchase,
        lockSuffixes,
        life,
        currency,
        craft,
    } = helpers(builder);
    if (id === "sushi-rf-totem-shield") {
        const suffixes = [
            "MaximumFireResist3",
            "RecoverLifePercentOnBlockUber1_",
            "ReducedExtraDamageFromCrits3",
        ];
        const start = purchase(
            "suffixes",
            "Buy Shaper Heat-attuned shield with max fire, recovery and T2 crit reduction",
            item("Heat-attuned Tower Shield", suffixes),
        );
        const totem = "MaximumTotemUber1";
        const reforge = step(
            "totem",
            "Reforge Influence for +1 maximum totem",
            lockSuffixes("lock", start),
            { kind: "harvest", id: "BossInfluence1" },
        );
        keep(reforge, query(...[...suffixes, totem].map((id) => mod(id))));
        const clean = trim("isolate-totem", reforge.id, [...suffixes, totem]);
        const block = step(
            "block-armour",
            "Block flat armour before the Foulborn slam",
            clean,
            bench("EinharMasterFlatArmour1"),
        );
        const slam = step(
            "spell-block",
            "Allflame Foulborn Exalt: select T1 spell block",
            block.id,
            boat("mutated_add_mod_to_rare"),
        );
        const spellBlock = "ShieldSpellBlockPercentage6";
        keep(slam, query(mod(spellBlock)));
        const remove = step("remove-block", "Remove the temporary armour craft", slam.id, {
            kind: "bench",
            id: "bench:84",
        });
        const finish = step("life", "Craft maximum life", remove.id, bench(life));
        return {
            entry: finish.id,
            target: query(...[...suffixes, totem, spellBlock, life].map((id) => mod(id))),
        };
    }
    if (id === "sushi-rf-helmet") {
        const horror = "SocketedGemsDealMoreElementalDamageEssence1";
        const burning = "IncreasedBurningDamageSupportedUber3";
        const elevated = "IncreasedBurningDamageSupportedUberMaven";
        const start = purchase(
            "suffixes",
            "Buy Elder Royal Burgonet with isolated Horror and level 20 Burning Damage",
            item("Royal Burgonet", [horror, burning]),
        );
        const influence = step(
            "influence",
            "Protect suffixes and reforge a sacrificial Elder modifier",
            lockSuffixes("lock-elevate", start),
            { kind: "harvest", id: "BossInfluence1" },
        );
        const sacrifices = engine
            .pool(item("Royal Burgonet", [horror, burning]))
            .filter((entry) => engine.catalog.crafting.modRules[entry.id]?.influence != null)
            .map((entry) => entry.id);
        keep(influence, query(mod(...sacrifices)));
        const elevate = step(
            "elevate",
            "Allflame Orb of Dominance: select level 25 Burning Damage",
            influence.id,
            boat("upgrade_influence_mod"),
        );
        keep(elevate, query(mod(horror), mod(elevated)));
        const core = query(mod(horror), mod(elevated));
        const suffixCleanup = step(
            "clean-suffixes",
            "Allflame annul an unwanted third suffix",
            elevate.id,
            boat("remove_random_mod"),
        );
        suffixCleanup.applyWhen = query({ kind: "range", field: "suffixes", value: { min: 3 } });
        keep(
            suffixCleanup,
            query(mod(horror), mod(elevated), {
                kind: "range",
                field: "suffixes",
                value: { max: 2 },
            }),
        );
        suffixCleanup.branches.push({
            id: "again",
            name: "Horror and Burning survive: try another annul",
            query: core,
            destination: recover(suffixCleanup.id),
        });
        const open = step(
            "open-prefix",
            "Full prefixes: Allflame annul space for suffix protection",
            suffixCleanup.id,
            boat("remove_random_mod"),
        );
        open.applyWhen = query({ kind: "range", field: "prefixes", value: { min: 3 } });
        keep(
            open,
            query(mod(horror), mod(elevated), {
                kind: "range",
                field: "prefixes",
                value: { max: 2 },
            }),
        );
        open.branches.push({
            id: "again",
            name: "Required suffixes survive: make prefix space",
            query: core,
            destination: recover(open.id),
        });
        const protect = step(
            "protect-cleanup",
            "Protect elevated suffixes before scouring prefixes",
            open.id,
            bench("DexMasterItemGenerationCannotChangeSuffixes"),
        );
        protect.applyWhen = query({ kind: "range", field: "prefixes", value: { min: 1 } });
        const scour = step(
            "scour-prefixes",
            "Scour unwanted prefixes while preserving Horror and Burning",
            protect.id,
            currency("convert_to_normal"),
        );
        scour.applyWhen = query({ kind: "range", field: "prefixes", value: { min: 1 } });
        keep(scour, core);
        const rarity = "ItemFoundRarityIncreasePrefix3";
        const reforge = step(
            "rarity",
            "Protect suffixes and reforge Drop for T1 prefix rarity",
            lockSuffixes("lock-rarity", scour.id),
            { kind: "harvest", id: "ReforgeDrop" },
        );
        keep(reforge, query(mod(rarity)), suffixCleanup.id);
        const prefix = trim("isolate-rarity", reforge.id, [horror, elevated, rarity], {
            query: core,
            nodeId: suffixCleanup.id,
        });
        const block = step(
            "block-armour",
            "Block flat armour before the life slam",
            prefix,
            bench("EinharMasterFlatArmour1"),
        );
        const slam = step(
            "life-slam",
            "Allflame Foulborn Exalt: accept T4 or better life",
            block.id,
            boat("mutated_add_mod_to_rare"),
        );
        const lives = ["IncreasedLife6", "IncreasedLife7", "IncreasedLife8", "IncreasedLife9"];
        keep(slam, query(mod(...lives)));
        const remove = step("remove-block", "Remove the temporary armour craft", slam.id, {
            kind: "bench",
            id: "bench:84",
        });
        const rarityCraft = "JunMaster2ItemRarityFromRareAndUniqueEnemies3";
        const finish = step(
            "crafted-rarity",
            "Craft rarity from slain rare and unique enemies",
            remove.id,
            bench(rarityCraft),
        );
        return {
            entry: finish.id,
            target: query(mod(horror), mod(elevated), mod(rarity), mod(...lives), mod(rarityCraft)),
        };
    }
    if (id === "sushi-mercenary-chest") {
        const critical = "BreachBodyCriticalChanceIncreasedByUncappedLightningResistance1";
        const chest = item("Conquest Lamellar", [critical]);
        chest.mods[0]!.fractured = true;
        const start = purchase(
            "fractured-base",
            "Buy Conquest Lamellar with fractured Breach critical chance",
            engine.validateItem(chest),
        );
        const fossils = [
            "Hollow Fossil",
            "Glyphic Fossil",
            "Jagged Fossil",
            "Fundamental Fossil",
        ].map((name) => engine.catalog.crafting.fossils.find((entry) => entry.name === name)!.id);
        const resonator = engine.catalog.crafting.currencies.find(
            (entry) => entry.id === "Metadata/Items/Delve/DelveStackableSocketableCurrencyReroll4",
        )!;
        const roll = step(
            "fossils",
            "Hollow, Glyphic, Jagged and Fundamental: Onslaught plus Abyss socket",
            start,
            {
                kind: "fossils",
                ids: fossils,
                resonator: resonator.id,
                logic: "additive",
                allflame: true,
            },
        );
        const suffixes = [critical, "DelveAbyssJewelSocket1", "OnslaughtWhenHitNewEssence1"];
        keep(roll, query(...suffixes.map((id) => mod(id))), roll.id);
        const eater = step(
            "eater",
            "Replace Eater implicit with Lesser Ichor",
            roll.id,
            currency("add_great_tangle_implicit_1"),
        );
        const implicit = step(
            "exarch",
            "Greater Ember: establish Exarch dominance for prefix crafting",
            eater.id,
            currency("add_cleansing_fire_implicit_2"),
        );
        const defences = [
            mod("LocalBaseArmourAndEvasionRating7", "LocalBaseArmourAndEvasionRating8"),
            mod("LocalIncreasedArmourAndEvasion7", "LocalIncreasedArmourAndEvasion8"),
        ];
        const prefixes = step(
            "prefixes",
            "Eldritch Chaos: T2+ flat and increased armour/evasion",
            implicit.id,
            currency("reroll_rare_eldritch"),
        );
        keep(prefixes, query(...defences), prefixes.id);
        const clear = step(
            "clear-prefix",
            "Full prefixes: Eldritch Annul to make room for life",
            prefixes.id,
            currency("remove_random_mod_eldritch"),
        );
        clear.applyWhen = query({ kind: "range", field: "prefixes", value: { min: 3 } });
        keep(clear, query(...defences), prefixes.id);
        const finish = step(
            "life",
            "Craft maximum life",
            clear.id,
            bench("EinharMasterIncreasedLife5_"),
        );
        return {
            entry: finish.id,
            target: query(
                ...suffixes.map((id) => mod(id)),
                ...defences,
                mod("EinharMasterIncreasedLife5_"),
            ),
        };
    }
    if (id === "sushi-spectre-boots") {
        const minion = "LocalIncreaseSocketedMinionGemLevelDelve";
        const speed = "JunMasterVeiledMovementVelocityAndCannotBeChilled__";
        const spectre = "GlobalRaiseSpectreGemLevelUber1";
        const elevated = "GlobalRaiseSpectreGemLevelUberMaven";
        const prepared = item("Leviathan Greaves", [
            minion,
            speed,
            spectre,
            "ChanceToAvoidStunUber3",
        ]);
        const start = purchase(
            "prepared-boots",
            "Buy Elder minion/movement boots with Spectre levels and sacrificial stun avoidance",
            prepared,
        );
        const elevate = step(
            "elevate",
            "Allflame Dominance: select +2 Raise Spectre levels",
            start,
            boat("upgrade_influence_mod"),
        );
        keep(elevate, query(mod(minion), mod(speed), mod(elevated)));
        const block = step(
            "life",
            "Craft life to fill prefixes before the resistance slam",
            elevate.id,
            bench(life),
        );
        const resistances = [
            "FireResist7",
            "FireResist8",
            "ColdResist7",
            "ColdResist8",
            "LightningResist7",
            "LightningResist8",
        ];
        const finish = step(
            "resistance",
            "Allflame Foulborn Exalt: accept T2+ elemental resistance",
            block.id,
            boat("mutated_add_mod_to_rare"),
        );
        const target = query(
            mod(minion),
            mod(speed),
            mod(elevated),
            mod(life),
            mod(...resistances),
        );
        keep(finish, target);
        return { entry: finish.id, target };
    }
    if (id === "sushi-luminary-shield") {
        const block = "LocalIncreasedBlockPercentage6";
        const spellBlock = "ShieldSpellBlockPercentage5";
        const critical = "ReducedExtraDamageFromCrits4__";
        const maximum = "MaximumFireResist3";
        const recovery = "RecoverLifePercentOnBlockUber1_";
        const receiver = item("Heat-attuned Tower Shield", [block, critical, maximum]);
        receiver.influences = [engine.catalog.crafting.modRules[recovery]!.influence!];
        const donor = engine.addStartingMod(
            item("Harmonic Spirit Shield", [
                spellBlock,
                "LocalIncreasedEnergyShield3",
                "IncreasedMana3",
                recovery,
                "Intelligence6",
            ]),
            "Dexterity6",
            seededRandom(42),
            "attribute",
        );
        const left = step(
            "receiver-aspect",
            "Add a non-native Pantheon aspect to the receiver",
            purchase(
                "receiver",
                "Buy Shaper Heat-attuned shield with block, crit reduction and max fire",
                receiver,
            ),
            boat("add_pantheon_aspect"),
        );
        const right = step(
            "donor-aspect",
            "Add a non-native Pantheon aspect to the donor",
            purchase(
                "donor",
                "Buy Shaper spell-block/recovery donor with non-native ES, mana and Dexterity",
                donor,
            ),
            boat("add_pantheon_aspect"),
        );
        const target = query(
            { kind: "base", field: "baseId", values: [receiver.baseId] },
            ...[block, spellBlock, critical, maximum, recovery].map((id) => mod(id)),
        );
        const combine = craft(
            "combine",
            "Recombine onto the Heat-attuned base; rebuild consumed donors on misses",
            [left.id, right.id],
            { kind: "recombine", id: "recombine" },
        );
        keep(combine, target);
        return { entry: combine.id, target };
    }
    throw new Error("Unknown SpicySushiPoE preset.");
}
