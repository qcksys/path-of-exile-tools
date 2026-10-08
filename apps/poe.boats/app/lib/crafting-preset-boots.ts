import type { GraphCraftNode } from "../schemas/crafting-graph";
import { seededRandom } from "./crafting-engine";
import {
    alterationDonor,
    presetMod as mod,
    presetNot as not,
    type PresetBuilder,
    presetQuery as query,
    presetRange as range,
    presetRecover as recover,
} from "./crafting-preset-preparation";

export function elevatedBootsPreset(builder: PresetBuilder) {
    const { engine, base, craft, currency } = builder;
    const step = (id: string, name: string, source: string, method: GraphCraftNode["method"]) =>
        craft(id, name, [source], method);
    const keep = { kind: "return" as const };
    const bench = (mod: string) => {
        const recipe = engine.catalog.crafting.bench.find((entry) => entry.mod === mod);
        if (!recipe) throw new Error(`Boots bench craft unavailable: ${mod}`);
        return { kind: "bench" as const, id: recipe.id };
    };
    const lock = bench("DexMasterItemGenerationCannotChangeSuffixes");
    const imprint = { kind: "beast" as const, id: "EinharMasterCraft27" };
    const tailwind = "TailwindOnCriticalStrikeInfluenceMaven_";
    const onslaught = "OnslaughtOnKillInfluenceMaven";
    const elusive = "ElusiveOnCriticalStrikeInfluenceMaven";
    const ordinaryElusive = "ElusiveOnCriticalStrikeInfluence1";
    const elevate = (id: string, wanted: string) => {
        const item = base("Two-Toned Boots");
        item.influences = [engine.catalog.crafting.modRules[wanted]!.influence!];
        const isolated = alterationDonor(builder, id, item, wanted);
        const checkpoint = step(
            `${id}-imprint`,
            "Imprint the isolated magic donor",
            isolated,
            imprint,
        );
        const regal = step(
            `${id}-regal`,
            "Regal for a second influenced modifier",
            checkpoint.id,
            currency("upgrade_magic_to_rare"),
        );
        const influenced = engine
            .pool({ ...item, rarity: "rare" })
            .filter((entry) => engine.catalog.crafting.modRules[entry.id]?.influence != null)
            .map((entry) => entry.id);
        const pair = query({ kind: "mod", ids: influenced, count: { min: 2 } });
        const retryRegal = step(
            `${id}-restore-regal`,
            "Miss: restore imprint and regal again",
            regal.id,
            currency("restore_imprint"),
        );
        retryRegal.applyWhen = not(pair);
        retryRegal.branches = [
            {
                id: "restore",
                name: "Restored donor: make a new imprint",
                query: query({ kind: "rarity", values: ["Magic"] }),
                destination: recover(checkpoint.id),
            },
        ];
        const dominance = step(
            `${id}-elevate`,
            "Orb of Dominance: elevate the desired modifier",
            retryRegal.id,
            currency("upgrade_influence_mod"),
        );
        const upgraded = engine.catalog.crafting.influenceUpgrades.find(
            (entry) => entry.mod === wanted,
        )!.upgraded;
        const restore = step(
            `${id}-restore-elevation`,
            "Lost desired mod: restore imprint and try again",
            dominance.id,
            currency("restore_imprint"),
        );
        restore.applyWhen = not(query(mod(upgraded)));
        restore.branches = [
            {
                id: "restore",
                name: "Imprint restored: rebuild the elevation attempt",
                query: query({ kind: "rarity", values: ["Magic"] }),
                destination: recover(checkpoint.id),
            },
        ];
        return restore.id;
    };
    const hunter = elevate("tailwind", "TailwindOnCriticalStrikeInfluence1");
    const redeemerBase = base("Two-Toned Boots");
    redeemerBase.influences = [3];
    const random = seededRandom(42);
    const redeemerDonor = engine.addStartingMod(
        engine.addStartingMod(redeemerBase, "OnslaughtOnKillInfluence2_", random, "influence"),
        ordinaryElusive,
        random,
        "influence",
    );
    redeemerDonor.rarity = "rare";
    const onslaughtInput = builder.buy(
        "onslaught-base",
        "Acquire rare T1 Onslaught + Elusive donor",
        redeemerDonor,
    );
    const onslaughtElevation = step(
        "onslaught-elevate",
        "Orb of Dominance: elevate Onslaught",
        onslaughtInput,
        currency("upgrade_influence_mod"),
    );
    onslaughtElevation.branches = [
        {
            id: "hit",
            name: "Elevated Onslaught donor ready",
            query: query(mod(onslaught)),
            destination: keep,
        },
    ];
    onslaughtElevation.fallback = { kind: "discard" };
    const receiverLock = step(
        "receiver-lock",
        "Protect elevated Tailwind before making a magic receiver",
        hunter,
        lock,
    );
    const receiverScour = step(
        "receiver-scour",
        "Scour to an elevated Tailwind-only magic base",
        receiverLock.id,
        currency("convert_to_normal"),
    );
    const receiverImprint = step(
        "receiver-imprint",
        "Imprint elevated Tailwind before Awakener's Orb",
        receiverScour.id,
        imprint,
    );
    const awaken = craft(
        "awaken",
        "Awaken elevated Onslaught onto the imprinted Tailwind boots",
        [receiverImprint.id, onslaughtElevation.id],
        currency("transfer_item_influence"),
    );
    const suffixes = query(mod(tailwind), mod(onslaught));
    const restoreAwaken = step(
        "restore-awaken",
        "Lost elevated suffix: restore the Tailwind receiver",
        awaken.id,
        currency("restore_imprint"),
    );
    restoreAwaken.applyWhen = not(suffixes);
    restoreAwaken.branches = [
        {
            id: "restored",
            name: "Re-imprint receiver and recreate the Onslaught donor",
            query: query({ kind: "rarity", values: ["Magic"] }),
            destination: recover(receiverImprint.id),
        },
    ];
    const resistance = mod(
        "ChaosResist4",
        "ChaosResist5",
        "ChaosResist6",
        ...["Fire", "Cold", "Lightning"].flatMap((element) =>
            [6, 7, 8].map((tier) => `${element}Resist${tier}`),
        ),
    );
    const finishedSuffixes = query(mod(tailwind), mod(onslaught), resistance);
    const suffixAnnul = step(
        "suffix-annul",
        "Clear an unwanted third suffix or full prefixes",
        restoreAwaken.id,
        currency("remove_random_mod"),
    );
    suffixAnnul.applyWhen = {
        ...query(),
        groups: [
            { type: "or", filters: [range("prefixes", 3), range("suffixes", 3)] },
            ...not(finishedSuffixes).groups,
        ],
    };
    suffixAnnul.branches = [
        {
            id: "lost",
            name: "Lost an elevated suffix: restore the receiver imprint",
            query: not(suffixes),
            destination: recover(restoreAwaken.id),
        },
        {
            id: "clear",
            name: "Elevated suffixes survive: clear another occupied slot",
            query: {
                ...query(),
                groups: [
                    { type: "or", filters: [range("prefixes", 3), range("suffixes", 3)] },
                    ...not(finishedSuffixes).groups,
                ],
            },
            destination: recover(suffixAnnul.id),
        },
    ];
    const suffixLock = step(
        "suffix-lock",
        "Protect elevated suffixes before chaos reforge",
        suffixAnnul.id,
        lock,
    );
    suffixLock.applyWhen = not(finishedSuffixes);
    const chaosRoll = step(
        "chaos-resistance",
        "Reforge Chaos for T3+ chaos resistance",
        suffixLock.id,
        { kind: "harvest", id: "ReforgeChaos" },
    );
    chaosRoll.applyWhen = not(finishedSuffixes);
    chaosRoll.branches = [
        {
            id: "hit",
            name: "Elevated suffixes and T3+ resistance",
            query: finishedSuffixes,
            destination: keep,
        },
    ];
    chaosRoll.fallback = recover(suffixAnnul.id);
    const clearFull = step(
        "clear-full-prefixes",
        "Full prefixes: annul to make room for suffix protection",
        chaosRoll.id,
        currency("remove_random_mod"),
    );
    clearFull.applyWhen = query(range("prefixes", 3));
    clearFull.branches = [
        {
            id: "lost",
            name: "Elevated suffix lost: restore the receiver imprint",
            query: not(suffixes),
            destination: recover(restoreAwaken.id),
        },
        {
            id: "resistance",
            name: "Resistance lost: rebuild the third suffix",
            query: not(finishedSuffixes),
            destination: recover(suffixAnnul.id),
        },
    ];
    const prefixLock = step(
        "prefix-lock",
        "Suffixes cannot be changed before rolling Elusive",
        clearFull.id,
        lock,
    );
    const crit = step(
        "elusive",
        "Reforge Critical for Elusive and a second influenced prefix",
        prefixLock.id,
        { kind: "harvest", id: "ReforgeCritical" },
    );
    const influencedPrefixes = engine
        .pool({ ...base("Two-Toned Boots"), rarity: "rare", influences: [3, 4] })
        .filter(
            (entry) =>
                entry.mod.generation_type === "prefix" &&
                engine.catalog.crafting.modRules[entry.id]?.influence != null,
        )
        .map((entry) => entry.id);
    const ready = query(
        mod(ordinaryElusive),
        { kind: "mod", ids: influencedPrefixes, count: { min: 2 } },
        range("prefixes", 2, 2),
    );
    crit.branches = [
        {
            id: "ready",
            name: "Two influenced prefixes: ready to elevate Elusive",
            query: ready,
            destination: keep,
        },
    ];
    crit.fallback = recover(clearFull.id);
    const elevationLock = step(
        "elusive-lock",
        "Protect suffixes during Elusive elevation",
        crit.id,
        lock,
    );
    const elevateElusive = step(
        "elevate-elusive",
        "Orb of Dominance: elevated Elusive",
        elevationLock.id,
        currency("upgrade_influence_mod"),
    );
    elevateElusive.branches = [
        {
            id: "hit",
            name: "Elevated Elusive survives",
            query: query(mod(elusive)),
            destination: keep,
        },
    ];
    elevateElusive.fallback = recover(prefixLock.id);
    const veil = step(
        "veiled-speed",
        "Veiled Exalted Orb: keep elevated Elusive",
        elevateElusive.id,
        currency("replace_rare_mod_veiled"),
    );
    const block = step(
        "block-mana",
        "Craft mana to block unwanted unveil options",
        veil.id,
        bench("EinharMasterIncreasedMana1"),
    );
    const speed = Object.keys(engine.catalog.mods).filter(
        (id) =>
            engine.mod(id).domain === "unveiled" &&
            id.startsWith("JunMasterVeiledMovementVelocity"),
    );
    const unveil = step(
        "unveil-speed",
        "Unveil movement speed (prefer chill avoidance)",
        block.id,
        {
            kind: "reveal",
            preferred: [...speed].sort(
                (a, b) =>
                    Number(b.includes("CannotBeChilled")) - Number(a.includes("CannotBeChilled")),
            ),
        },
    );
    unveil.branches = [
        {
            id: "hit",
            name: "Elevated Elusive retained and movement speed unveiled",
            query: query(mod(elusive), mod(...speed)),
            destination: keep,
        },
    ];
    unveil.fallback = recover(prefixLock.id);
    const life = step(
        "crafted-life",
        "Replace crafted mana with maximum life",
        unveil.id,
        bench("EinharMasterIncreasedLife4"),
    );
    const target = query(
        mod(tailwind),
        mod(onslaught),
        mod(elusive),
        resistance,
        mod(...speed),
        mod("EinharMasterIncreasedLife4"),
    );
    return { entry: life.id, target };
}
