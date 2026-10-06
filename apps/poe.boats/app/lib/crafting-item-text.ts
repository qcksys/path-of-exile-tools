import {
    type CraftingItem,
    craftingDefenceKeySchema,
    craftingItemStateSchema,
    type RolledMod,
    rolledModSchema,
} from "../schemas/crafting";
import { anointmentText, blightedMapName } from "./crafting-anointing";
import { augment } from "./crafting-augments";
import { clusterRule, clusterSkills, clusterText, validateCluster } from "./crafting-clusters";
import { baseDefenceEntries, baseDefenceNames } from "./crafting-defences";
import { availableEnchantments } from "./crafting-enchantments";
import type { CraftingEngine } from "./crafting-engine";
import { memoryMapModifiers } from "./crafting-memory";
import {
    expandRollRanges,
    readItemBlueprint,
    resolveItemBlueprint,
    rollFractionSchema,
    verifyBlueprintSummary,
} from "./crafting-pob";
import {
    availableCatalysts,
    availableMapQuality,
    catalystName,
    mapQualityRecipe,
} from "./crafting-quality";
import { strongbox } from "./crafting-strongboxes";
import { cleanModText, modifierEffectStats, rolledModText } from "./crafting-text";
import { matchRolledMod } from "./crafting-text-match";

const influences = ["Shaper", "Elder", "Crusader", "Redeemer", "Hunter", "Warlord"];
type ModLine = {
    text: string;
    implicit: boolean;
    crafted: boolean;
    fractured: boolean;
    essence?: boolean;
    enchant?: boolean;
    side?: string;
    name?: string;
    group?: string;
    modId?: string;
    grantedPassive?: string;
    conversion?: RolledMod["conversion"];
    origin?: RolledMod["origin"];
    attributeSource?: RolledMod["attributeSource"];
    domain?: string;
};
export type ItemTextMatch = { item: CraftingItem; warnings: string[] };

export function exportCraftingItemText(engine: CraftingEngine, input: CraftingItem): string {
    const item = engine.validateItem(input);
    if (item.destroyed)
        throw new Error(
            "A destroyed item has no game item text. Use JSON export to preserve the outcome.",
        );
    if (item.allflameCopies)
        throw new Error("Choose an Allflame copy or use JSON export to retain all pending copies.");
    if (item.reveal)
        throw new Error(
            "Use JSON export to preserve the unrevealed modifier and its reveal state.",
        );
    const base = engine.base(item);
    const render = (mod: RolledMod, implicit: boolean, enchant = false, index?: number) => {
        const text = rolledModText(engine.catalog, mod, item);
        if (!text?.trim())
            throw new Error(
                "A modifier has no complete display text in this build. Use JSON export.",
            );
        const generation = engine.mod(mod.id).generation_type;
        const flags = [
            ...(enchant ? ["enchant"] : []),
            ...(mod.crafted ? ["crafted"] : []),
            ...(mod.fractured ? ["fractured"] : []),
            ...(mod.essence ? ["essence"] : []),
            ...(engine.isDesecrated(mod)
                ? ["desecrated"]
                : engine.mod(mod.id).domain === "unveiled"
                  ? ["unveiled"]
                  : []),
            ...(implicit && generation === "searing_exarch_implicit" ? ["exarch"] : []),
            ...(implicit && generation === "eater_of_worlds_implicit" ? ["eater"] : []),
        ]
            .map((flag) => `{${flag}}`)
            .join("");
        return cleanModText(text)
            .split("\n")
            .map(
                (line) =>
                    `{modGroup:${mod.id}${index === undefined ? "" : `#${index}`}${mod.grantedPassive ? `@${mod.grantedPassive}` : ""}}${mod.attributeSource ? `{attributeSource:${encodeURIComponent(mod.attributeSource)}}` : ""}${mod.conversion ? `{conversion:${encodeURIComponent(JSON.stringify(mod.conversion))}}` : ""}${mod.origin ? `{origin:${encodeURIComponent(JSON.stringify(mod.origin))}}` : ""}${flags}${line}`,
            );
    };
    const implicits = [
        ...clusterText(engine.catalog, item).map((line) => `{enchant}${line}`),
        ...(item.blight
            ? cleanModText(engine.mod(item.blight).text!)
                  .split("\n")
                  .map((line) => `{modGroup:${item.blight}}{implicit}${line}`)
            : []),
        ...item.implicits.flatMap((mod) => render(mod, true)),
        ...(item.enchantments ?? []).flatMap((mod) => render(mod, false, true)),
        ...(item.anointments ?? []).flatMap((id) =>
            anointmentText(engine.catalog, id)
                .split("\n")
                .map((line) => `{modGroup:anoint:${id}}{enchant}${line}`),
        ),
        ...memoryMapModifiers(engine.catalog, item).flatMap(({ id, text }) =>
            text.split("\n").map((line) => `{modGroup:${id}}{enchant}${line}`),
        ),
    ];
    return [
        `Rarity: ${item.rarity.toUpperCase()}`,
        ...(item.rarity === "rare" && !item.unidentified ? ["Crafted Item"] : []),
        `${item.blight ? `${blightedMapName(engine.catalog, item)} ` : ""}${base.name}`,
        `Item Level: ${item.level}`,
        ...(item.cluster ? [`Cluster Passive: ${item.cluster.passive}`] : []),
        ...baseDefenceEntries(engine.catalog, item).flatMap(({ key, name }) =>
            item.baseDefences?.[key] === undefined
                ? []
                : [`Base ${name}: ${item.baseDefences[key]}`],
        ),
        ...(engine.map(item) ? [`Map Tier: ${engine.map(item)!.tier}`] : []),
        item.mapQuality
            ? `${mapQualityRecipe(engine.catalog, item)!.description}: +${item.quality}%`
            : `Quality: ${item.quality}`,
        ...(item.sockets !== undefined && engine.catalog.game === "poe1"
            ? [
                  `Socket Count: ${item.sockets}`,
                  ...(item.socketLinks
                      ? [
                            `Socket Links: ${item.socketLinks.map((entry) => (entry === null ? "?" : entry ? "1" : "0")).join(" ")}`,
                        ]
                      : []),
              ]
            : item.sockets
              ? [`Sockets: ${Array.from({ length: item.sockets }, () => "S").join(" ")}`]
              : []),
        ...(item.augments ?? []).map((id) => `Augment: ${augment(engine.catalog, id).name}`),
        ...(item.jewelSocket
            ? [`Jewel Socket: ${augment(engine.catalog, item.jewelSocket).name}`]
            : []),
        ...(item.memoryStrands !== undefined ? [`Memory Strands: ${item.memoryStrands}`] : []),
        ...(item.intangibility !== undefined ? [`Intangibility: ${item.intangibility}%`] : []),
        ...(item.allflameCrafted ? ["Allflame Crafted"] : []),
        ...(item.corruptedBy ? [`Corrupted by: ${engine.costName(item.corruptedBy)}`] : []),
        ...(item.implicitCraft ? [`Implicit Craft: ${JSON.stringify(item.implicitCraft)}`] : []),
        ...(item.catalyst
            ? [
                  `Catalyst: ${catalystName(engine.catalog, item.catalyst.id)
                      .replace(/^Refined /, "")
                      .replace(/ Catalyst$/, "")}`,
                  `CatalystQuality: ${item.catalyst.quality}`,
              ]
            : []),
        ...item.influences.map((id) => `${influences[id]} Item`),
        `Implicits: ${implicits.length}`,
        ...implicits,
        ...item.mods.flatMap((mod, index) =>
            render(
                mod,
                false,
                false,
                item.mods.filter((entry) => entry.id === mod.id).length > 1 ? index : undefined,
            ),
        ),
        ...(item.twiceCorrupted
            ? [cleanModText(engine.catalog.crafting.templeCorruption!.twiceCorruptedText)]
            : item.corrupted
              ? ["Corrupted"]
              : []),
        ...(item.mirrored ? ["Mirrored"] : []),
        ...(item.split ? ["Split"] : []),
        ...(item.sanctified ? ["Sanctified"] : []),
        ...(item.unidentified ? ["Unidentified"] : []),
        ...(item.socketedJewel
            ? ["Socketed Jewel:", exportCraftingItemText(engine, item.socketedJewel)]
            : []),
    ].join("\n");
}

function modifierLines(lines: string[], start: number, twiceCorruptedText: string) {
    const result: ModLine[] = [];
    let header: Partial<ModLine> = {};
    let group = 0;
    let implicitLines = 0;
    let reminder = false;
    for (const line of lines.slice(start)) {
        if (reminder || /^\([A-Za-z]/.test(line)) {
            reminder = !line.endsWith(")");
            continue;
        }
        if (/^-{4,}$/.test(line)) {
            header = {};
            continue;
        }
        if (/^\{ .*Modifier/.test(line)) {
            header = {
                group: `advanced:${++group}`,
                name: /Modifier "([^"]+)"/.exec(line)?.[1],
                implicit: /Implicit/.test(line),
                enchant: /Enchant|Instilled/.test(line),
                crafted: /Crafted/.test(line),
                fractured: /Fractured/.test(line),
                domain: /Desecrated/.test(line)
                    ? "desecrated"
                    : /Unveiled/.test(line)
                      ? "unveiled"
                      : undefined,
                side: /Prefix/.test(line) ? "prefix" : /Suffix/.test(line) ? "suffix" : undefined,
            };
            continue;
        }
        if (/^Implicits: \d+$/.test(line)) {
            implicitLines = Number(line.split(":")[1]);
            if (implicitLines > 48) throw new Error("Too many implicit lines in the item text.");
            continue;
        }
        if (
            /^(Quality(?:\s*\([^)]+\))?:|Memory Strands:|Intangibility:|Allflame Crafted$|Corrupted by:|Implicit Craft:|Cluster Passive:|Catalyst:|CatalystQuality:|Item Level:|Map Tier:|Item Quantity:|Item Rarity:|Monster Pack Size:|Crafted:|Item Class:|Sockets:|Socket Count:|Socket Links:|Augment:|Jewel Socket:|LevelReq:|Base (?:Armour|Evasion Rating|Energy Shield|Ward):|Armour:|Evasion Rating:|Energy Shield:|Ward:|Physical Damage:|Elemental Damage:|Chaos Damage:|Critical Strike Chance:|Attacks per Second:|Weapon Range:|Radius:|Limited to:)/.test(
                line,
            ) ||
            [
                ...influences.map((name) => `${name} Item`),
                "Corrupted",
                twiceCorruptedText,
                "Mirrored",
                "Split",
                "Sanctified",
                "Unidentified",
                "Fractured Item",
            ].includes(line)
        )
            continue;
        if (
            /\{(?:synthesis|rune|custom|disabled)\}|\{variant:/i.test(line) ||
            /\(rune\)$/.test(line)
        )
            throw new Error(
                "This text contains a modifier format that is not supported yet. Use fixed rolls without unsupported socket or enchantment payloads.",
            );
        const ranges = [...line.matchAll(/\{range:([^}]*)\}/g)];
        const fraction =
            ranges.length === 1 ? rollFractionSchema.safeParse(ranges[0]![1]) : undefined;
        if (ranges.length > 1 || (line.includes("{range:") && !fraction?.success))
            throw new Error("A ranged modifier needs one {range:...} fraction between 0 and 1.");
        const flags = [
            ...line.matchAll(/\{([a-z]+)\}|\((implicit|crafted|fractured|enchant|desecrated)\)$/g),
        ].map((match) => match[1] ?? match[2]);
        if (
            flags.some(
                (flag) =>
                    ![
                        "implicit",
                        "crafted",
                        "fractured",
                        "exarch",
                        "eater",
                        "prefix",
                        "suffix",
                        "desecrated",
                        "unveiled",
                        "enchant",
                        "essence",
                    ].includes(flag!),
            )
        )
            throw new Error("The item contains an unsupported modifier annotation.");
        let text = line
            .replace(/\{modGroup:[^}]+\}/g, "")
            .replace(/\{conversion:[^}]+\}/g, "")
            .replace(/\{origin:[^}]+\}/g, "")
            .replace(/\{attributeSource:[^}]+\}/g, "")
            .replace(/\{range:[^}]*\}/g, "")
            .replace(/\{[a-z]+\}/g, "")
            .replace(/\s*\((implicit|crafted|fractured|enchant|desecrated)\)$/, "")
            .replace(/ [-—] Unscalable Value$/, "")
            .replace(/(?<=\d)\([+-]?\d+(?:\.\d+)?(?:[-–][+-]?\d+(?:\.\d+)?)?\)/g, "")
            .trim();
        const expanded = expandRollRanges(text, fraction?.success ? fraction.data : undefined);
        text = expanded.text;
        if (fraction && !expanded.count)
            throw new Error("A range annotation must accompany a numeric modifier range.");
        result.push({
            ...header,
            group: /\{modGroup:([^}]+)\}/.exec(line)?.[1] ?? header.group,
            modId: /\{modGroup:([^}@#]+)/.exec(line)?.[1],
            grantedPassive: /\{modGroup:[^}@]+@([^}]+)\}/.exec(line)?.[1],
            attributeSource: /\{attributeSource:([^}]+)\}/.test(line)
                ? rolledModSchema.shape.attributeSource.parse(
                      decodeURIComponent(/\{attributeSource:([^}]+)\}/.exec(line)![1]!),
                  )
                : undefined,
            origin: /\{origin:([^}]+)\}/.test(line)
                ? rolledModSchema.shape.origin.parse(
                      JSON.parse(decodeURIComponent(/\{origin:([^}]+)\}/.exec(line)![1]!)),
                  )
                : undefined,
            conversion: /\{conversion:([^}]+)\}/.test(line)
                ? rolledModSchema.shape.conversion.parse(
                      JSON.parse(decodeURIComponent(/\{conversion:([^}]+)\}/.exec(line)![1]!)),
                  )
                : undefined,
            domain: flags.includes("desecrated")
                ? "desecrated"
                : flags.includes("unveiled")
                  ? "unveiled"
                  : header.domain,
            text,
            enchant: header.enchant || flags.includes("enchant"),
            implicit:
                header.implicit ||
                implicitLines > 0 ||
                flags.some((flag) => ["implicit", "exarch", "eater"].includes(flag!)),
            crafted: header.crafted || flags.includes("crafted"),
            fractured: header.fractured || flags.includes("fractured"),
            essence: flags.includes("essence"),
            side: flags.includes("exarch")
                ? "searing_exarch_implicit"
                : flags.includes("eater")
                  ? "eater_of_worlds_implicit"
                  : flags.includes("prefix")
                    ? "prefix"
                    : flags.includes("suffix")
                      ? "suffix"
                      : header.side,
        });
        if (implicitLines) implicitLines--;
    }
    if (implicitLines) throw new Error("The item text is missing implicit modifier lines.");
    if (reminder) throw new Error("The item text contains an incomplete reminder paragraph.");
    if (result.length > 48) throw new Error("The item contains too many modifier lines.");
    return result;
}

function readClusterJewel(
    engine: CraftingEngine,
    item: CraftingItem,
    lines: ModLine[],
    annotation: string | undefined,
) {
    const rule = clusterRule(engine.catalog, item);
    const countLines = lines.filter((line) => /^Adds .* Passive Skills$/.test(line.text));
    const socketLines = lines.filter((line) =>
        /^\d+ Added Passive Skills are Jewel Sockets$/.test(line.text),
    );
    const grantLines = lines.filter((line) =>
        line.text.startsWith("Added Small Passive Skills grant:"),
    );
    if (!rule) {
        if (annotation || countLines.length || socketLines.length || grantLines.length)
            throw new Error("Cluster passive text requires a PoE 1 Cluster Jewel.");
        return { lines, cluster: undefined };
    }
    if (countLines.length > 1 || socketLines.length > 1)
        throw new Error("Duplicate Cluster Jewel passive or socket count.");
    const count = countLines[0]?.text;
    const nodes =
        count && /^Adds \d+ Passive Skills$/.test(count) ? Number(count.split(" ")[1]) : undefined;
    if (
        count &&
        nodes === undefined &&
        ![
            `Adds (${rule.minNodes}–${rule.maxNodes}) Passive Skills`,
            `Adds (${rule.minNodes}-${rule.maxNodes}) Passive Skills`,
        ].includes(count)
    )
        throw new Error("The Cluster Jewel passive range must match the extracted size.");
    const matches = clusterSkills(engine.catalog, item).flatMap((skill) => {
        if (annotation && annotation !== skill.id) return [];
        const expected = cleanModText(skill.text!).split("\n");
        const start = lines.findIndex(
            (line) => line.text === `Added Small Passive Skills grant: ${expected[0]}`,
        );
        const selected = lines.slice(start, start + expected.length);
        return start >= 0 &&
            selected.length === expected.length &&
            selected.every(
                (line, index) =>
                    line.text === `Added Small Passive Skills grant: ${expected[index]}` ||
                    (index > 0 && line.text === expected[index]),
            ) &&
            grantLines.every((line) => selected.includes(line))
            ? [{ skill, selected }]
            : [];
    });
    if (matches.length !== 1)
        throw new Error(
            "Cluster Jewel text must identify one extracted passive type for its size.",
        );
    const { skill, selected } = matches[0]!;
    const cluster = {
        passive: skill.id,
        ...(nodes === undefined ? {} : { nodes }),
        ...(socketLines.length ? { jewelSockets: Number(socketLines[0]!.text.split(" ")[0]) } : {}),
    };
    validateCluster(engine.catalog, { ...item, cluster });
    const consumed = new Set([...countLines, ...socketLines, ...selected]);
    if ([...consumed].some((line) => line.modId || line.crafted || line.fractured || line.essence))
        throw new Error("Cluster passive properties cannot carry explicit modifier annotations.");
    return { cluster, lines: lines.filter((line) => !consumed.has(line)) };
}

function readBlightedMap(engine: CraftingEngine, lines: ModLine[]) {
    const candidates = engine.catalog.crafting.anointing.maps.map((entry) => ({
        id: entry.mod,
        text: cleanModText(engine.mod(entry.mod).text!).split("\n"),
    }));
    const texts = new Set(candidates.flatMap((entry) => entry.text));
    if (
        !lines.some(
            (line) =>
                line.text.startsWith("Can be Anointed up to ") ||
                candidates.some((entry) => entry.id === line.modId),
        )
    )
        return { lines };
    const blightLines = lines.filter((line) =>
        line.modId
            ? candidates.some((entry) => entry.id === line.modId)
            : line.implicit && !line.enchant && texts.has(line.text),
    );
    if (!blightLines.length) return { lines };
    const matches = candidates.filter(
        (entry) =>
            entry.text.length === blightLines.length &&
            entry.text.every(
                (text) =>
                    blightLines.filter(
                        (line) =>
                            line.text === text &&
                            (!line.modId || line.modId === entry.id) &&
                            !line.crafted &&
                            !line.fractured &&
                            !line.side,
                    ).length === 1,
            ),
    );
    if (matches.length !== 1)
        throw new Error("Blighted Map text must include its complete extracted properties.");
    return { lines: lines.filter((line) => !blightLines.includes(line)), blight: matches[0]!.id };
}

function readMemoryMap(engine: CraftingEngine, lines: ModLine[]) {
    const rule = engine.catalog.crafting.memoryMaps;
    if (!rule) return { lines };
    const candidates = Array.from({ length: rule.maximumUses + 1 }, (_, intentions) => ({
        intentions,
        lines: memoryMapModifiers(engine.catalog, { memoryMap: { intentions } }).flatMap(
            ({ id, text }) => text.split("\n").map((text) => ({ id, text })),
        ),
    }));
    const texts = new Set(candidates.flatMap((entry) => entry.lines.map((line) => line.text)));
    const memoryLines = lines.filter(
        (line) =>
            texts.has(line.text) ||
            line.modId === rule.influenceMod ||
            line.modId === rule.enchantmentMod,
    );
    if (!memoryLines.length) return { lines };
    const match = candidates.find(
        (entry) =>
            entry.lines.length === memoryLines.length &&
            entry.lines.every(
                ({ id, text }) =>
                    memoryLines.filter(
                        (line) =>
                            line.text === text &&
                            (!line.modId || line.modId === id) &&
                            !line.crafted &&
                            !line.fractured &&
                            !line.side &&
                            !line.domain &&
                            !line.grantedPassive,
                    ).length === 1,
            ),
    );
    if (!match)
        throw new Error(
            "Memory map text must include its influence and complete, matching Intention values.",
        );
    return {
        lines: lines.filter((line) => !memoryLines.includes(line)),
        memoryMap: { intentions: match.intentions },
    };
}

export function importCraftingItemText(engine: CraftingEngine, text: string): ItemTextMatch[] {
    if (text.length > 50_000) throw new Error("Item text must be smaller than 50,000 characters.");
    const sections = text.replace(/\r/g, "").split(/^Socketed Jewel:\s*$/m);
    if (sections.length > 2) throw new Error("Only one socketed Jewel is supported.");
    if (sections.length === 2) {
        const hosts = importCraftingItemText(engine, sections[0]!);
        const jewels = importCraftingItemText(engine, sections[1]!);
        if (hosts.length * jewels.length > 32)
            throw new Error(
                "Too many possible modifier matches. Copy the item with advanced modifier descriptions (Ctrl+Alt+C).",
            );
        return hosts.flatMap((host) =>
            jewels.map((jewel) => ({
                item: engine.validateItem({
                    ...host.item,
                    socketedJewel: engine.validateSocketedJewel(jewel.item),
                }),
                warnings: [
                    ...host.warnings,
                    ...jewel.warnings.map((warning) => `Jewel: ${warning}`),
                ],
            })),
        );
    }
    const allLines = text
        .replace(/\r/g, "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    const blueprint = readItemBlueprint(engine.catalog, allLines);
    const lines = allLines.filter((line) => !/^(Prefix|Suffix):/.test(line));
    const clusterAnnotations = lines.filter((line) => line.startsWith("Cluster Passive:"));
    if (
        clusterAnnotations.length > 1 ||
        clusterAnnotations.some((line) => !/^Cluster Passive: \S+$/.test(line))
    )
        throw new Error("Cluster Passive must name one extracted passive identifier.");
    const rarityLine = lines.findIndex((line) => line.startsWith("Rarity: "));
    const baseDefences: NonNullable<CraftingItem["baseDefences"]> = {};
    for (const key of craftingDefenceKeySchema.options) {
        const prefix = `Base ${baseDefenceNames[key]}:`;
        const matching = lines.filter((line) => line.startsWith(prefix));
        if (
            matching.length > 1 ||
            matching.some((line) => !/^ \d+$/.test(line.slice(prefix.length)))
        )
            throw new Error(`${prefix} must have one whole-number raw value.`);
        if (matching.length) baseDefences[key] = Number(matching[0]!.slice(prefix.length));
    }
    const rarity = lines[rarityLine]?.slice(8).toLowerCase();
    if (rarity !== "normal" && rarity !== "magic" && rarity !== "rare")
        throw new Error("Paste a normal, magic or rare item copied in English.");
    const unidentified = lines.includes("Unidentified");
    if (unidentified && lines.includes("Fractured Item"))
        throw new Error(
            "Unidentified fractured items require a known hidden modifier and cannot use the ordinary identification model.",
        );
    const catalystLines = lines.filter((line) => /^Quality \(|^Catalyst(?:Quality)?:/.test(line));
    const describedQuality =
        catalystLines.length === 1
            ? /^(Quality \([^)]+\)): ([+-]?\d+)%(?: \(augmented\))?$/.exec(catalystLines[0]!)
            : null;
    const catalystLabel = lines.find((line) => line.startsWith("Catalyst: "))?.slice(10);
    const catalystAmount = lines.find((line) => line.startsWith("CatalystQuality: "))?.slice(17);
    if (
        catalystLines.length &&
        !describedQuality &&
        !(
            catalystLines.length === 2 &&
            catalystLabel &&
            catalystAmount &&
            /^\d+$/.test(catalystAmount)
        )
    )
        throw new Error(
            "Catalyst quality must include one recognized type and a whole-number quality.",
        );
    const copiedBaseName = lines[
        rarityLine + (rarity === "rare" && !unidentified ? 2 : 1)
    ]?.replace(/^Superior /, "");
    const baseName = copiedBaseName?.replace(/\b(?:Blight-ravaged|Blighted) /, "");
    const mapTierLines = lines.filter((line) => line.startsWith("Map Tier:"));
    if (mapTierLines.length > 1 || mapTierLines.some((line) => !/^Map Tier: \d+$/.test(line)))
        throw new Error("Map tier must be one whole-number tier in the item text.");
    const mapTier = mapTierLines.length ? Number(mapTierLines[0]!.split(":")[1]) : undefined;
    const bases = Object.entries(engine.catalog.bases).filter(
        ([baseId, base]) =>
            (mapTier === undefined || engine.map({ baseId })?.tier === mapTier) &&
            (rarity === "magic"
                ? ` ${baseName} `.includes(` ${base.name} `)
                : base.name === baseName),
    );
    const longest = Math.max(...bases.map(([, base]) => base.name.length));
    const matchingBases = bases.filter(([, base]) => base.name.length === longest);
    if (!matchingBases.length)
        throw new Error("This item base is not present in the selected game's extracted catalog.");
    const levelLine = lines.findIndex((line) => /^Item Level: \d+$/.test(line));
    if (levelLine < 0)
        throw new Error("The item text must include Item Level: followed by a number.");
    const level = Number(lines[levelLine]!.split(":")[1]);
    const qualityLine = lines.find((line) => line.startsWith("Quality:"));
    const qualityMatch =
        qualityLine && /^Quality: ([+-]?\d+)%?(?: \(augmented\))?$/.exec(qualityLine);
    if (qualityLine && !qualityMatch)
        throw new Error("Quality must be a whole number in the item text.");
    const quality = Number(qualityMatch?.[1] ?? 0);
    const socketLines = lines.filter((line) => line.startsWith("Sockets:"));
    const socketCountLines = lines.filter((line) => line.startsWith("Socket Count:"));
    const linkLines = lines.filter((line) => line.startsWith("Socket Links:"));
    if (
        linkLines.length &&
        (engine.catalog.game !== "poe1" ||
            linkLines.length !== 1 ||
            socketCountLines.length !== 1 ||
            socketLines.length ||
            !/^Socket Links: [01?](?: [01?])*$/.test(linkLines[0]!))
    )
        throw new Error(
            "Socket Links requires one PoE 1 Socket Count and a list of 1 (linked), 0 (separate) or ? (unknown) connections.",
        );
    if (
        socketCountLines.length &&
        (engine.catalog.game !== "poe1" ||
            socketCountLines.length !== 1 ||
            socketLines.length ||
            !/^Socket Count: \d+$/.test(socketCountLines[0]!))
    )
        throw new Error(
            "Socket Count must be one whole-number PoE 1 socket count without a Sockets list.",
        );
    if (
        engine.catalog.game === "poe1" &&
        (socketLines.length > 1 ||
            socketLines.some((line) => !/^Sockets: [RGBWN](?:[ -][RGBWN])*$/.test(line)))
    )
        throw new Error(
            "Gem sockets must be one list of ordinary sockets; special sockets are not supported.",
        );
    const sockets = socketCountLines.length
        ? Number(socketCountLines[0]!.split(":")[1])
        : socketLines.length
          ? socketLines[0]!.slice(9).split(/[ -]/).length
          : undefined;
    const socketLinks = linkLines.length
        ? linkLines[0]!
              .slice(14)
              .split(" ")
              .map((value) => (value === "?" ? null : value === "1"))
        : engine.catalog.game === "poe1" && socketLines.length && sockets! > 1
          ? [...socketLines[0]!.slice(9).matchAll(/[ -]/g)].map((match) => match[0] === "-")
          : undefined;
    const augments = lines
        .filter((line) => line.startsWith("Augment:"))
        .map((line) => {
            const matches = engine.catalog.crafting.augments.filter(
                (entry) => entry.name === line.slice(8).trim(),
            );
            if (matches.length !== 1)
                throw new Error("Unknown or ambiguous socketed augment name.");
            return matches[0]!.id;
        });
    const jewelLines = lines.filter((line) => line.startsWith("Jewel Socket:"));
    const jewelSources = engine.catalog.crafting.augments.filter(
        (entry) => entry.name === jewelLines[0]?.slice(13).trim(),
    );
    if (jewelLines.length && (jewelLines.length !== 1 || jewelSources.length !== 1))
        throw new Error("Jewel Socket must name one known, unambiguous conversion augment.");
    if (jewelLines.length && (socketLines.length || augments.length))
        throw new Error("A converted Jewel socket cannot coexist with augment sockets.");
    if (
        engine.catalog.game === "poe2" &&
        (socketLines.length > 1 || socketLines.some((line) => !/^Sockets: S(?: S)*$/.test(line)))
    )
        throw new Error("Augment sockets must be a single S-separated socket list.");
    const strandLines = lines.filter((line) => line.startsWith("Memory Strands:"));
    const intangibleLines = lines.filter((line) => line.startsWith("Intangibility:"));
    if (
        intangibleLines.length > 1 ||
        intangibleLines.some((line) => !/^Intangibility: \d+%?$/.test(line))
    )
        throw new Error("Intangibility must be one whole-number percentage in the item text.");
    const allflameCrafted = lines.filter((line) => line === "Allflame Crafted");
    if (allflameCrafted.length > 1) throw new Error("Duplicate Allflame Crafted annotation.");
    const corruptionSources = lines.filter((line) => line.startsWith("Corrupted by:"));
    const corruptionSource =
        corruptionSources.length === 1
            ? engine.catalog.crafting.currencies.filter(
                  (entry) => `Corrupted by: ${entry.name}` === corruptionSources[0],
              )
            : [];
    if (corruptionSources.length && corruptionSource.length !== 1)
        throw new Error("The corruption source must name one extracted currency.");
    const implicitCraftLines = lines.filter((line) => line.startsWith("Implicit Craft:"));
    if (implicitCraftLines.length > 1) throw new Error("Duplicate Implicit Craft annotation.");
    const implicitCraft = implicitCraftLines.length
        ? craftingItemStateSchema.shape.implicitCraft.parse(
              JSON.parse(implicitCraftLines[0]!.slice("Implicit Craft:".length)),
          )
        : undefined;
    if (strandLines.length > 1 || strandLines.some((line) => !/^Memory Strands: \d+$/.test(line)))
        throw new Error("Memory strands must be one whole-number count in the item text.");
    const twiceCorruptedText = cleanModText(
        engine.catalog.crafting.templeCorruption?.twiceCorruptedText ?? "",
    );
    const twiceCorrupted = lines.includes(twiceCorruptedText);
    const blight = readBlightedMap(engine, modifierLines(lines, levelLine + 1, twiceCorruptedText));
    if (
        copiedBaseName !== baseName &&
        (!blight.blight || !copiedBaseName?.includes(`${blightedMapName(engine.catalog, blight)} `))
    )
        throw new Error("Blighted Map name and properties must match.");
    const memory = readMemoryMap(engine, blight.lines);
    const itemLines = memory.lines.sort((a, b) => Number(b.implicit) - Number(a.implicit));
    if (unidentified && (blueprint || itemLines.some((line) => !line.implicit && !line.enchant)))
        throw new Error("Unidentified templates cannot include explicit modifiers.");
    const effectIds = Object.entries(engine.catalog.mods)
        .filter(([, mod]) =>
            mod.stats.some(
                (stat) =>
                    Object.values(modifierEffectStats).flat().includes(stat.id) ||
                    engine.catalog.crafting.taggedModifierEffects.some(
                        (rule) => rule.stat === stat.id,
                    ),
            ),
        )
        .map(([id]) => id);
    const rawValues =
        blueprint !== undefined ||
        lines.some(
            (line) =>
                line.startsWith("{ ") || /^Crafted: true$/i.test(line) || line.includes("{range:"),
        );
    const matches: ItemTextMatch[] = [];
    let visits = 0;
    let furthest = 0;
    let unresolvedText: string | undefined;
    let validationError = "";
    for (const [baseId, base] of matchingBases) {
        const chest = strongbox(engine.catalog, { baseId });
        if (chest && (level < Math.max(1, chest.minimumLevel) || level > chest.maximumLevel))
            continue;
        const mapQuality = describedQuality
            ? availableMapQuality(engine.catalog, { baseId }).find(
                  (entry) => entry.description === describedQuality[1],
              )
            : undefined;
        if (mapQuality && qualityLine)
            throw new Error("Map quality must have one type and amount in the item text.");
        const catalyst =
            catalystLines.length && !mapQuality
                ? availableCatalysts(engine.catalog, { baseId }).find((entry) =>
                      describedQuality
                          ? entry.description === describedQuality[1]
                          : catalystName(engine.catalog, entry.id)
                                .replace(/^Refined /, "")
                                .replace(/ Catalyst$/, "") === catalystLabel,
                  )
                : undefined;
        if (catalystLines.length && !catalyst && !mapQuality) {
            validationError =
                "The catalyst type is unavailable for this item class in the extracted build.";
            continue;
        }
        const starting: CraftingItem = {
            ...engine.createItem(baseId, level),
            rarity,
            ...(unidentified ? { unidentified: true as const } : {}),
            quality,
            ...(Object.keys(baseDefences).length ? { baseDefences } : {}),
            ...(mapQuality
                ? {
                      quality: Number(describedQuality![2]),
                      mapQuality: mapQuality.stats.includes("map_item_drop_quantity_+%")
                          ? undefined
                          : mapQuality.id,
                  }
                : {}),
            ...(sockets !== undefined ? { sockets } : {}),
            ...(socketLinks ? { socketLinks } : {}),
            ...(augments.length ? { augments } : {}),
            ...(jewelLines.length
                ? { jewelSocket: jewelSources[0]!.id, sockets: 0, augments: [] }
                : {}),
            ...(strandLines.length ? { memoryStrands: Number(strandLines[0]!.split(":")[1]) } : {}),
            ...(intangibleLines.length
                ? { intangibility: Number(intangibleLines[0]!.split(":")[1]!.replace("%", "")) }
                : {}),
            ...(allflameCrafted.length ? { allflameCrafted: true as const } : {}),
            ...(corruptionSource[0] ? { corruptedBy: corruptionSource[0].id } : {}),
            ...(implicitCraft ? { implicitCraft } : {}),
            ...(memory.memoryMap ? { memoryMap: memory.memoryMap } : {}),
            ...(blight.blight ? { blight: blight.blight } : {}),
            ...(catalyst
                ? {
                      catalyst: {
                          id: catalyst.id,
                          quality: Number(describedQuality?.[2] ?? catalystAmount),
                      },
                  }
                : {}),
            corrupted: lines.includes("Corrupted") || twiceCorrupted,
            ...(twiceCorrupted ? { twiceCorrupted: true as const } : {}),
            mirrored: lines.includes("Mirrored"),
            ...(lines.includes("Split") ? { split: true } : {}),
            ...(lines.includes("Sanctified") ? { sanctified: true as const } : {}),
            influences: influences.flatMap((name, index) =>
                lines.includes(`${name} Item`) ? [index] : [],
            ),
            mods: [],
            implicits: [],
        } satisfies CraftingItem;
        let sourceLines: ModLine[];
        try {
            const cluster = readClusterJewel(
                engine,
                starting,
                itemLines,
                clusterAnnotations[0]?.slice("Cluster Passive: ".length),
            );
            if (cluster.cluster) starting.cluster = cluster.cluster;
            sourceLines = cluster.lines;
        } catch (error) {
            validationError = error instanceof Error ? error.message : String(error);
            continue;
        }
        const isEffect = (line: ModLine) =>
            effectIds.some((id) =>
                line.modId
                    ? line.modId === id
                    : Boolean(matchRolledMod(engine.catalog, id, line.text, starting, rawValues)),
            );
        let blueprintAmbiguous = false;
        let modifierLines = sourceLines;
        if (blueprint) {
            try {
                const resolved = resolveItemBlueprint(engine.catalog, blueprint, starting);
                starting.mods = resolved.mods;
                blueprintAmbiguous = resolved.ambiguous;
                const summaries = sourceLines.filter(
                    (line) =>
                        !line.implicit &&
                        !line.enchant &&
                        (!line.crafted ||
                            resolved.mods.some(
                                (mod) =>
                                    mod.crafted &&
                                    (!line.modId ||
                                        !engine.catalog.mods[line.modId] ||
                                        line.modId === mod.id) &&
                                    cleanModText(rolledModText(engine.catalog, mod) ?? "")
                                        .split("\n")
                                        .includes(line.text),
                            )),
                );
                verifyBlueprintSummary(engine.catalog, resolved.mods, summaries);
                modifierLines = sourceLines.filter((line) => !summaries.includes(line));
            } catch (error) {
                validationError = error instanceof Error ? error.message : String(error);
                continue;
            }
        }
        const parsedLines = [...modifierLines].sort(
            (a, b) =>
                Number(b.implicit) - Number(a.implicit) ||
                Number(isEffect(b)) - Number(isEffect(a)),
        );
        const enchantmentIds = new Set(
            availableEnchantments(engine.catalog, starting).map((entry) => entry.mod),
        );
        const fossilIds = new Set(
            engine.catalog.crafting.fossils.flatMap((entry) => [...entry.added, ...entry.forced]),
        );
        const gildedIds = new Set(engine.gildedModifiers(starting).map((entry) => entry.id));
        const corruptedIds = new Set(engine.corruptedModifiers(starting).map((entry) => entry.id));
        const ids = Object.entries(engine.catalog.mods)
            .filter(
                ([id, mod]) =>
                    enchantmentIds.has(id) ||
                    fossilIds.has(id) ||
                    gildedIds.has(id) ||
                    corruptedIds.has(id) ||
                    base.implicits.includes(id) ||
                    ["searing_exarch_implicit", "eater_of_worlds_implicit"].includes(
                        mod.generation_type,
                    ) ||
                    (["prefix", "suffix"].includes(mod.generation_type) &&
                        [
                            base.domain,
                            "crafted",
                            engine.revealDomain(),
                            "mercenary",
                            "ducat_crafted",
                        ].includes(mod.domain)),
            )
            .map(([id]) => id);
        const cache = new Map<string, ReturnType<typeof matchRolledMod>>();
        function resolve(index: number, item: CraftingItem, ambiguous: boolean) {
            if (++visits > 20_000 || matches.length > 32)
                throw new Error(
                    "Too many possible modifier matches. Copy the item with advanced modifier descriptions (Ctrl+Alt+C).",
                );
            if (index >= furthest) {
                furthest = index;
                unresolvedText = parsedLines[index]?.text;
            }
            if (index === parsedLines.length) {
                try {
                    if (
                        engine.catalog.game === "poe2" &&
                        item.corrupted &&
                        item.mods.filter((entry) => engine.isDesecrated(entry)).length > 1
                    )
                        item = { ...item, putrefied: true };
                    matches.push({
                        item: engine.validateItem(item),
                        warnings: [
                            ...(item.unidentified
                                ? [
                                      "Unidentified equipment uses the ordinary modifier pool and affix-count model. Hidden special drop modifiers are not recovered from item text.",
                                  ]
                                : []),
                            ...(baseDefenceEntries(engine.catalog, item).some(
                                ({ key, name, range }) =>
                                    range.min !== range.max &&
                                    baseDefences[key] === undefined &&
                                    lines.some((line) => line.startsWith(`${name}:`)),
                            )
                                ? [
                                      "Displayed defences were not imported as raw base rolls. Set starting base defences before targeting them.",
                                  ]
                                : []),
                            ...(engine.catalog.game === "poe1" && socketLines.length
                                ? [
                                      "Gem socket counts and links were imported. Socket colours are not retained.",
                                  ]
                                : []),
                            ...(ambiguous
                                ? [
                                      "Displayed text does not identify every raw roll uniquely. Matching raw values and multipliers were used; review the raw stat values before crafting.",
                                  ]
                                : []),
                        ],
                    });
                } catch (error) {
                    validationError = error instanceof Error ? error.message : String(error);
                }
                return;
            }
            const first = parsedLines[index]!;
            if (
                first.enchant ||
                (first.text.startsWith("Allocates ") &&
                    !first.side &&
                    !first.crafted &&
                    !first.fractured &&
                    !first.implicit &&
                    !first.modId)
            ) {
                for (const recipe of engine.catalog.crafting.anointing.recipes) {
                    if (
                        (!recipe.passive && !recipe.mod) ||
                        (first.modId && first.modId !== `anoint:${recipe.id}`)
                    )
                        continue;
                    const expected = anointmentText(engine.catalog, recipe.id).split("\n");
                    if (
                        expected.every(
                            (text, offset) =>
                                (first.enchant
                                    ? parsedLines[index + offset]?.enchant
                                    : offset === 0) && parsedLines[index + offset]?.text === text,
                        )
                    )
                        resolve(
                            index + expected.length,
                            { ...item, anointments: [...(item.anointments ?? []), recipe.id] },
                            ambiguous,
                        );
                }
            }
            const field = first.enchant ? "enchantments" : first.implicit ? "implicits" : "mods";
            const entries = item[field] ?? [];
            const maximum =
                field !== "mods"
                    ? 6
                    : Math.max(
                          engine.limits(item).max,
                          engine.waystone(item) ? 9 : engine.map(item) ? 8 : 6,
                      );
            if (entries.length >= maximum) return;
            for (let end = index + 1; end <= Math.min(parsedLines.length, index + 8); end++) {
                const block = parsedLines.slice(index, end);
                if (
                    block.some(
                        (line) =>
                            line.enchant !== first.enchant ||
                            line.implicit !== first.implicit ||
                            line.crafted !== first.crafted ||
                            line.fractured !== first.fractured ||
                            line.essence !== first.essence ||
                            line.domain !== first.domain ||
                            line.side !== first.side ||
                            line.attributeSource !== first.attributeSource ||
                            JSON.stringify(line.conversion) !== JSON.stringify(first.conversion) ||
                            line.group !== first.group,
                    )
                )
                    break;
                if (first.group && parsedLines[end]?.group === first.group) continue;
                const value = block.map((line) => line.text).join("\n");
                for (const id of ids) {
                    const mod = engine.mod(id);
                    if (
                        entries.some(
                            (entry) =>
                                !entry.conversion &&
                                !first.conversion &&
                                (entry.id === id ||
                                    (!first.implicit &&
                                        engine
                                            .mod(entry.id)
                                            .groups.some((group) => mod.groups.includes(group)))),
                        ) ||
                        (first.name && mod.name !== first.name) ||
                        (first.domain &&
                            mod.domain !== first.domain &&
                            !(
                                engine.catalog.game === "poe2" &&
                                first.domain === "desecrated" &&
                                mod.domain === base.domain
                            )) ||
                        (first.modId && engine.catalog.mods[first.modId] && id !== first.modId) ||
                        (first.side && mod.generation_type !== first.side) ||
                        (first.enchant
                            ? !enchantmentIds.has(id)
                            : first.implicit
                              ? !base.implicits.includes(id) &&
                                !gildedIds.has(id) &&
                                !corruptedIds.has(id) &&
                                !mod.generation_type.endsWith("_implicit")
                              : !["prefix", "suffix"].includes(mod.generation_type)) ||
                        (engine.catalog.game === "poe1" &&
                            first.crafted !== (mod.domain === "crafted"))
                    )
                        continue;
                    const key = JSON.stringify([
                        id,
                        value,
                        item.implicits,
                        item.mods,
                        first.fractured,
                        first.grantedPassive,
                    ]);
                    if (!cache.has(key))
                        cache.set(
                            key,
                            matchRolledMod(
                                engine.catalog,
                                id,
                                value,
                                item,
                                rawValues,
                                first.fractured,
                                first.grantedPassive,
                            ),
                        );
                    const matched = cache.get(key);
                    if (!matched) continue;
                    const rolled = {
                        ...matched.mod,
                        crafted: first.crafted,
                        fractured: first.fractured,
                        ...(first.essence ? { essence: true as const } : {}),
                        ...(first.conversion ? { conversion: first.conversion } : {}),
                        ...(first.origin ? { origin: first.origin } : {}),
                        ...(first.attributeSource
                            ? { attributeSource: first.attributeSource }
                            : {}),
                        ...(first.domain === "desecrated" && mod.domain !== "desecrated"
                            ? { desecrated: true as const }
                            : {}),
                    };
                    if (!first.implicit && !first.enchant) {
                        try {
                            engine.validateItem({ ...item, mods: [rolled] });
                        } catch {
                            continue;
                        }
                    }
                    resolve(
                        end,
                        { ...item, [field]: [...entries, rolled] },
                        ambiguous || matched.ambiguous,
                    );
                }
            }
        }
        resolve(0, starting, blueprintAmbiguous);
    }
    if (!matches.length)
        throw new Error(
            validationError ||
                `Could not resolve this modifier from the extracted build: ${unresolvedText ?? "missing implicit modifiers"}. Try advanced copy (Ctrl+Alt+C).`,
        );
    return [...new Map(matches.map((match) => [JSON.stringify(match.item), match])).values()];
}
