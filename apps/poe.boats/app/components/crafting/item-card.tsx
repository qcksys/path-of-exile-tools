import { useContext, useMemo } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { anointment, anointmentText, blightedMapName } from "~/lib/crafting-anointing";
import { augment, augmentText } from "~/lib/crafting-augments";
import { clusterText } from "~/lib/crafting-clusters";
import { combinedExplicitText } from "~/lib/crafting-combined-text";
import { corruptionStatRange } from "~/lib/crafting-corruption";
import { baseDefenceEntries, baseDefenceValue } from "~/lib/crafting-defences";
import { eldritchLabel } from "~/lib/crafting-eldritch";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { influenceNames } from "~/lib/crafting-influences";
import { memoryMapModifiers } from "~/lib/crafting-memory";
import { modifierLevelText, modifierTiers } from "~/lib/crafting-modifier-details";
import { grantedPassive } from "~/lib/crafting-passives";
import { itemProperties, itemPropertyNames } from "~/lib/crafting-properties";
import { catalystName, mapQualityRecipe } from "~/lib/crafting-quality";
import { linkedSocketRange } from "~/lib/crafting-sockets";
import { strongbox } from "~/lib/crafting-strongboxes";
import { cleanModText, rolledModText } from "~/lib/crafting-text";
import {
    type CraftingItem,
    type CraftingMod,
    craftingPropertyKeySchema,
    type RolledMod,
} from "~/schemas/crafting";
import { ClusterPassiveDetails } from "./cluster-passive-details";
import { CraftingDisplay } from "./display-settings";

export function modText(mod: CraftingMod) {
    return cleanModText(mod.text ?? mod.name);
}

export function ItemCard({
    engine,
    item,
    onChange,
    label = "Current item",
}: {
    engine: CraftingEngine;
    item: CraftingItem;
    onChange?: (item: CraftingItem) => void;
    label?: string;
}) {
    const { advanced, compact } = useContext(CraftingDisplay);
    const tiers = useMemo(
        () => modifierTiers(engine, item.baseId, "ordinary", item.cluster),
        [engine, item.baseId, item.cluster],
    );
    const essenceTiers = useMemo(
        () => modifierTiers(engine, item.baseId, "essence", item.cluster),
        [engine, item.baseId, item.cluster],
    );
    const base = engine.base(item);
    const chest = strongbox(engine.catalog, item);
    const counts = engine.counts(item);
    const limits = engine.limits(item);
    const influences = engine.effectiveInfluences(item);
    const properties = item.unidentified ? {} : itemProperties(engine, item);
    const linked = linkedSocketRange(item);
    const combined = advanced ? [] : combinedExplicitText(engine.catalog, item);
    const entry = (
        rolled: RolledMod,
        entries: "mods" | "implicits" | "enchantments" = "mods",
        index = 0,
    ) => {
        const implicit = entries === "implicits";
        const enchantment = entries === "enchantments";
        const mod = engine.mod(rolled.id);
        const unrevealed = mod.domain === "veiled";
        const source = rolled.attributeSource ?? rolled.conversion?.source ?? rolled.id;
        const fromEssence = rolled.essence || engine.mod(source).is_essence_only;
        const tier = (fromEssence ? essenceTiers : tiers).get(source);
        const text = rolledModText(engine.catalog, rolled, item);
        return (
            <li
                key={`${rolled.id}:${index}`}
                className={`space-y-1 border-b border-border/50 last:border-0 ${compact ? "py-1.5" : "py-3"}`}
            >
                <div
                    className={`whitespace-pre-line text-sm ${rolled.fractured ? "text-amber-600 dark:text-amber-400" : enchantment ? "text-sky-700 dark:text-sky-300" : "text-foreground"}`}
                >
                    {unrevealed
                        ? `Unrevealed ${mod.generation_type}`
                        : text === null
                          ? modText(mod)
                          : cleanModText(text) || "No displayed stats"}
                </div>
                <div
                    hidden={!advanced}
                    data-modifier-details
                    className="font-mono text-[11px] text-muted-foreground"
                >
                    {enchantment ? (
                        "Enchantment"
                    ) : implicit && eldritchLabel(mod) ? (
                        eldritchLabel(mod)
                    ) : (
                        <>
                            {implicit ? "Implicit" : mod.generation_type} · {mod.name} ·{" "}
                            {modifierLevelText(engine, rolled.id)}
                        </>
                    )}
                    {tier !== undefined ? ` · Tier ${tier}` : ""}
                    {fromEssence ? " · essence" : ""}
                    {mod.implicit_tags.length ? ` · Tags: ${mod.implicit_tags.join(", ")}` : ""}
                    {rolled.crafted ? " · crafted" : ""}
                    {rolled.fractured ? " · fractured" : ""}
                    {engine.isDesecrated(rolled) ? " · desecrated" : ""}
                    {rolled.sanctification !== undefined
                        ? ` · Sanctification ${rolled.sanctification}%`
                        : ""}
                    {rolled.corruptionScale !== undefined
                        ? ` · Corruption value roll ${rolled.corruptionScale}%`
                        : ""}
                    {rolled.origin
                        ? ` · ${rolled.origin.kind === "beast" ? "beast" : "donor"} level ${rolled.origin.level}`
                        : ""}
                    {rolled.attributeSource ? " · Genteel attribute conversion" : ""}
                </div>
                <ClusterPassiveDetails catalog={engine.catalog} mod={mod} values={rolled.values} />
                {rolled.grantedPassive ? (
                    <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer">Allocated passive effects</summary>
                        <p className="mt-2 whitespace-pre-line">
                            {cleanModText(
                                grantedPassive(engine.catalog, rolled.grantedPassive).text ??
                                    "No translated passive description in this build.",
                            )}
                        </p>
                    </details>
                ) : null}
                <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">
                        {text === null
                            ? "Range shown · inspect raw rolls"
                            : "Raw stat values and ranges"}
                    </summary>
                    <div className="mt-2 space-y-2">
                        {mod.stats.map((stat, index) => {
                            const range = corruptionStatRange(
                                engine.catalog,
                                item,
                                rolled.id,
                                index,
                            );
                            return (
                                <div
                                    // biome-ignore lint/suspicious/noArrayIndexKey: Extracted stat slots have immutable positions and can repeat identifiers.
                                    key={`${stat.id}:${index}`}
                                    className="block break-all font-mono text-[11px]"
                                >
                                    {stat.id} ({range.min}–{range.max})
                                    {onChange ? (
                                        <Input
                                            className="mt-1 block w-full rounded border bg-background px-2 py-1"
                                            aria-label={`Value for ${stat.id}`}
                                            type="number"
                                            step={1}
                                            min={range.min}
                                            max={range.max}
                                            value={rolled.values[index]}
                                            onChange={(event) => {
                                                onChange({
                                                    ...item,
                                                    [entries]: (item[entries] ?? []).map((entry) =>
                                                        entry === rolled
                                                            ? {
                                                                  ...entry,
                                                                  values: entry.values.map(
                                                                      (value, statIndex) =>
                                                                          statIndex === index
                                                                              ? Number(
                                                                                    event.target
                                                                                        .value,
                                                                                )
                                                                              : value,
                                                                  ),
                                                              }
                                                            : entry,
                                                    ),
                                                });
                                            }}
                                        />
                                    ) : (
                                        <span className="block">{rolled.values[index]}</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </details>
                {onChange && !implicit && !unrevealed ? (
                    <div className="flex gap-2">
                        <Button
                            variant="ghost"
                            size="xs"
                            onClick={() =>
                                onChange({
                                    ...item,
                                    [entries]: (item[entries] ?? []).filter(
                                        (mod) => mod !== rolled,
                                    ),
                                    reveal:
                                        item.reveal?.mod === rolled.id ? undefined : item.reveal,
                                })
                            }
                        >
                            {enchantment ? "Remove enchantment" : "Remove"}
                        </Button>
                        {!enchantment &&
                        !["veiled", "desecrated"].includes(mod.domain) &&
                        !rolled.desecrated &&
                        !item.sanctified &&
                        !influences.length &&
                        engine.catalog.crafting.classes[base.item_class]?.fracture ? (
                            <Button
                                variant="ghost"
                                size="xs"
                                onClick={() =>
                                    onChange({
                                        ...item,
                                        mods: item.mods.map((mod) =>
                                            mod === rolled
                                                ? { ...mod, fractured: !mod.fractured }
                                                : mod,
                                        ),
                                    })
                                }
                            >
                                {rolled.fractured ? "Unfracture" : "Fracture"}
                            </Button>
                        ) : null}
                    </div>
                ) : null}
            </li>
        );
    };
    return (
        <section
            aria-label={label}
            data-item-output={advanced ? "advanced" : "classic"}
            className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
        >
            <div
                className={`border-b border-border px-4 ${compact ? "py-2" : "py-4"} ${item.rarity === "rare" ? "bg-amber-500/10" : item.rarity === "magic" ? "bg-blue-500/10" : "bg-muted/50"}`}
            >
                <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    {item.rarity} · {base.item_class}
                </div>
                <h2 className="text-lg font-semibold">
                    {item.blight ? `${blightedMapName(engine.catalog, item)} ` : ""}
                    {base.name}
                </h2>
                {chest ? (
                    <details className="mt-2 text-xs text-muted-foreground">
                        <summary>Encounter properties</summary>
                        <p>
                            Fixed client definitions; excluded from affix slots and stat conditions.
                            Ranges describe possible encounter values.
                        </p>
                        <ul className="mt-1 space-y-1">
                            {chest.mods.map((id) => (
                                <li key={id}>{modText(engine.mod(id)) || id}</li>
                            ))}
                        </ul>
                    </details>
                ) : null}
                {item.destroyed ? (
                    <p role="status" className="mt-2 text-sm text-destructive">
                        Destroyed. This item cannot be crafted or satisfy requirements. Undo to
                        restore the previous item. The last item state is shown below.
                    </p>
                ) : null}
                {engine.map(item) ? (
                    <p className="text-xs text-muted-foreground">
                        Map tier {engine.map(item)!.tier} · Area level{" "}
                        {engine.statTotals(item).get("map_item_level_override") ??
                            engine.map(item)!.areaLevel}
                    </p>
                ) : null}
                {engine.waystone(item) ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                        Area level {engine.waystone(item)!.areaLevel}
                    </p>
                ) : null}
                {influences.length ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                        {influences.map((value) => influenceNames[value]).join(" · ")} influence
                        {engine.hasFixedInfluences(item) ? " (fixed by implicit)" : ""}
                    </p>
                ) : null}
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                    Item level {item.level}
                    {item.unidentified
                        ? " · Unidentified"
                        : ` · ${counts.prefixes}/${limits.prefixes} prefixes · ${counts.suffixes}/${limits.suffixes} suffixes`}
                </p>
                {counts.prefixes > limits.prefixes || counts.suffixes > limits.suffixes ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                        Existing affixes above the current limit are retained. New modifiers need an
                        open slot under the current limits.
                    </p>
                ) : null}
                {item.catalyst ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                        {
                            engine.catalog.crafting.catalysts.find(
                                (entry) => entry.id === item.catalyst!.id,
                            )!.description
                        }
                        : +{item.catalyst.quality}%
                        <span className="block mt-1">
                            {catalystName(engine.catalog, item.catalyst.id)}
                        </span>
                    </p>
                ) : null}
                {item.memoryStrands ? <p>Memory Strands: {item.memoryStrands}</p> : null}
                {clusterText(engine.catalog, item).length ? (
                    <div className="mt-2 space-y-1 text-sm text-primary">
                        {clusterText(engine.catalog, item).map((line) => (
                            <p key={line}>{line}</p>
                        ))}
                    </div>
                ) : null}
                {item.intangibility !== undefined ? (
                    <p>Intangibility: {item.intangibility}%</p>
                ) : null}
                {item.blight ? (
                    <p className="mt-2 whitespace-pre-line text-sm text-primary">
                        {cleanModText(engine.mod(item.blight).text!)}
                    </p>
                ) : null}
                {memoryMapModifiers(engine.catalog, item).map(({ id, text }) => (
                    <p key={id} className="mt-2 whitespace-pre-line text-sm text-primary">
                        {text}
                    </p>
                ))}
                {item.memoryMap ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                        Orb of Intention uses: {item.memoryMap.intentions}/
                        {engine.catalog.crafting.memoryMaps!.maximumUses}
                    </p>
                ) : null}
                {item.sockets !== undefined ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                        {engine.catalog.game === "poe1" ? "Gem sockets" : "Augment sockets"}:{" "}
                        {item.sockets}
                    </p>
                ) : null}
                {engine.catalog.game === "poe1" && (item.sockets ?? 0) > 1 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                        Largest linked group:{" "}
                        {linked.min === linked.max ? linked.min : `${linked.min}–${linked.max}`}{" "}
                        sockets
                        {item.socketLinks?.every((entry) => entry !== null)
                            ? ""
                            : " · Remaining links unknown"}
                    </p>
                ) : null}
                {item.jewelSocket ? (
                    <p className="mt-2 text-sm text-primary">
                        Jewel sockets: 1 · {augment(engine.catalog, item.jewelSocket).name}
                    </p>
                ) : null}
                {item.quality ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                        {mapQualityRecipe(engine.catalog, item)?.description ?? "Quality"}: +
                        {item.quality}%
                    </p>
                ) : null}
            </div>
            {Object.keys(properties).length ? (
                <section aria-label="Final item properties" className="border-t px-4 py-3 text-xs">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                        {craftingPropertyKeySchema.options
                            .filter((key) => Object.hasOwn(properties, key))
                            .map((key) => (
                                <div key={key}>
                                    <dt className="text-muted-foreground">
                                        {itemPropertyNames[key]}
                                    </dt>
                                    <dd className="font-mono tabular-nums">
                                        {properties[key] ?? "Set base roll"}
                                    </dd>
                                </div>
                            ))}
                    </dl>
                    <p className="mt-2 text-muted-foreground">
                        Item values after quality and modifiers. Total Resistance includes chaos;
                        Flat Life excludes attributes and passive skills. DPS excludes skills,
                        character bonuses and critical strikes.
                    </p>
                </section>
            ) : null}
            {baseDefenceEntries(engine.catalog, item).length ? (
                <section
                    className="border-t px-4 py-3 text-xs text-muted-foreground"
                    aria-label="Raw base defences"
                >
                    {baseDefenceEntries(engine.catalog, item).map(({ key, range, name }) => (
                        <p key={key}>
                            Base {name}: {baseDefenceValue(engine.catalog, item, key) ?? "Not set"}{" "}
                            · Range {range.min}–{range.max}
                        </p>
                    ))}
                    <p>Before quality and modifiers.</p>
                </section>
            ) : null}
            {item.socketedJewel ? (
                <div className="space-y-2 border-t p-4">
                    <p className="text-xs text-muted-foreground">
                        Socketed Jewel · Effects are separate from this item's affixes. Passive-tree
                        radius effects are not calculated here.
                    </p>
                    <ItemCard engine={engine} item={item.socketedJewel} label="Socketed Jewel" />
                </div>
            ) : null}
            <ul className="px-4">
                {(item.augments ?? []).map((id, index) => (
                    <li
                        // biome-ignore lint/suspicious/noArrayIndexKey: The index identifies the physical socket, including duplicate augments.
                        key={index}
                        className="space-y-1 border-b border-border/50 py-3 text-sm"
                    >
                        <p className="text-xs text-muted-foreground">
                            Socket {index + 1} · {augment(engine.catalog, id).name}
                            {augment(engine.catalog, id).socketBound ? " · socket-bound" : ""}
                        </p>
                        <p className="whitespace-pre-line text-sky-700 dark:text-sky-300">
                            {cleanModText(
                                augmentText(engine.catalog, item, id) ??
                                    "No translated augment text in this build.",
                            )}
                        </p>
                    </li>
                ))}
                {[...new Set(item.anointments ?? [])].map((id) => {
                    const recipe = anointment(engine.catalog, id);
                    return (
                        <li key={id} className="space-y-2 border-b border-border/50 py-3 text-sm">
                            <p className="whitespace-pre-line text-sky-700 dark:text-sky-300">
                                {anointmentText(engine.catalog, id)}
                                {item.blight
                                    ? ` × ${item.anointments!.filter((entry) => entry === id).length}`
                                    : ""}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {engine.catalog.game === "poe1"
                                    ? "Anointment"
                                    : "Instilled modifier"}
                            </p>
                            {recipe.passive ? (
                                <details className="text-xs text-muted-foreground">
                                    <summary className="cursor-pointer">
                                        Passive skill effects
                                    </summary>
                                    <p className="mt-2 whitespace-pre-line">
                                        {cleanModText(
                                            engine.catalog.crafting.anointing.passives[
                                                recipe.passive
                                            ]!.text ??
                                                "No translated passive description in this build.",
                                        )}
                                    </p>
                                </details>
                            ) : null}
                            {onChange ? (
                                <Button
                                    size="xs"
                                    variant="ghost"
                                    onClick={() =>
                                        onChange({
                                            ...item,
                                            anointments: item.anointments?.filter(
                                                (entry) => entry !== id,
                                            ),
                                        })
                                    }
                                >
                                    Remove anointment
                                </Button>
                            ) : null}
                        </li>
                    );
                })}
                {(item.enchantments ?? []).map((mod) => entry(mod, "enchantments"))}
                {item.implicits.map((mod) => entry(mod, "implicits"))}
            </ul>
            {item.mods.length ? (
                advanced ? (
                    <ul className="px-4" aria-label="Individual explicit modifiers">
                        {item.mods.map((mod, index) => entry(mod, "mods", index))}
                    </ul>
                ) : (
                    <>
                        <ul className="px-4" aria-label="Combined explicit stats">
                            {combined.map((line) => (
                                <li
                                    key={line.key}
                                    data-fractured={line.fractured}
                                    className={`whitespace-pre-line text-sm ${compact ? "py-1" : "py-2"} ${line.fractured ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}
                                >
                                    {line.text}
                                </li>
                            ))}
                        </ul>
                        <details className="border-t px-4 py-3 text-xs text-muted-foreground">
                            <summary className="cursor-pointer">
                                Individual modifiers and rolls
                            </summary>
                            <ul aria-label="Individual explicit modifiers">
                                {item.mods.map((mod, index) => entry(mod, "mods", index))}
                            </ul>
                        </details>
                    </>
                )
            ) : null}
            {item.implicitCraft ? (
                <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                    {engine.costName(item.implicitCraft.currency)} · implicit replacement
                    {!item.implicits.length ? " · no implicit remains" : ""}
                </p>
            ) : null}
            {item.imprint ? (
                <p className="border-t px-4 py-3 text-xs text-muted-foreground">
                    Imprint stored · {item.imprint.rarity} · {item.imprint.mods.length} modifiers.
                    Apply Imprint to restore and consume it.
                </p>
            ) : null}
            {item.unidentified ? (
                <p className="px-4 py-6 text-sm text-muted-foreground" role="status">
                    Explicit modifiers are unknown. Use the identification currency to roll the
                    ordinary identification model. Requirements are evaluated after identification.
                </p>
            ) : !item.mods.length && !item.destroyed ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">
                    No explicit modifiers. Apply a craft or add starting modifiers from the list.
                </p>
            ) : null}
            {item.corrupted || item.mirrored || item.split || item.sanctified ? (
                <p className="border-t px-4 py-2 text-sm text-destructive">
                    {[
                        item.twiceCorrupted
                            ? cleanModText(
                                  engine.catalog.crafting.templeCorruption!.twiceCorruptedText,
                              )
                            : item.corrupted && "Corrupted",
                        item.mirrored && "Mirrored",
                        item.split && "Split",
                        item.corruptedBy && engine.costName(item.corruptedBy),
                        item.sanctified && "Sanctified",
                    ]
                        .filter(Boolean)
                        .join(" · ")}
                </p>
            ) : null}
        </section>
    );
}
