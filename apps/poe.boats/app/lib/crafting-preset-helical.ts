import { type ItemCondition, type ItemQuery, itemQuerySchema } from "@poe-tools/item-query";
import type { CraftingItem, CraftingMethod } from "../schemas/crafting";
import type { GraphCraftNode } from "../schemas/crafting-graph";
import type { CraftingEngine } from "./crafting-engine";

export function helicalRingPreset({
    engine,
    base,
    buy,
    craft,
    currency,
}: {
    engine: CraftingEngine;
    base: (name: string) => CraftingItem;
    buy: (id: string, name: string, item: CraftingItem, output?: ItemQuery) => string;
    craft: (
        id: string,
        name: string,
        sources: string[],
        method: CraftingMethod,
        output?: ItemQuery,
    ) => GraphCraftNode;
    currency: (action: string) => CraftingMethod;
}) {
    const query = (...filters: ItemCondition[]) =>
        itemQuerySchema.parse({ game: "poe1", groups: [{ type: "and", filters }] });
    const mod = (...ids: string[]): ItemCondition => ({ kind: "mod", ids, count: { min: 1 } });
    const range = (
        field: Extract<ItemCondition, { kind: "range" }>["field"],
        min: number,
        max?: number,
    ): ItemCondition => ({
        kind: "range",
        field,
        value: { min, ...(max === undefined ? {} : { max }) },
    });
    const not = (condition: ItemQuery): ItemQuery => ({
        ...condition,
        groups: [{ type: "not", filters: condition.groups.flatMap((group) => group.filters) }],
    });
    const recover = (nodeId: string) => ({ kind: "recover" as const, nodeId, inputId: "input-0" });
    const keep = { kind: "return" as const };
    const imprint: CraftingMethod = { kind: "beast", id: "EinharMasterCraft27" };
    const essence = engine.catalog.crafting.essences.find(
        (entry) => entry.name === "Deafening Essence of Rage",
    )!;
    const strength = essence.mods.Ring!;
    const attributes = "AllAttributes4";
    const light = [
        "LightRadiusAndAccuracy3",
        "LightRadiusAndAccuracyNew1",
        "LightRadiusAndAccuracyNew2",
    ];
    const chaos = ["ChaosResist4", "ChaosResist5", "ChaosResist6"];
    const lock = engine.catalog.crafting.bench.find(
        (entry) => entry.mod === "DexMasterItemGenerationCannotChangeSuffixes",
    )!;
    const bench: CraftingMethod = { kind: "bench", id: lock.id };
    const step = (id: string, name: string, source: string, method: CraftingMethod) =>
        craft(id, name, [source], method);
    const branch = (
        node: GraphCraftNode,
        condition: ItemQuery,
        fallback: ReturnType<typeof recover>,
    ) => {
        node.branches = [
            { id: "hit", name: "Keep the required modifiers", query: condition, destination: keep },
        ];
        node.fallback = fallback;
    };
    const restore = (id: string, source: string, condition: ItemQuery, checkpoint: string) => {
        const node = step(
            id,
            "Miss: restore imprint and make a new checkpoint",
            source,
            currency("restore_imprint"),
        );
        node.applyWhen = condition;
        node.branches = [
            {
                id: "restored",
                name: "Restored magic item: imprint again",
                query: query({ kind: "rarity", values: ["Magic"] }),
                destination: recover(checkpoint),
            },
        ];
        return node;
    };
    const ring = base("Helical Ring");
    const strands = step(
        "strands",
        "Remembrance until at least 70 memory strands",
        buy("base", "Buy ilvl 86 Helical Ring", ring),
        currency("apply_zana_influence"),
    );
    branch(strands, query(range("memoryStrands", 70)), recover(strands.id));
    strands.output = query(range("memoryStrands", 70));
    const seedCraft = engine.catalog.crafting.bench.find(
        (entry) => entry.mod === "HelenaMasterStrength1",
    )!;
    const seed = step("seed", "Craft a suffix to make a magic imprint base", strands.id, {
        kind: "bench",
        id: seedCraft.id,
    });
    step("base-imprint", "Imprint the 70+ strand magic base", seed.id, imprint);
    step(
        "clear-seed",
        "Scour the temporary craft; keep the imprint",
        "base-imprint",
        currency("convert_to_normal"),
    );
    const roll = step("strength", "Essence of Rage: spend at most 10 strands", "clear-seed", {
        kind: "essence",
        id: essence.id,
    });
    restore("restore-strands", roll.id, query(range("memoryStrandsSpent", 11)), "base-imprint");
    const annul = step(
        "isolate-strength",
        "Annul until only essence Strength remains",
        "restore-strands",
        currency("remove_random_mod"),
    );
    const extraMods = itemQuerySchema.parse({
        game: "poe1",
        groups: [{ type: "or", filters: [range("suffixes", 2), range("prefixes", 1)] }],
    });
    annul.applyWhen = extraMods;
    annul.inputs[0]!.query = itemQuerySchema.parse({ game: "poe1" });
    annul.branches = [
        {
            id: "retry",
            name: "Strength survives: annul another modifier",
            query: { ...extraMods, groups: [...query(mod(strength)).groups, ...extraMods.groups] },
            destination: recover(annul.id),
        },
    ];
    restore("restore-strength", annul.id, not(query(mod(strength))), "base-imprint");
    step("isolation-lock", "Suffixes cannot be changed", "restore-strength", bench);
    step(
        "isolation-scour",
        "Scour to a magic Strength-only ring",
        "isolation-lock",
        currency("convert_to_normal"),
    );
    step("strength-imprint", "Imprint isolated essence Strength", "isolation-scour", imprint);
    step(
        "augment",
        "Augment for T1 all Attributes",
        "strength-imprint",
        currency("add_mod_to_magic"),
    );
    const augAnnul = step(
        "augment-annul",
        "Miss: annul the unwanted suffix",
        "augment",
        currency("remove_random_mod"),
    );
    augAnnul.applyWhen = not(query(mod(attributes)));
    augAnnul.branches = [
        {
            id: "retry",
            name: "Only Strength remains: augment again",
            query: query(mod(strength), range("suffixes", 1, 1)),
            destination: recover("augment"),
        },
    ];
    const restoreAug = step(
        "restore-augment",
        "Lost Strength: restore and re-imprint",
        augAnnul.id,
        currency("restore_imprint"),
    );
    restoreAug.applyWhen = not(query(mod(strength)));
    restoreAug.branches = [
        {
            id: "restored",
            name: "Strength restored: imprint again",
            query: query(range("suffixes", 1, 1)),
            destination: recover("strength-imprint"),
        },
    ];
    step("pre-regal-imprint", "Imprint Strength + T1 all Attributes", restoreAug.id, imprint);
    step(
        "regal",
        "Regal for accuracy / light radius",
        "pre-regal-imprint",
        currency("upgrade_magic_to_rare"),
    );
    restore("restore-regal", "regal", not(query(mod(...light))), "pre-regal-imprint");
    const chaosLock = step(
        "chaos-lock",
        "Suffixes cannot be changed before chaos reforge",
        "restore-regal",
        bench,
    );
    chaosLock.inputs[0]!.query = itemQuerySchema.parse({ game: "poe1" });
    step("chaos", "Harvest reforge Chaos: accept T3 or better", chaosLock.id, {
        kind: "harvest",
        id: "ReforgeChaos",
    });
    const chaosAnnul = step(
        "chaos-annul",
        "Annul low chaos or clear the occupied prefix",
        "chaos",
        currency("remove_random_mod"),
    );
    chaosAnnul.applyWhen = itemQuerySchema.parse({
        game: "poe1",
        groups: [
            {
                type: "or",
                filters: [range("prefixes", 1), { kind: "mod", ids: chaos, count: { max: 0 } }],
            },
        ],
    });
    const core = [mod(strength), mod(attributes), mod(...light)];
    chaosAnnul.branches = [
        {
            id: "retry",
            name: "Core suffixes survive, prefix open: lock and reforge again",
            query: query(...core, range("suffixes", 3, 3), range("prefixes", 0, 0)),
            destination: recover(chaosLock.id),
        },
        {
            id: "clear-prefix",
            name: "Core survives: annul the occupied prefix",
            query: query(...core, range("prefixes", 1)),
            destination: recover(chaosAnnul.id),
        },
        {
            id: "clear-chaos",
            name: "Low chaos remains: annul again",
            query: query(...core, { kind: "mod", ids: chaos, count: { max: 0 } }),
            destination: recover(chaosAnnul.id),
        },
    ];
    const restoreChaos = step(
        "restore-chaos",
        "Lost a core suffix: restore the pre-regal imprint",
        chaosAnnul.id,
        currency("restore_imprint"),
    );
    restoreChaos.applyWhen = itemQuerySchema.parse({
        game: "poe1",
        groups: [{ type: "count", value: { max: 2 }, filters: core }],
    });
    restoreChaos.branches = [
        {
            id: "restored",
            name: "Back to Strength + Attributes: imprint and regal again",
            query: query({ kind: "rarity", values: ["Magic"] }),
            destination: recover("pre-regal-imprint"),
        },
    ];
    const unravel = step(
        "unravel",
        "Unravelling: attempt chaos tier upgrade if below T1",
        restoreChaos.id,
        currency("consume_zana_influence_upgrade_mods"),
    );
    unravel.applyWhen = {
        game: "poe1",
        format: 1,
        groups: [
            ...not(query(mod("ChaosResist6"))).groups,
            ...query(range("memoryStrands", 1)).groups,
        ],
    };
    const hunter = engine.catalog.crafting.currencies.find(
        (entry) => entry.name === "Hunter's Exalted Orb",
    )!;
    const finish = step("hunter", "Hunter's Exalted Orb: life gained on attack hit", unravel.id, {
        kind: "currency",
        id: hunter.id,
    });
    const target = query(
        ...core,
        mod(...chaos),
        mod("LifeGainPerTargetInfluence1", "LifeGainPerTargetInfluence2__"),
    );
    const finalRestore = step(
        "restore-final",
        "Influenced slam miss: restore pre-regal imprint",
        finish.id,
        currency("restore_imprint"),
    );
    finalRestore.applyWhen = not(
        query(mod("LifeGainPerTargetInfluence1", "LifeGainPerTargetInfluence2__")),
    );
    finalRestore.branches = [
        {
            id: "restored",
            name: "Rebuild from the pre-regal checkpoint",
            query: query({ kind: "rarity", values: ["Magic"] }),
            destination: recover("pre-regal-imprint"),
        },
    ];
    return { entry: finalRestore.id, target };
}
