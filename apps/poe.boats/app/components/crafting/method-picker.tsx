import { useId } from "react";
import { CatalogPicker } from "~/components/recombinator/catalog-item-editor";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { allflameDucatActions, allflameQuote } from "~/lib/crafting-allflame";
import {
    anointingOils,
    anointingRecipes,
    anointment,
    anointmentText,
    availableAnointments,
    blightedMap,
    mapOilLimit,
} from "~/lib/crafting-anointing";
import {
    augment,
    augmentCreatesJewelSocket,
    augmentRule,
    augmentText,
    augmentUpgrader,
    availableAugments,
    socketedStats,
} from "~/lib/crafting-augments";
import {
    supportsLocus,
    supportsTabletCorruption,
    supportsTempleCorruption,
    tabletCorruptionUses,
} from "~/lib/crafting-corruption";
import { supportsSacredOrb } from "~/lib/crafting-defences";
import { flaskEnchantmentPool } from "~/lib/crafting-enchantments";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { genesisSupported } from "~/lib/crafting-genesis";
import { graspingMailBase } from "~/lib/crafting-grasping";
import { memoryConsumption } from "~/lib/crafting-memory";
import { availableOmens, omenEffects } from "~/lib/crafting-omens";
import {
    availableBaseQuality,
    availableCatalysts,
    availableMapQuality,
    availableQualityInfusers,
    baseQualityLimit,
    baseQualityOutcomes,
    catalysingMultiplier,
    catalystLimit,
    catalystQualityOutcomes,
    mapQualityIncrement,
    qualityInfuserState,
} from "~/lib/crafting-quality";
import { supportsRecombination } from "~/lib/crafting-recombination";
import { hasAbyssSockets, socketBenchEligible, socketLimit } from "~/lib/crafting-sockets";
import { strongbox, strongboxMethod } from "~/lib/crafting-strongboxes";
import { cleanModText } from "~/lib/crafting-text";
import { RECOMBINATOR_EXCLUSIVE_URL, RECOMBINATOR_TABLE_URL } from "~/lib/recombinator";
import type { CraftingItem, CraftingMethod, CraftingProject } from "~/schemas/crafting";
import { AllflameOptions } from "./allflame-panel";
import { GenesisOptions } from "./genesis-options";
import { GraspingOptions } from "./grasping-options";
import { modText } from "./item-card";
import { methodPinKey, PinnedMethods } from "./pinned-methods";
import { TangledFossilPicker } from "./tangled-fossil-picker";

export const controlClass =
    "w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-2 focus-visible:outline-ring";
export function MethodPicker({
    engine,
    item,
    value,
    onChange,
    inventory = [],
}: {
    engine: CraftingEngine;
    item: CraftingItem;
    value: CraftingMethod;
    onChange: (method: CraftingMethod) => void;
    inventory?: CraftingProject["inventory"];
}) {
    const id = useId();
    const data = engine.catalog.crafting;
    const allflameCurrencies = new Set(data.allflame?.currencies.map((entry) => entry.currency));
    const resonators = data.currencies
        .filter((entry) =>
            ["delve_currency_upgrade", "delve_currency_reroll"].includes(entry.action),
        )
        .sort(
            (a, b) => Number(allflameCurrencies.has(b.id)) - Number(allflameCurrencies.has(a.id)),
        );
    const base = engine.base(item);
    const catalysts = availableCatalysts(engine.catalog, item);
    const mapQualityTypes = availableMapQuality(engine.catalog, item);
    const selectedMapQuality =
        value.kind === "currency"
            ? data.mapQuality.find((entry) => entry.id === value.id)
            : undefined;
    const selectedCatalyst =
        value.kind === "currency"
            ? data.catalysts.find((entry) => entry.id === value.id)
            : undefined;
    const selectedTaintedCatalyst =
        value.kind === "currency"
            ? data.taintedCatalysts.find((entry) => entry.id === value.id)
            : undefined;
    const qualityOutcomes = catalystQualityOutcomes(engine.catalog, item);
    const baseQuality = availableBaseQuality(engine.catalog, item);
    const infusers = availableQualityInfusers(engine.catalog, item);
    const infuser =
        value.kind === "currency" ? qualityInfuserState(engine.catalog, item, value.id) : undefined;
    const selectedQuality =
        value.kind === "currency"
            ? data.baseQuality.find((entry) => entry.id === value.id)
            : undefined;
    const strandConsumption = memoryConsumption(engine.catalog, item, value);
    const selectedAction =
        value.kind === "currency"
            ? data.currencies.find((entry) => entry.id === value.id)?.action
            : undefined;
    const methods: { value: CraftingMethod; label: string }[] = [
        ...(genesisSupported(engine.catalog, item) &&
        engine.generationRarities(item).includes("rare")
            ? [
                  {
                      value: { kind: "genesis" as const, id: "genesis" as const, nodes: [] },
                      label: data.genesis!.name,
                  },
              ]
            : []),
        ...engine.generationRarities(item).map((rarity) => ({
            value: { kind: "generate" as const, id: rarity },
            label: `Generate ${rarity} item`,
        })),
        ...(item.jewelSocket ||
        availableAugments(engine.catalog, item).some(augmentCreatesJewelSocket)
            ? [
                  {
                      value: { kind: "socket_jewel" as const, id: "socket_jewel" as const },
                      label: "Socket inventory Jewel",
                  },
                  {
                      value: { kind: "remove_jewel" as const, id: "remove_jewel" as const },
                      label: "Remove socketed Jewel",
                  },
              ]
            : []),
        ...(supportsRecombination(engine, item)
            ? [
                  {
                      value: { kind: "recombine" as const, id: "recombine" as const },
                      label: "Recombine items",
                  },
              ]
            : []),
        ...availableAugments(engine.catalog, item).map((entry) => ({
            value: { kind: "augment" as const, id: entry.id },
            label: `Socket · ${entry.name}`,
        })),
        ...data.augments
            .filter(
                (entry) =>
                    socketLimit(engine.catalog, item) > 0 &&
                    augmentUpgrader(entry) &&
                    augmentRule(engine.catalog, item, entry),
            )
            .map((entry) => ({
                value: { kind: "upgrade_augment" as const, id: entry.id, socket: 0 },
                label: `Upgrade · ${entry.name}`,
            })),
        ...(supportsLocus(engine.catalog, item) && data.locus
            ? [{ value: { kind: "locus" as const, id: data.locus.id }, label: data.locus.name }]
            : []),
        ...availableAnointments(engine.catalog, item).map((recipe) => ({
            value: {
                kind: "anoint" as const,
                id: recipe.id,
                oils: anointingOils(engine.catalog, item),
            },
            label: `${engine.catalog.game === "poe1" ? "Anoint" : "Instil"} · ${anointmentText(engine.catalog, recipe.id)}`,
        })),
        ...data.beasts
            .filter((entry) => engine.beastOperation(entry.id))
            .filter((entry) => !entry.aspectMod || data.classes[base.item_class]?.aspects)
            .filter((entry) => !entry.mapCorruption || base.item_class === "Map")
            .filter(
                (entry) =>
                    !entry.maximumLinks ||
                    ((item.sockets ?? 0) >= 2 && !hasAbyssSockets(engine.catalog, item)),
            )
            .filter(
                (entry) =>
                    !entry.maximumSockets ||
                    (socketLimit(engine.catalog, item) > 0 &&
                        !hasAbyssSockets(engine.catalog, item)),
            )
            .filter((entry) => !entry.talismanCraft || base.tags.includes("talisman"))
            .filter(
                (entry) => !entry.augmentation || engine.beastAugmentationEligible(item, entry.id),
            )
            .filter(
                (entry) =>
                    !entry.metamods.length ||
                    data.bench.some(
                        (recipe) =>
                            recipe.mod &&
                            entry.metamods.includes(recipe.mod) &&
                            recipe.itemClasses.includes(base.item_class),
                    ),
            )
            .map((entry) => ({
                value: { kind: "beast" as const, id: entry.id },
                label: `Beastcraft · ${entry.category}: ${entry.description}`,
            })),
        {
            value: { kind: "reveal", preferred: [] },
            label:
                engine.catalog.game === "poe1" ? "Unveil modifier" : "Reveal desecrated modifier",
        },
        ...data.currencies
            .filter((currency) => engine.currencySupported(currency.action))
            .filter(
                (currency) =>
                    currency.action !== "identify" || engine.identificationSupported(item),
            )
            .filter(
                (currency) =>
                    !allflameDucatActions.has(currency.action) ||
                    allflameQuote(engine.catalog, item, { kind: "currency", id: currency.id }),
            )
            .filter(
                (currency) =>
                    currency.action !== "reroll_variable_defences" ||
                    supportsSacredOrb(engine.catalog, item),
            )
            .filter(
                (currency) =>
                    !data.qualityInfusers.some((entry) => entry.id === currency.id) ||
                    infusers.some((entry) => entry.id === currency.id),
            )
            .filter(
                (currency) =>
                    currency.action !== "incursion_corrupt_tablet" ||
                    supportsTabletCorruption(engine.catalog, item),
            )
            .filter(
                (currency) =>
                    currency.action !== "incursion_corrupt_equipment" ||
                    supportsTempleCorruption(engine.catalog, item, currency.action),
            )
            .filter(
                (currency) =>
                    currency.action !== "corrupt_item" ||
                    (currency.id.endsWith("/CurrencyCorrupt") && engine.corruptionKind(item)),
            )
            .filter(
                (currency) =>
                    !["add_equipment_socket", "reroll_socket_numbers_hellscape"].includes(
                        currency.action,
                    ) || socketLimit(engine.catalog, item) > 0,
            )
            .filter(
                (currency) =>
                    !data.baseQuality.some((entry) => entry.id === currency.id) ||
                    baseQuality.some((entry) => entry.id === currency.id),
            )
            .filter(
                (currency) =>
                    currency.action !== "add_map_alt_quality" ||
                    mapQualityTypes.some((entry) => entry.id === currency.id),
            )
            .filter(
                (currency) =>
                    !["add_jewellery_quality", "add_alternate_quality"].includes(currency.action) ||
                    catalysts.some((entry) => entry.id === currency.id),
            )
            .filter(
                (currency) =>
                    currency.action !== "add_random_jewellery_quality" ||
                    data.taintedCatalysts.some(
                        (entry) =>
                            entry.id === currency.id && entry.itemClasses.includes(base.item_class),
                    ),
            )
            .filter(
                (currency) =>
                    currency.action !== "use_liquid_emotion" ||
                    (engine.emotionSupported(currency.id) && engine.emotionRule(item, currency.id)),
            )
            .filter(
                (currency) =>
                    !["add_flask_injector", "add_flask_seal"].includes(currency.action) ||
                    flaskEnchantmentPool(engine.catalog, item, currency.id).length > 0,
            )
            .map((currency) => ({
                value: { kind: "currency" as const, id: currency.id },
                label: currency.name,
            })),
        ...data.essences
            .filter((essence) => essence.mods[base.item_class])
            .map((essence) => ({
                value: { kind: "essence" as const, id: essence.id },
                label: essence.name,
            })),
        ...data.bench
            .filter((recipe) => !recipe.mod || engine.catalog.mods[recipe.mod])
            .filter((recipe) =>
                recipe.socketCount || recipe.linkCount
                    ? socketBenchEligible(engine.catalog, item, recipe)
                    : recipe.enchantment
                      ? recipe.enchantment.itemClasses.includes(base.item_class)
                      : recipe.mod
                        ? recipe.itemClasses.includes(base.item_class) &&
                          ["prefix", "suffix"].includes(engine.mod(recipe.mod).generation_type)
                        : recipe.action === 0 ||
                          ([1, 8, 9].includes(recipe.action ?? -1) &&
                              recipe.itemClasses.includes(base.item_class)),
            )
            .map((recipe) => ({
                value: { kind: "bench" as const, id: recipe.id },
                label: `Bench · ${engine.methodName({ kind: "bench", id: recipe.id })}`,
            })),
        ...data.harvest
            .filter((recipe) => engine.harvestSupported(recipe.id))
            .filter(
                (recipe) =>
                    !recipe.influenceRerollClasses ||
                    recipe.influenceRerollClasses.includes(base.item_class),
            )
            .filter(
                (recipe) =>
                    !recipe.enchantment || recipe.enchantment.itemClasses.includes(base.item_class),
            )
            .map((recipe) => ({
                value: { kind: "harvest" as const, id: recipe.id },
                label: `Harvest · ${recipe.name}`,
            })),
        ...data.poe2Essences
            .filter(
                (essence) =>
                    engine.essenceSupported(essence.id) &&
                    essence.rules.some((rule) => rule.itemClasses.includes(base.item_class)),
            )
            .map((essence) => ({
                value: { kind: "essence" as const, id: essence.id },
                label: essence.name,
            })),
    ];
    const options = methods
        .filter((entry) => !base.strongbox || strongboxMethod(engine.catalog, entry.value))
        .map((entry) => ({
            id: JSON.stringify(entry.value),
            label: entry.label,
            pin: methodPinKey(entry.value),
        }));
    const anoint = value.kind === "anoint" ? anointment(engine.catalog, value.id) : undefined;
    const enchantment =
        value.kind === "harvest"
            ? data.harvest.find((recipe) => recipe.id === value.id)?.enchantment
            : value.kind === "bench"
              ? data.bench.find((recipe) => recipe.id === value.id)?.enchantment
              : undefined;
    const flaskPool =
        value.kind === "currency" ? flaskEnchantmentPool(engine.catalog, item, value.id) : [];
    const affinity =
        value.kind === "harvest"
            ? data.harvest.find((recipe) => recipe.id === value.id)?.affinityMultiplier
            : undefined;
    const selectedMethod =
        value.kind === "generate" ||
        value.kind === "currency" ||
        value.kind === "essence" ||
        value.kind === "beast" ||
        value.kind === "recombine" ||
        value.kind === "socket_jewel" ||
        value.kind === "augment"
            ? { kind: value.kind, id: value.id }
            : value.kind === "upgrade_augment"
              ? { kind: value.kind, id: value.id, socket: 0 }
              : value.kind === "genesis"
                ? { kind: value.kind, id: value.id, nodes: [] }
                : value.kind === "anoint"
                  ? { kind: value.kind, id: value.id, oils: anointingOils(engine.catalog, item) }
                  : value.kind === "reveal"
                    ? { kind: "reveal", preferred: [] }
                    : value.kind === "fossils"
                      ? {
                            kind: value.kind,
                            ids: value.ids,
                            resonator: value.resonator,
                            logic: value.logic,
                            tangled: value.tangled,
                        }
                      : value;
    const omens = availableOmens(engine.catalog, value, base.item_class);
    const omenRestrictions = new Map(
        omens.flatMap((omen) => {
            if (!("omens" in value) || value.omens?.includes(omen.id)) return [];
            try {
                omenEffects(engine.catalog, { ...value, omens: [...(value.omens ?? []), omen.id] });
                return [];
            } catch (error) {
                return [[omen.id, error instanceof Error ? error.message : String(error)] as const];
            }
        }),
    );
    const fossils = engine.availableFossils(item);
    const upgradeSockets = (item.augments ?? []).flatMap((id, index) => {
        const entry = augment(engine.catalog, id);
        return entry.type.socketedStat === "num_socketed_runes" && entry.higherTier
            ? [
                  {
                      id: String(index),
                      label: `Socket ${index + 1} · ${entry.name} → ${augment(engine.catalog, entry.higherTier).name}`,
                  },
              ]
            : [];
    });
    const selectedFossils =
        value.kind === "fossils"
            ? value.ids
                  .filter((id) => !fossils.some((fossil) => fossil.id === id))
                  .map((id) => engine.fossil(id))
            : [];
    if (fossils.length && !base.strongbox)
        options.push({ id: "fossils", label: "Fossils + resonator", pin: "fossils" });
    const selectMethod = (selected: string) => {
        if (selected === "fossils") {
            const resonator = resonators.find(
                (entry) =>
                    entry.action ===
                        (item.rarity === "normal"
                            ? "delve_currency_upgrade"
                            : "delve_currency_reroll") && entry.id.endsWith("1"),
            );
            if (resonator && fossils[0])
                onChange({
                    kind: "fossils",
                    ids: [fossils[0].id],
                    resonator: resonator.id,
                    logic: "additive",
                });
        } else {
            const chosen = methods.find((entry) => JSON.stringify(entry.value) === selected)?.value;
            if (chosen)
                onChange(
                    chosen.kind === "beast" && engine.beastRequiresLevel(chosen.id)
                        ? {
                              ...chosen,
                              level: Math.max(
                                  item.level,
                                  ...data.beasts
                                      .find((entry) => entry.id === chosen.id)!
                                      .components.map((entry) => entry.level),
                              ),
                          }
                        : chosen.kind === "currency" &&
                            allflameDucatActions.has(
                                data.currencies.find((entry) => entry.id === chosen.id)!.action,
                            )
                          ? { ...chosen, allflame: true }
                          : chosen,
                );
        }
    };
    return (
        <div className="space-y-3">
            <AllflameOptions engine={engine} item={item} value={value} onChange={onChange} />
            {value.kind === "beast" && engine.beastOperation(value.id) === "metamod" ? (
                <p
                    className="text-xs text-muted-foreground"
                    role="note"
                    aria-label="Metamod beastcraft model"
                >
                    Adds one eligible crafted metamod with an equal modeled chance. Full suffixes
                    force Suffixes Cannot Be Changed when a prefix is open. Existing crafts must be
                    removed first, except Can have up to 3 Crafted Modifiers. Item and beast levels
                    do not restrict these bench modifiers. Memory Strands remain unchanged. Choose
                    targets from Bench modifiers. Prices cover the complete beast recipe.
                </p>
            ) : null}
            {value.kind === "beast" && engine.beastOperation(value.id) === "augment" ? (
                <p
                    className="text-xs text-muted-foreground"
                    role="note"
                    aria-label="Augmentation beastcraft model"
                >
                    Adds one modifier to a rare item matching the recipe. Uses the ordinary pool at
                    the item's level, including eligible influence modifiers, and respects blocked
                    modifier types and open affix slots. No influence modifier is guaranteed. Memory
                    Strands remain unchanged. Prices cover the complete beast recipe.
                </p>
            ) : null}
            {value.kind === "beast" && engine.beastOperation(value.id) === "talisman" ? (
                <p
                    className="text-xs text-muted-foreground"
                    role="note"
                    aria-label="Talisman beastcraft model"
                >
                    Requires an uncorrupted, unmirrored rare Talisman without fractures. Imprints
                    retain modifiers, values and Memory Strands for restoration. Fracture recipes
                    require the stated modifier count and no influence; each eligible modifier has
                    an equal modeled chance, with two distinct modifiers chosen for a double
                    fracture. Fractured items cannot be restored from an imprint. Prices cover the
                    complete beast recipe.
                </p>
            ) : null}
            {value.kind === "beast" && engine.beastOperation(value.id) === "maximum-sockets" ? (
                <p
                    className="text-xs text-muted-foreground"
                    role="note"
                    aria-label="Socket beastcraft model"
                >
                    Sets ordinary gem sockets to the base's full capacity. This model assumes item
                    level does not reduce that capacity. Requires an uncorrupted, unmirrored item.
                    Prices cover the complete beast recipe. Changing socket count clears known
                    links; their resulting distribution and socket colours are not modeled.
                </p>
            ) : null}
            {value.kind === "bench" &&
            data.bench.find((entry) => entry.id === value.id)?.enchantment ? (
                <p className="text-xs text-muted-foreground">
                    Replaces the current flask enchantment. Replacing an Instilling enchantment also
                    charges the extracted Remove Enchantments recipe, following the reference model.
                </p>
            ) : null}
            {value.kind === "bench" && data.bench.find((entry) => entry.id === value.id)?.mod ? (
                <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={Boolean(value.skipOnConflict)}
                            onChange={(event) =>
                                onChange({ ...value, skipOnConflict: event.target.checked })
                            }
                        />
                        Skip addition when the bench modifier conflicts
                    </label>
                    <p className="text-xs text-muted-foreground">
                        A single existing craft is removed first at the extracted removal cost.
                        Fractured crafts cannot be removed. With multiple-craft capacity, existing
                        crafts stay. Normal items become magic after a successful addition.
                    </p>
                    {value.skipOnConflict ? (
                        <p className="text-xs text-muted-foreground">
                            Full slots, duplicate modifiers and conflicting groups skip the
                            addition. Any completed removal remains paid. Process conditions check
                            the resulting item; invalid recipes and incompatible item states still
                            stop the process.
                        </p>
                    ) : null}
                </div>
            ) : null}
            {value.kind === "bench" &&
            [8, 9].includes(data.bench.find((entry) => entry.id === value.id)?.action ?? -1) ? (
                <p
                    className="text-xs text-muted-foreground"
                    role="note"
                    aria-label="Bench reroll model"
                >
                    Removes random eligible modifiers, then rolls the same number of replacements.
                    Fractures and metamods protect removals; protections are checked again after
                    each removal. The recipe still costs currency when all modifiers are protected
                    or no replacement can roll. Requires an uncorrupted, unmirrored rare item.
                    Memory Strands remain unchanged.
                </p>
            ) : null}
            {value.kind === "bench" &&
            data.bench.find((entry) => entry.id === value.id)?.socketCount ? (
                <p className="text-xs text-muted-foreground">
                    Sets the gem socket count up to this base's maximum, regardless of item level.
                    Corrupted items also cost one Vaal Orb per unit of recipe currency under the
                    modeled bench surcharge rule. Mirrored items cannot use this craft. Changing
                    socket count clears known links; their resulting distribution and socket colours
                    are not modeled.
                </p>
            ) : null}
            {(value.kind === "bench" &&
                data.bench.find((entry) => entry.id === value.id)?.linkCount) ||
            (value.kind === "beast" &&
                data.beasts.find((entry) => entry.id === value.id)?.maximumLinks) ? (
                <p
                    className="text-xs text-muted-foreground"
                    role="note"
                    aria-label="Socket linking model"
                >
                    {value.kind === "bench"
                        ? "Links the first group of sockets. Remaining links are unknown; requirements are calculated only when the guaranteed group settles the result. Corrupted items also cost one Vaal Orb per unit of recipe currency."
                        : "Links all current gem sockets without adding sockets. Requires an uncorrupted item; prices cover the complete beast recipe."}{" "}
                    Mirrored items cannot use this craft. Socket colours are not modeled.
                </p>
            ) : null}
            {value.kind === "upgrade_augment" ? (
                <div className="flex flex-col gap-2 text-xs">
                    <p>
                        Upgrades the selected socketed Rune by one tier and consumes one{" "}
                        {augment(engine.catalog, value.id).name}. The upgraded Rune stays in the
                        same socket.
                    </p>
                    <CatalogPicker
                        id={`${id}-upgrade-socket`}
                        label="Rune socket to upgrade"
                        options={upgradeSockets}
                        value={upgradeSockets.find((entry) => entry.id === String(value.socket))}
                        onSelect={(selected) => onChange({ ...value, socket: Number(selected) })}
                    />
                    {!upgradeSockets.length ? (
                        <p>
                            Socket a Rune with an available higher tier before applying this craft.
                        </p>
                    ) : null}
                </div>
            ) : null}
            {value.kind === "augment" ? (
                <div className="space-y-2 rounded border border-border p-3 text-xs">
                    <p className="whitespace-pre-line">
                        {cleanModText(
                            augmentText(engine.catalog, item, value.id) ??
                                "No translated effect for this item class.",
                        )}
                    </p>
                    <p>
                        {augment(engine.catalog, value.id).socketBound
                            ? "Socket-bound: cannot be replaced."
                            : "Replaces an existing augment permanently when a socket is chosen below."}
                    </p>
                    {augmentCreatesJewelSocket(augment(engine.catalog, value.id)) ? (
                        <p role="note" aria-label="Jewel socket conversion">
                            Permanently destroys every augment and augment socket to create one
                            Jewel socket. Cannot be used while a socket-bound augment is present.
                            Artificer's Orbs and corruption cannot restore augment sockets. Socketed
                            Jewels are not modeled yet.
                        </p>
                    ) : null}
                    {augment(engine.catalog, value.id).limit ? (
                        <p>
                            Limit: {augment(engine.catalog, value.id).limit!.amount} per character.
                            This workbench checks the current item.
                        </p>
                    ) : null}
                    {augmentRule(engine.catalog, item, augment(engine.catalog, value.id))
                        ?.bondedText ? (
                        <p>
                            Bonded bonuses are included when this item's socketed effects grant
                            them. Character passives are not modeled.
                        </p>
                    ) : null}
                    <CatalogPicker
                        id={`${id}-augment-slot`}
                        label="Augment destination"
                        options={[
                            { id: "empty", label: "Empty socket" },
                            ...(item.augments ?? [])
                                .map((entry, index) => ({
                                    id: String(index),
                                    label: `Replace socket ${index + 1} · ${augment(engine.catalog, entry).name}`,
                                }))
                                .filter(
                                    (entry) =>
                                        !augment(engine.catalog, item.augments![Number(entry.id)]!)
                                            .socketBound,
                                ),
                        ]}
                        value={
                            value.replace === undefined
                                ? { id: "empty", label: "Empty socket" }
                                : {
                                      id: String(value.replace),
                                      label: `Replace socket ${value.replace + 1}`,
                                  }
                        }
                        onSelect={(selected) =>
                            onChange({
                                ...value,
                                replace: selected === "empty" ? undefined : Number(selected),
                            })
                        }
                    />
                </div>
            ) : null}
            {value.kind === "harvest" &&
            data.harvest.find((entry) => entry.id === value.id)?.influenceRerollClasses ? (
                <p
                    className="text-xs text-muted-foreground"
                    role="note"
                    aria-label="Harvest influence reroll"
                >
                    The model requires a rare item with one influence. It chooses a different
                    eligible influence with equal probability and reforges modifiers, preserving
                    metamod locks. Protected influenced modifiers prevent use. Normal, magic and
                    dual-influence behavior is not verified yet.
                </p>
            ) : null}
            <CatalogPicker
                id={`${id}-method`}
                label="Crafting method"
                options={options}
                value={
                    value.kind === "fossils"
                        ? options.find((entry) => entry.id === "fossils")
                        : options.find((entry) => entry.id === JSON.stringify(selectedMethod))
                }
                onSelect={selectMethod}
            />
            <PinnedMethods
                game={engine.catalog.game}
                options={options}
                current={methodPinKey(value)}
                onSelect={selectMethod}
            />
            {value.kind === "generate" &&
            value.id === "rare" &&
            engine.catalog.game === "poe1" &&
            item.baseId === graspingMailBase ? (
                <GraspingOptions method={value} onChange={onChange} />
            ) : value.kind === "generate" ? (
                <p
                    className="text-xs text-muted-foreground"
                    role="note"
                    aria-label="Item generation model"
                >
                    Replace the current item with a fresh {value.id} item of the same base and
                    level. Previous crafting state is cleared. Native implicits and base defences
                    roll uniformly within extracted bounds; sockets start at the base's native
                    count. Magic and rare affixes use the ordinary currency roll model. Enter a
                    Generated {value.id} item price for each replacement; starting-item and
                    process-restart prices are separate. This does not model dropped items or
                    identification.
                </p>
            ) : null}
            {value.kind === "currency" &&
            data.currencies.find((entry) => entry.id === value.id)?.action === "identify" ? (
                <p
                    className="text-xs text-muted-foreground"
                    role="note"
                    aria-label="Identification model"
                >
                    Identify an ordinary magic or rare equipment template using the extracted
                    modifier pool and the ordinary affix-count model. Known implicits, properties
                    and influences are retained. In PoE 1, Memory Strands restrict eligible tiers
                    without being consumed. One currency is spent. Special drop pools and hidden
                    pre-existing modifiers are not modeled.
                </p>
            ) : null}
            {value.kind === "genesis" ? (
                <GenesisOptions catalog={engine.catalog} method={value} onChange={onChange} />
            ) : null}
            {selectedAction === "fracture_random_mod" && engine.catalog.game === "poe2" ? (
                <p
                    className="text-xs text-muted-foreground"
                    role="note"
                    aria-label="Fracturing model"
                >
                    Each eligible explicit modifier has an equal modeled chance to fracture. Crafted
                    modifiers can fracture and still occupy a crafted slot. Desecrated and
                    unrevealed modifiers cannot fracture.
                </p>
            ) : null}
            {selectedAction === "reroll_socket_numbers_hellscape" ? (
                <p
                    className="text-xs text-muted-foreground"
                    role="note"
                    aria-label="Tainted Jeweller model"
                >
                    Requires a corrupted item with ordinary gem sockets. Models equal chances to add
                    or remove one socket; removal leaves one socket when already at one. Cannot be
                    used at the extracted item-level maximum of{" "}
                    {socketLimit(engine.catalog, item, item.level)} sockets. Quality does not change
                    these modeled odds. Colours and links are not modeled.
                </p>
            ) : null}
            {selectedAction === "upgrade_mod_tier_hellscape" ? (
                <p
                    className="text-xs text-muted-foreground"
                    role="note"
                    aria-label="Tainted Divine model"
                >
                    Requires a corrupted rare item. Each eligible modifier independently attempts to
                    move one tier up or down with equal modeled chances. An attempt beyond its
                    available tiers leaves its values unchanged. Changed tiers roll new values. Uses
                    this base's natural tiers at the item level; crafted, fractured, locked and
                    non-rollable modifiers stay unchanged. Memory strands do not restrict tiers or
                    get consumed.
                </p>
            ) : null}
            {selectedAction === "reroll_rare_hellscape" ? (
                <p
                    className="text-xs text-muted-foreground"
                    role="note"
                    aria-label="Tainted Chaos model"
                >
                    Requires a corrupted rare item. Models equal chances to reforge or scour its
                    modifiers, preserving fractures and affix locks. Scouring lowers rarity to
                    normal, magic or rare according to the modifiers that remain. A normal or magic
                    result cannot use another Tainted Chaos Orb.
                </p>
            ) : null}
            {selectedAction === "add_mod_to_rare_hellscape" ? (
                <p
                    className="text-xs text-muted-foreground"
                    role="note"
                    aria-label="Tainted Exalted model"
                >
                    Requires a corrupted rare item. Models equal chances to add or remove one
                    modifier. An empty item always gains one; a full item always loses one.
                    Fractures and metamods are respected. Rarity stays rare, even when the last
                    modifier is removed. Impossible add or remove branches prevent use.
                </p>
            ) : null}
            {selectedAction === "incursion_corrupt_tablet" ? (
                <section aria-label="Ancient Infuser model" className="space-y-2 text-xs">
                    <p>
                        Models three equally likely outcomes: add one modifier beyond ordinary affix
                        limits, add {tabletCorruptionUses} uses, change to a random tablet and
                        reroll its current number of modifiers. Every outcome corrupts it and
                        preserves its rarity. A random tablet can be the same base.
                    </p>
                    <p>
                        Tablet bases, modifiers and starting uses come from this build. Outcome
                        chances are assumed equal after the 0.4.0c patch removed destruction; the
                        extra uses follow the reference model. Rare tablets have four ordinary
                        affixes, with two per side.
                    </p>
                </section>
            ) : null}
            {selectedAction === "incursion_corrupt_equipment" ? (
                <section aria-label="Architect's Orb model" className="space-y-2 text-xs">
                    <p>
                        Requires corrupted equipment or a jewel. Models a 50% chance to replace one
                        changeable implicit with a weighted corruption modifier and a 50% chance to
                        destroy the item. An item with no changeable implicit gains one. Surviving
                        items become twice corrupted and cannot use another Architect's Orb.
                    </p>
                    <p>
                        Eligible classes and modifiers come from this build. Outcome chances follow
                        the reference model, not an extracted server probability table. Destroyed
                        items fail requirements; currency costs and history are retained.
                    </p>
                </section>
            ) : null}
            {selectedAction === "corrupt_item" ? (
                <section aria-label="Vaal Orb model" className="space-y-2 text-xs">
                    {strongbox(engine.catalog, item) ? (
                        <p>
                            Marks the Strongbox corrupted and preserves its affixes under the
                            reference model. The contents of the chest are not simulated.
                        </p>
                    ) : item.blight ? (
                        <p>
                            Vaal transformations of Blighted Maps are not supported yet. Set up an
                            already-corrupted map to use Tainted Oil anointments.
                        </p>
                    ) : engine.corruptionKind(item) === "quality" ? (
                        <p>
                            Corrupts the flask and changes quality by a uniformly modeled integer
                            from −10 to +10, clamped to 0–{engine.corruptionQualityLimit()}%.
                        </p>
                    ) : engine.catalog.game === "poe1" &&
                      engine.corruptionKind(item) === "equipment" ? (
                        <p>
                            Models four equally likely outcomes: no change, reroll to a rare item
                            with up to six affixes, replace one changeable implicit with a weighted
                            corrupted modifier, or white sockets. Rerolls respect fractures,
                            prefix/suffix locks, base affix limits and the eligible modifier pool.
                            Every outcome corrupts the item. As in the reference, the white-socket
                            branch leaves modeled properties unchanged; PoE 1 socket colours and
                            links are not stored. An empty corrupted pool leaves implicits
                            unchanged.
                        </p>
                    ) : engine.corruptionKind(item) === "poe1-jewel" ? (
                        <p>
                            Models four equal outcomes: no change, a weighted corrupted implicit, a
                            rare reroll with up to four affixes, or the reference's unique-jewel
                            branch. The unique-jewel branch leaves modeled properties unchanged;
                            unique transformations are not represented. Rare rerolls preserve
                            fractures and respect affix limits. Every outcome corrupts the jewel.
                        </p>
                    ) : engine.corruptionKind(item) === "jewel" ? (
                        <p>
                            Models a 50% no-change chance, 25% chance to add a corrupted implicit,
                            and 25% chance to reroll explicit values. Value rerolls draw one uniform
                            78–122% multiplier per eligible modifier, shared by its stats, then
                            round each result. Fractured modifiers keep their values. Every outcome
                            corrupts the jewel. Omen of Corruption removes both no-change entries,
                            leaving the implicit and value outcomes equally likely.
                        </p>
                    ) : engine.corruptionKind(item) === "map" ? (
                        <p>
                            Four equal outcomes: unchanged modifiers, a rare transformation, eight
                            explicit modifiers, or a corrupted implicit. Transformation has a 50%
                            chance to follow the extracted upgrade link; tier 16 becomes Vaal
                            Temple. It removes existing modifiers and rerolls four to six affixes.
                            The eight-modifier outcome allows four prefixes and four suffixes. Every
                            outcome corrupts the map.
                        </p>
                    ) : engine.corruptionKind(item) === "waystone" ? (
                        <p>
                            Models four equally likely outcomes: no change, change tier by one and
                            reroll existing affixes, replace suffixes with new prefixes, or add zero
                            to four affixes up to eight total with four per side. Tier changes
                            choose up or down equally and stay on the current base at a boundary.
                            Suffix replacement preserves fractured suffixes; tier rerolls remove
                            fractures. Every outcome corrupts the Waystone and preserves its rarity.
                        </p>
                    ) : (
                        <p>
                            Models four equally likely outcomes: no change, remove and replace one
                            to three eligible modifiers, replace one implicit with a corrupted
                            modifier, or add an augment socket. Every outcome corrupts the item. The
                            socket outcome leaves socketless bases unchanged; an empty
                            corrupted-modifier pool also leaves implicits unchanged.
                        </p>
                    )}
                    <p>
                        Outcome chances follow the reference model. Modifier records, map and
                        Waystone tiers and socket limits come from this build.
                        {engine.catalog.game === "poe2"
                            ? base.strongbox
                                ? " Omen of Corruption is consumed without changing this Strongbox outcome."
                                : " Omen of Corruption removes the explicit no-change outcome."
                            : ""}
                    </p>
                    {(socketedStats(engine.catalog, item).get(
                        "soul_core_cannot_roll_no_outcome_with_corruption",
                    ) ?? 0) > 0 ? (
                        <p>
                            A socketed augment removes the explicit no-change outcome. Adding Omen
                            of Corruption does not remove another outcome.
                        </p>
                    ) : null}
                </section>
            ) : null}
            {selectedAction === "reroll_variable_defences" ? (
                <p
                    className="text-xs text-muted-foreground"
                    role="note"
                    aria-label="Sacred Orb model"
                >
                    Rerolls each raw base defence independently within its extracted range, using
                    uniform integer outcomes from the reference model. Preserves quality, modifiers
                    and other item properties. Requires uncorrupted, unmirrored armour.
                </p>
            ) : null}
            {value.kind === "locus" ? (
                <section aria-label="Locus of Corruption model" className="space-y-2 text-xs">
                    <p>{data.locus?.description}</p>
                    <p>
                        Models four equal outcomes: up to two different weighted corrupted
                        implicits, white sockets, a rare reroll with a random eligible influence, or
                        destruction. Up to two changeable implicits are replaced; locked implicits
                        remain. Implicit rolls stop if the extracted compatible pool is exhausted.
                        Existing influences, fractures and Eldritch implicits prevent adding an
                        influence. Jewels use their ordinary affix limits and have no eligible
                        influence. The white-socket branch leaves modeled properties unchanged
                        because gem socket colours and links are not stored. All outcomes corrupt
                        the item.
                    </p>
                    <p>
                        The room, class eligibility and modifier records come from this build.
                        Outcome probabilities follow the reference model. Enter the cost of one use
                        of the altar; destroyed outcomes still spend that cost and fail
                        requirements.
                    </p>
                </section>
            ) : null}
            {selectedAction === "add_equipment_socket" ? (
                <p className="text-xs text-muted-foreground">
                    Adds one augment socket, up to this base's extracted limit of{" "}
                    {socketLimit(engine.catalog, item)}.
                </p>
            ) : null}
            {selectedAction === "conflict_orb" ? (
                <section aria-label="Orb of Conflict model" className="space-y-2 text-xs">
                    <p>
                        Raises one Eldritch implicit by one strength and lowers the other. A Lesser
                        implicit is removed when lowered. A Perfect implicit keeps its values when
                        selected for an upgrade. Both implicits must be present before each use.
                    </p>
                    <p className="text-muted-foreground">
                        The model follows Craft of Exile's 50/50 choice of direction. The client
                        says relative strength affects the chance, but this build does not provide
                        those server probabilities. Modifier families and roll ranges come from the
                        extracted build.
                    </p>
                </section>
            ) : null}
            {selectedMapQuality ? (
                <section className="space-y-2 text-xs" aria-label="Map quality model">
                    <p>
                        Adds {mapQualityIncrement(item)}%{" "}
                        {selectedMapQuality.description.toLowerCase()}, up to{" "}
                        {selectedMapQuality.maximumQuality}%. Changing type resets the previous
                        quality. Each application spends one chisel.
                    </p>
                    <p className="text-muted-foreground">
                        Requires an uncorrupted, unmirrored map. The reference model adds 5% for
                        normal, 2% for magic and 1% for rare maps, regardless of item level. Types,
                        labels, affected stats and caps come from the extracted build.
                    </p>
                </section>
            ) : null}
            {selectedQuality ? (
                <section className="space-y-2 text-xs" aria-label="Base quality model">
                    <p>
                        {selectedQuality.corrupted
                            ? `Replaces quality on a corrupted item with a uniformly modeled integer roll from 0 to ${selectedQuality.maximumQuality}%.`
                            : `Adds ${baseQualityOutcomes(engine.catalog, item, selectedQuality.id)
                                  .map((outcome) => `${outcome.value}%`)
                                  .join(
                                      " or ",
                                  )} quality at this item level, up to ${baseQualityLimit(engine.catalog, item)}%. Rarity does not change the increment.`}{" "}
                        Each application spends one currency and preserves modifiers.
                    </p>
                    <p className="text-muted-foreground">
                        {selectedQuality.corrupted
                            ? "The maximum comes from this build's currency description; the uniform distribution is a model assumption."
                            : `Increments use the reference's item-level model, not extracted server probabilities.${engine.catalog.game === "poe2" && baseQualityOutcomes(engine.catalog, item, selectedQuality.id).length > 1 ? " At this level, 1% has an 80% chance and 2% has a 20% chance." : ""}`}{" "}
                        Quality requirements can stop a process loop. Base damage, defences and
                        skill effects are not calculated here.
                    </p>
                </section>
            ) : null}
            {infuser ? (
                <section className="flex flex-col gap-2 text-xs" aria-label="Quality Infuser model">
                    <p>
                        Requires at least {infuser.maximum}%{" "}
                        {infuser.recipe.qualityType === "catalyst" ? "catalyst" : "base"} quality.
                        Adds{" "}
                        {infuser.increments
                            .map(
                                (entry) =>
                                    `${entry.value}%${infuser.increments.length > 1 ? ` (${(100 * entry.weight) / infuser.increments.reduce((sum, value) => sum + value.weight, 0)}% chance)` : ""}`,
                            )
                            .join(" or ")}{" "}
                        quality, up to {infuser.limit}%. Preserves modifiers and catalyst type. Each
                        use spends one Infuser.
                    </p>
                    <p>
                        Modeled corruption chance for this use: {infuser.corruptionChance}%. The
                        reference adds five percentage points per quality point above the ordinary
                        maximum, measured before this use. Corruption prevents further Infusers; use
                        corruption conditions to route a process. Eligibility and the extra{" "}
                        {infuser.recipe.extraMaximumQuality}% limit come from this build. Increments
                        and corruption chances are reference assumptions.
                    </p>
                </section>
            ) : null}
            {selectedCatalyst ? (
                <section aria-label="Catalyst application" className="flex flex-col gap-2 text-xs">
                    <p>
                        {cleanModText(
                            data.currencies.find((entry) => entry.id === selectedCatalyst.id)!
                                .description,
                        )}
                    </p>
                    <p>
                        One use adds{" "}
                        {qualityOutcomes
                            .map(
                                (outcome) =>
                                    `${outcome.value}%${qualityOutcomes.length > 1 ? ` (${(100 * outcome.weight) / qualityOutcomes.reduce((sum, entry) => sum + entry.weight, 0)}% chance)` : ""}`,
                            )
                            .join(" or ")}{" "}
                        quality, up to {catalystLimit(engine.catalog, item)}%. Changing catalyst
                        type resets the previous quality.
                    </p>
                    <p className="text-muted-foreground">
                        Increments follow Craft of Exile's item-level model, independently of
                        rarity. The per-use curve and PoE 2 chances are modeled rules, not extracted
                        server probabilities. Each application spends one catalyst. Quality
                        requirements can stop a process loop.
                    </p>
                </section>
            ) : null}
            {selectedTaintedCatalyst ? (
                <section
                    aria-label="Tainted Catalyst model"
                    className="flex flex-col gap-2 text-xs"
                >
                    <p>
                        Rerolls a corrupted, unmirrored item's catalyst type and quality. Each of
                        the {catalysts.length} eligible types is equally likely, including its
                        current type, with a uniform whole-number quality from 1% through{" "}
                        {selectedTaintedCatalyst.maximumQuality}%.
                    </p>
                    <p className="text-muted-foreground">
                        Each use spends one Tainted Catalyst and replaces previous quality. Quality
                        types, item classes and the maximum come from the build; uniform chances are
                        model assumptions. Quality or stat requirements can stop retries.
                    </p>
                </section>
            ) : null}
            {selectedAction === "consume_zana_influence_upgrade_mods" ? (
                <section
                    aria-label="Memory strand crafting"
                    className="flex flex-col gap-2 text-xs"
                >
                    <p>
                        Consumes all memory strands. Each eligible explicit modifier has an
                        independent upgrade chance based on its higher-tier weights and the complete
                        prefix or suffix pool.
                    </p>
                    <p className="text-muted-foreground">
                        Odds use the supplied empirical research model. Fractured modifiers keep
                        their tier and values. Special and crafted modifier tiers are not modeled
                        yet.
                    </p>
                </section>
            ) : selectedAction?.startsWith("mutated_") ? (
                <p className="text-xs text-muted-foreground">
                    Foulborn tier filtering uses the supplied research rating of 75. Existing
                    modifiers are retained.
                </p>
            ) : null}
            {selectedAction === "apply_zana_influence" ? (
                <section aria-label="Remembrance model" className="flex flex-col gap-2 text-xs">
                    <p>
                        Rerolls a normal equipment item's memory strands to 10–100. Each use spends
                        one Orb of Remembrance.
                    </p>
                    <p className="text-muted-foreground">
                        Estimated probabilities use 2,255 observations from the supplied research,
                        grouped in five-strand buckets and spread equally within each bucket. These
                        are empirical estimates, not extracted server probabilities. Strand
                        requirements can stop a process loop.
                    </p>
                </section>
            ) : null}
            {selectedAction === "enchant_map_zana_influence_drops" ? (
                <section
                    aria-label="Orb of Intention model"
                    className="flex flex-col gap-2 text-xs"
                >
                    <p>
                        Each use spends one orb and adds the extracted enchantment values to a
                        Memory Influenced Map, up to{" "}
                        {engine.catalog.crafting.memoryMaps!.maximumUses} uses. Intention
                        requirements can stop a process loop.
                    </p>
                    <p className="text-muted-foreground">
                        Map drops and memory-map corruption transformations are not modeled.
                    </p>
                </section>
            ) : null}
            {strandConsumption && item.memoryStrands ? (
                <section
                    aria-label="Memory strand consumption"
                    className="flex flex-col gap-2 text-xs"
                >
                    <p>
                        Tier filtering uses all {item.memoryStrands} starting strands
                        {selectedAction?.startsWith("mutated_")
                            ? " plus Foulborn's 75 tier rating"
                            : ""}
                        . After the craft, a uniformly sampled 0–{strandConsumption.maximum} strand
                        cost is subtracted, stopping at zero.
                    </p>
                    <p className="text-muted-foreground">
                        The range uses this build's extracted currency cost
                        {strandConsumption.exalt
                            ? " and Craft of Exile's affix-count estimate. Exalted consumption is uncertain; the supplied observations include a spend above this estimate"
                            : " with the reference's sampling model"}
                        . Consumption probabilities are modeled rather than server-verified.
                    </p>
                </section>
            ) : null}
            {anoint ? (
                <section aria-label="Anointing recipe" className="space-y-2 text-xs">
                    <p>Ingredients in recipe order:</p>
                    <p>
                        {(value.kind === "anoint"
                            ? anointingRecipes(value).flatMap(
                                  (id) => anointment(engine.catalog, id).items,
                              )
                            : anoint.items
                        )
                            .map((id) => engine.costName(id))
                            .join(" → ")}
                    </p>
                    {value.kind === "anoint" && anoint.type === "InfectedMap" ? (
                        <fieldset className="space-y-2" aria-label="Map oil selection">
                            <CatalogPicker
                                id={`${id}-map-oil`}
                                label="Add map oil"
                                disabled={
                                    anointingRecipes(value).length >=
                                    (blightedMap(engine.catalog, item)?.maximumAnointments ?? 0)
                                }
                                options={availableAnointments(engine.catalog, item)
                                    .filter(
                                        (recipe) =>
                                            anointingRecipes(value).filter((id) => id === recipe.id)
                                                .length < mapOilLimit(engine.catalog),
                                    )
                                    .map((recipe) => ({
                                        id: recipe.id,
                                        label: engine.costName(recipe.items[0]!),
                                    }))}
                                onSelect={(id) =>
                                    onChange({
                                        ...value,
                                        additional: [...(value.additional ?? []), id],
                                    })
                                }
                            />
                            {anointingRecipes(value).map((recipe, index) => (
                                <div
                                    // biome-ignore lint/suspicious/noArrayIndexKey: Identical oils occupy separate editable recipe slots.
                                    key={`${recipe}-${index}`}
                                    className="flex items-center justify-between gap-2"
                                >
                                    <span>
                                        Oil {index + 1}:{" "}
                                        {engine.costName(
                                            anointment(engine.catalog, recipe).items[0]!,
                                        )}
                                    </span>
                                    <Button
                                        size="xs"
                                        variant="ghost"
                                        disabled={anointingRecipes(value).length === 1}
                                        onClick={() => {
                                            const remaining = anointingRecipes(value).filter(
                                                (_, position) => position !== index,
                                            );
                                            onChange({
                                                ...value,
                                                id: remaining[0]!,
                                                additional: remaining.slice(1),
                                            });
                                        }}
                                    >
                                        Remove oil {index + 1}
                                    </Button>
                                </div>
                            ))}
                            <p>
                                Choose up to{" "}
                                {blightedMap(engine.catalog, item)?.maximumAnointments ?? 0} oils,
                                at most {mapOilLimit(engine.catalog)} of each type. All selected
                                oils are spent together; Tainted and Reflective Oils are charged
                                once per application.
                            </p>
                        </fieldset>
                    ) : null}
                    {anoint.passive ? (
                        <p className="whitespace-pre-line">
                            {cleanModText(
                                engine.catalog.crafting.anointing.passives[anoint.passive]!.text ??
                                    "No translated passive description in this build.",
                            )}
                        </p>
                    ) : null}
                    <p className="text-muted-foreground">
                        Replaces all existing anointments and preserves explicit modifiers. Passive
                        effects are shown separately from item-affix stat totals.
                    </p>
                    {value.kind === "anoint" && value.oils?.length ? (
                        <p>
                            Additional oil:{" "}
                            {value.oils.map((id) => engine.costName(id)).join(" + ")}
                        </p>
                    ) : null}
                </section>
            ) : null}
            {enchantment ? (
                <section
                    aria-label={
                        value.kind === "harvest" ? "Harvest enchantment" : "Bench enchantment"
                    }
                    className="space-y-2 text-xs"
                >
                    <p className="whitespace-pre-line">{modText(engine.mod(enchantment.mod))}</p>
                    <p className="text-muted-foreground">
                        Replaces the existing enchantment. Preserves quality, rarity, implicits and
                        explicit modifiers.
                    </p>
                </section>
            ) : null}
            {flaskPool.length ? (
                <p className="text-xs text-muted-foreground">
                    Replaces the existing flask enchantment with one of {flaskPool.length} eligible
                    outcomes using extracted weights. Numeric values roll within the extracted
                    ranges. This is a client-weight model.
                </p>
            ) : null}
            {affinity != null ? (
                <section aria-label="Harvest modifier weighting" className="space-y-2 text-xs">
                    <p>
                        Modifiers with the same type as a starting explicit modifier use {affinity}×
                        their normal weight, including other tiers. Unrelated modifier types keep
                        their normal weight.
                    </p>
                    <p className="text-muted-foreground">
                        Rerolls a rare item while respecting fractures and affix locks. Matching
                        modifiers are not guaranteed; weights use the modifier types present before
                        this craft.
                    </p>
                </section>
            ) : null}
            {value.kind === "currency" && engine.emotionRule(item, value.id) ? (
                <section className="space-y-1 text-xs" aria-label="Liquid Emotion outcome">
                    <p>Removes one random modifier and adds one of these crafted modifiers:</p>
                    {engine.emotionRule(item, value.id)!.mods.map((id) => (
                        <p key={id}>{modText(engine.mod(id))}</p>
                    ))}
                    <p className="text-muted-foreground">
                        Requires a rare jewel without a crafted modifier. Removal chances use the
                        uniform model. Compatible outcomes use equal weights as a model assumption.
                        If the selected affix side is full, removal is limited to that side.
                        Existing conflicting groups exclude outcomes.
                    </p>
                </section>
            ) : null}
            {engine.catalog.game === "poe2" &&
            value.kind === "essence" &&
            engine.poe2EssenceOperation(value.id) === "replace" ? (
                <p className="text-xs text-muted-foreground">
                    Selects a compatible guaranteed modifier before removing an affix. If its side
                    is full, removal is limited to that side unless a Crystallisation omen chooses
                    the side. Fractures are retained; existing conflicting groups block outcomes.
                </p>
            ) : null}
            {engine.catalog.game === "poe2" &&
            ((value.kind === "essence" &&
                data.poe2Essences
                    .find((entry) => entry.id === value.id)
                    ?.rules.some((rule) =>
                        rule.outcomes.some((entry) => engine.isAbyssalMark(entry.mod)),
                    )) ||
                (selectedAction?.startsWith("abyssal_bench_ticket_") &&
                    item.mods.some((entry) => engine.isAbyssalMark(entry.id)))) ? (
                <section aria-label="Abyssal Mark model" className="space-y-2 text-xs">
                    <p>{cleanModText(data.keywords.MarkofAbyssalLord!.definition)}</p>
                    <p className="text-muted-foreground">
                        Keeps the Mark's affix side. Necromancy omens are not consumed. The
                        reference model sets the minimum modifier level to floor(item level × 0.4),
                        or the bone's minimum if higher; this formula is not extracted from the
                        client. Replacing a fractured Mark removes its fracture; other fractures
                        remain. Putrefaction uses its own reroll without this floor and retains
                        fractured Marks.
                    </p>
                </section>
            ) : null}
            {value.kind === "beast" && engine.beastOperation(value.id) === "map-implicit" ? (
                <section
                    aria-label="Map corruption beastcraft"
                    className="text-sm text-muted-foreground"
                >
                    Guarantees one corrupted implicit and corrupts the map. Existing explicit
                    modifiers, rarity and quality are preserved. The implicit and its values use the
                    map's item level and extracted modifier weights. Enter the cost of the complete
                    beast recipe.
                </section>
            ) : null}
            {value.kind === "beast" && engine.beastOperation(value.id) === "map-twice" ? (
                <section
                    aria-label="Double map corruption"
                    className="text-sm text-muted-foreground"
                >
                    Applies two different Vaal outcomes in order, using the reference model's equal
                    category chances. Outcomes are unchanged modifiers, a rare transformation, eight
                    modifiers, or a corrupted implicit. A later transformation removes earlier
                    modifiers. Tier and upgrade links come from this build. Enter the cost of the
                    complete beast recipe.
                </section>
            ) : null}
            {value.kind === "beast" && engine.beastRequiresLevel(value.id) ? (
                <div className="space-y-1 text-sm">
                    <label htmlFor={`${id}-beast-level`}>Beast level</label>
                    <input
                        id={`${id}-beast-level`}
                        aria-describedby={`${id}-beast-description`}
                        className={controlClass}
                        type="number"
                        min={1}
                        max={100}
                        value={value.level ?? ""}
                        onChange={(event) =>
                            onChange({ ...value, level: Number(event.target.value) })
                        }
                    />
                    <p id={`${id}-beast-description`} className="text-xs text-muted-foreground">
                        The beast's level determines eligible modifier tiers. Enter the level of the
                        beast you plan to use.
                    </p>
                </div>
            ) : null}
            {value.kind === "socket_jewel" ? (
                <section aria-label="Jewel socket contents" className="space-y-2 text-xs">
                    <CatalogPicker
                        id={`${id}-socket-jewel`}
                        label="Jewel from inventory"
                        options={inventory
                            .filter(
                                (entry) =>
                                    engine.base(entry.item).item_class === "Jewel" &&
                                    !entry.item.destroyed &&
                                    !entry.item.reveal,
                            )
                            .map((entry) => ({ id: entry.id, label: entry.name }))}
                        value={
                            value.jewel
                                ? { id: value.jewel.id, label: value.jewel.name }
                                : undefined
                        }
                        onSelect={(id) =>
                            onChange({
                                ...value,
                                jewel: structuredClone(inventory.find((entry) => entry.id === id)!),
                            })
                        }
                    />
                    <p>
                        Requires an empty converted Jewel socket. Store a crafted Jewel in inventory
                        to select it here. Socketing and removal spend no currency; the inventory
                        snapshot remains available. Remove the current Jewel before inserting
                        another.
                    </p>
                    <p>
                        Jewel effects are displayed separately from equipment affixes. Passive-tree
                        radius effects and character bonuses are not calculated.
                    </p>
                </section>
            ) : null}
            {value.kind === "remove_jewel" ? (
                <p className="text-xs text-muted-foreground">
                    Empties the Jewel socket without spending currency. Store the socketed Jewel in
                    inventory first if you want to load it as the current item for further crafting.
                </p>
            ) : null}
            {value.kind === "recombine" ? (
                <section aria-label="Recombination model" className="space-y-2 text-xs">
                    <CatalogPicker
                        id={`${id}-recombine-donor`}
                        label="Recombination donor"
                        options={inventory
                            .filter(
                                (entry) => engine.base(entry.item).item_class === base.item_class,
                            )
                            .map((entry) => ({ id: entry.id, label: entry.name }))}
                        value={
                            value.donor
                                ? { id: value.donor.id, label: value.donor.name }
                                : undefined
                        }
                        onSelect={(id) =>
                            onChange({
                                ...value,
                                donor: structuredClone(inventory.find((entry) => entry.id === id)!),
                            })
                        }
                    />
                    <p>
                        Combines the current item with an inventory snapshot using the shared PoE 1
                        recombinator model. The surviving base is chosen equally; its quality,
                        implicits, sockets, anointment, influence and Memory Strands remain.
                        Explicit values are retained, and output item level follows the
                        average-plus-two rule, capped at the higher input level. The modeled result
                        is rare.
                    </p>
                    <p>
                        Set a price for the complete recombination service and the donor. Each
                        attempt consumes one of each; inventory snapshots remain reusable. Modifier
                        records and eligible classes come from the build. Affix-count probabilities
                        and selection rules follow the recombinator's{" "}
                        <a href={RECOMBINATOR_TABLE_URL} className="underline">
                            measured table
                        </a>{" "}
                        and{" "}
                        <a href={RECOMBINATOR_EXCLUSIVE_URL} className="underline">
                            3.26 research
                        </a>
                        . These are model probabilities, not extracted server probabilities.
                    </p>
                    <p>
                        Supports natural modifiers, ordinary influenced modifiers and unveiled bench
                        crafts within the shared model's exclusive-modifier limits. Influenced
                        modifiers require their influence on the surviving base. Fractures can be
                        retained only when their own input survives, and can still be lost. Strands
                        stay with that base without combining, consumption or tier filtering.
                        Imprint checkpoints, corruption, mirroring, elevated modifiers and altered
                        affix limits remain unsupported.
                    </p>
                </section>
            ) : null}
            {value.kind === "currency" &&
            data.currencies.find((entry) => entry.id === value.id)?.action ===
                "transfer_item_influence" ? (
                <div className="space-y-2">
                    <label className="block space-y-1 text-sm">
                        Donor item
                        <select
                            className={controlClass}
                            value={value.donor?.id ?? ""}
                            onChange={(event) => {
                                const donor = inventory.find(
                                    (entry) => entry.id === event.target.value,
                                );
                                onChange({
                                    ...value,
                                    donor: donor ? structuredClone(donor) : undefined,
                                });
                            }}
                        >
                            <option value="">Choose an inventory snapshot</option>
                            {value.donor &&
                            !inventory.some((entry) => entry.id === value.donor!.id) ? (
                                <option value={value.donor.id}>{value.donor.name}</option>
                            ) : null}
                            {inventory
                                .filter(
                                    (entry) =>
                                        engine.base(entry.item).item_class === base.item_class,
                                )
                                .map((entry) => (
                                    <option key={entry.id} value={entry.id}>
                                        {entry.name}
                                    </option>
                                ))}
                        </select>
                    </label>
                    <p className="text-xs text-muted-foreground">
                        Store the donor in item inventory, then load or create the target. Each
                        attempt consumes one donor and one orb; set both prices. Inventory snapshots
                        remain reusable.
                    </p>
                    {value.donor ? (
                        <p className="text-xs">
                            {engine.base(value.donor.item).name} · ilvl {value.donor.item.level} ·{" "}
                            {value.donor.item.mods.length} modifiers
                        </p>
                    ) : null}
                </div>
            ) : null}
            {value.kind === "reveal" ? (
                <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                        Select preferred outcomes in order. Simulations choose the first available
                        preference. When none match, choose whether to keep the modifier unrevealed
                        or accept the first offered option.
                        {value.omens?.length
                            ? " With Abyssal Echoes, reroll once if no preference is offered."
                            : null}
                    </p>
                    <label className="flex items-center gap-2 text-xs">
                        <input
                            type="checkbox"
                            checked={Boolean(value.skipOnMiss)}
                            onChange={(event) =>
                                onChange({ ...value, skipOnMiss: event.target.checked })
                            }
                        />
                        Keep modifier unrevealed when no preference matches
                    </label>
                    {value.skipOnMiss ? (
                        <p className="text-xs text-muted-foreground">
                            Offered choices are retained for another reveal step or manual
                            selection. Available Echoes rerolls are used before leaving a miss
                            unchosen. Paid omens remain spent; reusing the same offer does not
                            charge them again.
                        </p>
                    ) : null}
                    <CatalogPicker
                        id={`${id}-reveal-preference`}
                        label="Add preferred reveal"
                        options={engine
                            .revealedModifiers(item)
                            .filter((entry) => !value.preferred.includes(entry.id))
                            .map((entry) => ({ id: entry.id, label: modText(entry.mod) }))}
                        value={undefined}
                        onSelect={(selected) =>
                            onChange({ ...value, preferred: [...value.preferred, selected] })
                        }
                    />
                    {item.putrefied ? (
                        <p className="text-xs text-muted-foreground">
                            Each step reveals one remaining affix. Route back to this step until the
                            unrevealed-modifier count reaches zero. Bone tier floors and special
                            pools do not apply to Putrefaction reveals.
                        </p>
                    ) : null}
                    {engine.catalog.game === "poe2" ? (
                        <p className="text-xs text-muted-foreground">
                            The reference model requests 1/2/3 Abyss-exclusive choices with
                            80%/15%/5% probability, then fills up to three with ordinary modifiers.
                            Altered bones add Breach outcomes to the fill pool. Each source uses
                            client weights. Lich guarantees count within the exclusive choices. The
                            source probabilities are modeled, not extracted server values.
                        </p>
                    ) : null}
                    {value.preferred.map((preferred, index) => (
                        <div
                            key={preferred}
                            className="flex items-start justify-between gap-2 text-xs"
                        >
                            <span>
                                {index + 1}. {modText(engine.mod(preferred))}
                            </span>
                            <Button
                                size="xs"
                                variant="ghost"
                                aria-label={`Remove preference ${index + 1}`}
                                onClick={() =>
                                    onChange({
                                        ...value,
                                        preferred: value.preferred.filter((id) => id !== preferred),
                                    })
                                }
                            >
                                Remove
                            </Button>
                        </div>
                    ))}
                </div>
            ) : null}
            {omens.length &&
            (value.kind === "currency" || value.kind === "essence" || value.kind === "reveal") ? (
                <fieldset className="space-y-2 rounded border border-border p-3">
                    <legend className="px-1 text-xs text-muted-foreground">
                        Omens consumed by this craft
                    </legend>
                    {omens.map((omen) => (
                        <label
                            key={omen.id}
                            htmlFor={`${id}-omen-${omen.id}`}
                            className="flex items-start gap-2 text-sm"
                        >
                            <Checkbox
                                id={`${id}-omen-${omen.id}`}
                                aria-labelledby={`${id}-omen-name-${omen.id}`}
                                aria-describedby={`${id}-omen-description-${omen.id}`}
                                checked={value.omens?.includes(omen.id) ?? false}
                                disabled={omenRestrictions.has(omen.id)}
                                title={omenRestrictions.get(omen.id)}
                                onCheckedChange={(checked) =>
                                    onChange({
                                        ...value,
                                        omens: checked
                                            ? [...(value.omens ?? []), omen.id]
                                            : value.omens?.filter((id) => id !== omen.id),
                                    })
                                }
                            />
                            <span>
                                <span id={`${id}-omen-name-${omen.id}`}>{omen.name}</span>
                                <span
                                    id={`${id}-omen-description-${omen.id}`}
                                    className="block text-xs text-muted-foreground"
                                >
                                    {cleanModText(omen.description)}
                                </span>
                            </span>
                        </label>
                    ))}
                    {value.omens?.some((id) => id.endsWith("/OmenOnExaltConsumeQuality")) ? (
                        <section
                            aria-label="Catalysing Exaltation model"
                            className="space-y-2 text-xs"
                        >
                            <p>
                                {item.catalyst?.quality
                                    ? `Matching modifier weights are multiplied by ${catalysingMultiplier(engine.catalog, item)} at ${item.catalyst.quality}% catalyst quality. All catalyst quality is consumed after the craft, including when no matching modifier rolls.`
                                    : "Without catalyst quality, this omen has no effect and is not consumed."}
                            </p>
                            <p className="text-muted-foreground">
                                The reference model adds 20% weight per quality point up to the
                                default maximum, then 12% per extra point. These factors are not
                                extracted server probabilities. Greater Exaltation uses the same
                                starting quality for both rolls. Directional and Homogenising omens
                                still restrict the eligible pool. Modifier tags and quality limits
                                come from this build.
                            </p>
                        </section>
                    ) : null}
                    {value.omens?.some((id) => id.endsWith("/OmenOnDivineSanctify")) &&
                    data.sanctification ? (
                        <p className="text-xs text-muted-foreground">
                            {cleanModText(data.keywords.Sanctified!.definition)} The model uses
                            equally likely whole-percent multipliers, rounds each stat to the
                            nearest integer and preserves fractured modifiers. Subsequent supported
                            crafts are blocked.
                        </p>
                    ) : null}
                    {base.item_class === "Map" &&
                    value.kind === "currency" &&
                    data.currencies.find((entry) => entry.id === value.id)?.action === "reroll" ? (
                        <p className="text-xs text-muted-foreground">
                            Combine up to three Waystone omens to exclude reward types. They replace
                            all changeable modifiers, retaining fractures. Fewer modifiers may
                            remain when the allowed groups cannot fill every slot.
                        </p>
                    ) : null}
                </fieldset>
            ) : null}
            {value.kind === "currency" &&
            !value.omens?.includes("Metadata/Items/Currency/OmenOnAbyssVeilAllAndCorrupt") &&
            data.desecration.some((entry) => entry.id === value.id) ? (
                <p className="text-xs text-muted-foreground">
                    Desecration can replace a modifier when the chosen prefix or suffix slots are
                    full. Directional omens choose the side. Fractured modifiers are retained.
                </p>
            ) : null}
            {value.kind === "currency" &&
            value.omens?.includes("Metadata/Items/Currency/OmenOnAbyssVeilAllAndCorrupt") ? (
                <p
                    role="note"
                    aria-label="Putrefaction model"
                    className="text-xs text-muted-foreground"
                >
                    Replaces changeable affixes with unrevealed modifiers and corrupts the item.
                    Fractures are retained. The count model uses 4/5/6 affixes with relative weights
                    8/3/1, or 3/4 on jewels with weights 65/35; available prefix/suffix sides are
                    chosen equally. These distributions are not supplied by the client. Reveals use
                    the reference's 80%/15%/5% model for 1/2/3 Abyss-exclusive choices, then fill
                    with ordinary modifiers using client weights. Bone tier floors, Lich guarantees
                    and otherworldly modifiers do not apply. Add reveal steps to finish the item.
                </p>
            ) : null}
            {value.kind === "fossils" ? (
                <>
                    <fieldset className="max-h-48 space-y-2 overflow-y-auto rounded border border-border p-3">
                        <legend className="px-1 text-xs text-muted-foreground">
                            Choose up to four fossils
                        </legend>
                        {[...fossils, ...selectedFossils].map((fossil) => (
                            <label
                                key={fossil.id}
                                htmlFor={`${id}-fossil-${fossil.id}`}
                                className="flex items-start gap-2 text-sm"
                            >
                                <Checkbox
                                    id={`${id}-fossil-${fossil.id}`}
                                    aria-labelledby={`${id}-fossil-name-${fossil.id}`}
                                    aria-describedby={`${id}-fossil-description-${fossil.id}`}
                                    checked={value.ids.includes(fossil.id)}
                                    disabled={
                                        !value.ids.includes(fossil.id) && value.ids.length >= 4
                                    }
                                    onCheckedChange={(checked) => {
                                        const ids = checked
                                            ? [...value.ids, fossil.id]
                                            : value.ids.filter((entry) => entry !== fossil.id);
                                        if (!ids.length) return;
                                        const current = data.currencies.find(
                                            (entry) => entry.id === value.resonator,
                                        );
                                        const resonator = resonators.find(
                                            (entry) =>
                                                entry.action === current?.action &&
                                                allflameCurrencies.has(entry.id) ===
                                                    allflameCurrencies.has(current?.id ?? "") &&
                                                entry.id.endsWith(String(ids.length)),
                                        );
                                        if (resonator)
                                            onChange({
                                                ...value,
                                                ids,
                                                resonator: resonator.id,
                                                tangled: ids.some(
                                                    (id) => engine.fossil(id).randomOutcomes.length,
                                                )
                                                    ? (value.tangled ?? fossil.randomOutcomes[0])
                                                    : undefined,
                                            });
                                    }}
                                />
                                <span>
                                    <span id={`${id}-fossil-name-${fossil.id}`}>{fossil.name}</span>
                                    <span
                                        id={`${id}-fossil-description-${fossil.id}`}
                                        className="block text-xs text-muted-foreground"
                                    >
                                        {fossil.descriptions.join(" · ")}
                                    </span>
                                </span>
                            </label>
                        ))}
                    </fieldset>
                    {value.ids.some((id) => engine.fossil(id).randomOutcomes.length) ? (
                        <TangledFossilPicker
                            catalog={engine.catalog}
                            value={value.tangled}
                            onChange={(tangled) => onChange({ ...value, tangled })}
                        />
                    ) : null}
                    {value.ids.some((id) => engine.fossil(id).lucky) ? (
                        <section aria-label="Sanctified Fossil model" className="space-y-2 text-xs">
                            <p>
                                Newly rolled ordinary modifiers roll each numeric value twice and
                                keep the higher value. Preserved fractures and guaranteed fossil
                                modifiers retain their usual rolls in this reference model.
                            </p>
                            <p className="text-muted-foreground">
                                The reference weights each modifier by (60 + required level) / 100,
                                rounding before generation and fossil tag multipliers and again
                                afterwards. A level-1 modifier gets 0.61× weight; a level-84
                                modifier gets 1.44×. Levels, weights and the lucky flag come from
                                this build; the level-weight formula is not an extracted server
                                probability.
                            </p>
                        </section>
                    ) : null}
                    {value.ids.some((id) =>
                        data.fossils
                            .find((fossil) => fossil.id === id)
                            ?.effects.includes("BetterSellPrice"),
                    ) ? (
                        <section
                            aria-label="Gilded Fossil model"
                            className="text-xs text-muted-foreground"
                        >
                            Adds the vendor-value implicit alongside existing implicits. Repeated
                            uses preserve it without adding another. The model uses the reference's
                            representative modifier from this build; vendor reward outcomes are not
                            simulated.
                        </section>
                    ) : null}
                    {value.ids.some((id) =>
                        data.fossils
                            .find((fossil) => fossil.id === id)
                            ?.effects.includes("CorruptedImplicit"),
                    ) ? (
                        <section
                            aria-label="Bloodstained Fossil model"
                            className="text-xs text-muted-foreground"
                        >
                            Rerolls the item, replaces one modifiable implicit with a corrupted
                            implicit, and corrupts the result. Replacement uses equal chances when
                            several implicits are present; locked implicits remain. The corrupted
                            modifier uses this build's item-level restrictions and weights without
                            fossil tag or lucky-value bonuses. Corruption prevents ordinary further
                            crafting.
                        </section>
                    ) : null}
                    {selectedFossils.length ? (
                        <p className="text-xs text-muted-foreground" role="note">
                            {selectedFossils.map((fossil) => fossil.name).join(", ")} cannot be
                            applied to the current item. Remove it from the selection or undo the
                            last craft.
                        </p>
                    ) : null}
                    <label className="block space-y-1 text-sm">
                        Resonator
                        <select
                            className={controlClass}
                            value={value.resonator}
                            onChange={(event) =>
                                onChange({ ...value, resonator: event.target.value })
                            }
                        >
                            {resonators
                                .filter(
                                    (entry) =>
                                        [
                                            "delve_currency_upgrade",
                                            "delve_currency_reroll",
                                        ].includes(entry.action) &&
                                        entry.id.endsWith(String(value.ids.length)),
                                )
                                .map((entry) => (
                                    <option key={entry.id} value={entry.id}>
                                        {entry.name}
                                        {allflameCurrencies.has(entry.id)
                                            ? " · Allflame eligible"
                                            : ""}
                                    </option>
                                ))}
                        </select>
                    </label>
                    <label className="block space-y-1 text-sm">
                        Fossil weight model
                        <select
                            className={controlClass}
                            value={value.logic}
                            onChange={(event) =>
                                onChange({
                                    ...value,
                                    logic:
                                        event.target.value === "additive"
                                            ? "additive"
                                            : "multiplicative",
                                })
                            }
                        >
                            <option value="additive">Additive</option>
                            <option value="multiplicative">Multiplicative</option>
                        </select>
                    </label>
                </>
            ) : null}
        </div>
    );
}
