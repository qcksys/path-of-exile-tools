import type { CraftingItem } from "../schemas/crafting";
import {
    type PresetBuilder,
    presetMod,
    presetNot,
    presetQuery,
    presetRange,
    presetRecover,
} from "./crafting-preset-preparation";

export function rfHelmetPreparation(builder: PresetBuilder, prepared: CraftingItem) {
    const { engine, buy, craft, currency } = builder;
    const source = buy(
        "suffixes-make-base",
        `Acquire and Scour a Magic or Rare ${engine.base(prepared).name}`,
        engine.createItem(prepared.baseId, prepared.level),
    );
    const transmute = craft(
        "suffixes-make-transmute",
        "Transmute the unrolled base",
        [source],
        currency("transmute_to_magic"),
    );
    const regal = craft(
        "suffixes-make-regal",
        "Regal with room for an influence modifier",
        [transmute.id],
        currency("upgrade_magic_to_rare"),
    );
    const hunter = craft("suffixes-make-hunter", "Add Hunter influence", [regal.id], {
        kind: "currency",
        id: "Metadata/Items/AtlasExiles/AddModToRareHunter",
    });
    const influenced = presetQuery({ kind: "influence", values: ["elder"] });
    const randomise = craft(
        "suffixes-make-influence",
        "Randomise influence until Elder",
        [hunter.id],
        { kind: "harvest", id: "RerollInfluenceType" },
        influenced,
    );
    randomise.applyWhen = presetNot(influenced);
    randomise.branches = [
        {
            id: "ready",
            name: "Required influence ready",
            query: influenced,
            destination: { kind: "return" },
        },
    ];
    randomise.fallback = presetRecover(randomise.id);
    const ready = presetQuery(
        ...influenced.groups.flatMap((group) => group.filters),
        ...prepared.mods.map((mod) => presetMod(mod.id)),
        presetRange("suffixes", prepared.mods.length, prepared.mods.length),
        presetRange("prefixes", 0, 2),
    );
    const roll = craft(
        "suffixes-make-roll",
        "Horror until isolated Horror and level 20 Burning Damage suffixes",
        [randomise.id],
        { kind: "essence", id: "Metadata/Items/Currency/CurrencyEssenceHorror1" },
        ready,
    );
    roll.applyWhen = presetNot(ready);
    roll.branches = [
        {
            id: "ready",
            name: "Exact suffixes with room for the lock",
            query: ready,
            destination: { kind: "return" },
        },
    ];
    roll.fallback = presetRecover(roll.id);
    const lock = engine.catalog.crafting.bench.find(
        (entry) => entry.mod === "DexMasterItemGenerationCannotChangeSuffixes",
    )!;
    const protect = craft("suffixes-make-lock", "Suffixes cannot be changed", [roll.id], {
        kind: "bench",
        id: lock.id,
    });
    return craft(
        "suffixes-make-scour",
        "Scour the prefixes, preserving the required suffixes",
        [protect.id],
        currency("convert_to_normal"),
        presetQuery(
            { kind: "base", field: "baseId", values: [prepared.baseId] },
            { kind: "rarity", values: ["Rare"] },
            { kind: "range", field: "ilvl", value: { min: prepared.level, max: prepared.level } },
            ...influenced.groups.flatMap((group) => group.filters),
            ...prepared.mods.map((mod) => presetMod(mod.id)),
            presetRange("prefixes", 0, 0),
            presetRange("suffixes", prepared.mods.length, prepared.mods.length),
        ),
    ).id;
}
