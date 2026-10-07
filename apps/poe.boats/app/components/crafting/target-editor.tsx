import { useId } from "react";
import { CatalogPicker } from "~/components/recombinator/catalog-item-editor";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { anointmentKey, anointmentText, availableAnointments } from "~/lib/crafting-anointing";
import {
    augmentCreatesJewelSocket,
    augmentStats,
    availableAugments,
} from "~/lib/crafting-augments";
import { eldritchLabel } from "~/lib/crafting-eldritch";
import { availableEnchantments } from "~/lib/crafting-enchantments";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { craftingFlags } from "~/lib/crafting-flags";
import { influenceNames } from "~/lib/crafting-influences";
import { supportsMemoryMap } from "~/lib/crafting-memory";
import { extractedGrantedPassives, passiveAllocationMod } from "~/lib/crafting-passives";
import {
    availableBaseQuality,
    availableCatalysts,
    availableMapQuality,
    baseQualityLimit,
    catalystLimit,
    catalystName,
    retainedBaseQualityLimit,
} from "~/lib/crafting-quality";
import { socketLimit } from "~/lib/crafting-sockets";
import { targetEntries } from "~/lib/crafting-targets";
import {
    type CraftingItem,
    type CraftingTarget,
    craftingTargetSchema,
    maximumConditionDepth,
    maximumConditionNodes,
} from "~/schemas/crafting";
import { IntangibilityTarget } from "./allflame-panel";
import { BaseDefenceTargetEditor } from "./defence-editor";
import { modText } from "./item-card";
import { controlClass } from "./method-picker";
import { PropertyTargetEditor } from "./property-target-editor";
import { StatTargetEditor } from "./stat-target-editor";

export function TargetEditor({
    engine,
    item,
    target,
    onChange,
    title = "Requirements",
    path = [],
    remainingNodes = maximumConditionNodes - targetEntries(target).length,
}: {
    engine: CraftingEngine;
    item: CraftingItem;
    target: CraftingTarget;
    onChange: (target: CraftingTarget) => void;
    title?: string;
    path?: number[];
    remainingNodes?: number;
}) {
    const anointmentId = useId();
    const enchantmentId = useId();
    const passiveId = useId();
    const fractureId = useId();
    const exclusionId = useId();
    const catalystId = useId();
    const strandsId = useId();
    const intentionsId = useId();
    const qualityId = useId();
    const socketsId = useId();
    const linksId = useId();
    const jewelId = useId();
    const socketedJewelId = useId();
    const tierId = useId();
    const flagsId = useId();
    const expressionId = useId();
    const waystone = engine.waystone(item);
    const map = engine.map(item);
    const tierKey = engine.catalog.game === "poe1" ? "mapTier" : "waystoneTier";
    const tierLabel = engine.catalog.game === "poe1" ? "Map" : "Waystone";
    const tierRange = target[tierKey];
    const extraAffixes = Math.max(
        0,
        ...availableAugments(engine.catalog, item).map(
            (entry) =>
                augmentStats(engine.catalog, item, entry.id).get("local_maximum_mods_allowed_+") ??
                0,
        ),
    );
    const maximumAffixes = waystone ? 9 : map ? 8 : Math.min(9, 6 + extraAffixes);
    const maximumTier = Math.max(
        1,
        ...(engine.catalog.game === "poe1"
            ? engine.catalog.crafting.maps
            : engine.catalog.crafting.waystones
        ).map((entry) => entry.tier),
    );
    const catalysts = availableCatalysts(engine.catalog, item);
    const mapQualityTypes = availableMapQuality(engine.catalog, item);
    const qualityLabel = mapQualityTypes.length ? "Map" : "Base";
    const mapQualityOptions = [
        { id: "any", label: "Any map quality type" },
        ...mapQualityTypes.map((entry) => ({ id: entry.id, label: entry.description })),
    ];
    const catalystOptions = [
        { id: "any", label: "Any catalyst type" },
        ...catalysts.map((entry) => ({
            id: entry.id,
            label: catalystName(engine.catalog, entry.id),
        })),
    ];
    const passives = extractedGrantedPassives(engine.catalog);
    const enchantmentLabel = (id: string) => modText(engine.mod(id)).split("\n").at(-1)!;
    return (
        <section
            className={
                path.length
                    ? "min-w-0 space-y-3"
                    : "space-y-3 rounded-lg border border-border bg-card p-4"
            }
            aria-label={title === "Requirements" ? "Crafting requirements" : title}
        >
            <h2 className="font-semibold">{title}</h2>
            {target.expression ? (
                <div className="space-y-3 border-b pb-3">
                    <p className="text-xs text-muted-foreground">
                        The combined condition and this section's other requirements must pass. An
                        empty condition passes. Add modifiers through the pool's requirement
                        destination.
                    </p>
                    <ToggleGroup
                        multiple={false}
                        value={[target.expression.operator]}
                        onValueChange={(values) => {
                            const operator = values[0];
                            if (operator === "and" || operator === "or")
                                onChange({
                                    ...target,
                                    expression: { ...target.expression!, operator },
                                });
                        }}
                        aria-label="Combine conditions"
                    >
                        <ToggleGroupItem value="and">All (AND)</ToggleGroupItem>
                        <ToggleGroupItem value="or">Any (OR)</ToggleGroupItem>
                    </ToggleGroup>
                    <Field orientation="horizontal">
                        <Checkbox
                            id={expressionId}
                            checked={target.expression.negated ?? false}
                            onCheckedChange={(checked) =>
                                onChange({
                                    ...target,
                                    expression: {
                                        ...target.expression!,
                                        negated: checked === true,
                                    },
                                })
                            }
                        />
                        <FieldLabel htmlFor={expressionId}>
                            Invert combined condition (NOT)
                        </FieldLabel>
                    </Field>
                    {target.expression.operands.map((operand, index) => {
                        const childPath = [...path, index + 1];
                        const label = `Condition ${childPath.join(".")}`;
                        return (
                            <details key={label} className="min-w-0 space-y-2 rounded border p-2">
                                <summary className="cursor-pointer text-sm">{label}</summary>
                                <TargetEditor
                                    engine={engine}
                                    item={item}
                                    target={operand}
                                    title={`${label} requirements`}
                                    path={childPath}
                                    remainingNodes={remainingNodes}
                                    onChange={(value) =>
                                        onChange({
                                            ...target,
                                            expression: {
                                                ...target.expression!,
                                                operands: target.expression!.operands.map(
                                                    (entry, position) =>
                                                        position === index ? value : entry,
                                                ),
                                            },
                                        })
                                    }
                                />
                                <Button
                                    variant="ghost"
                                    size="xs"
                                    onClick={() => {
                                        const operands = target.expression!.operands.filter(
                                            (_, position) => position !== index,
                                        );
                                        onChange({
                                            ...target,
                                            expression: operands.length
                                                ? { ...target.expression!, operands }
                                                : undefined,
                                        });
                                    }}
                                >
                                    Remove {label}
                                </Button>
                            </details>
                        );
                    })}
                    <Button
                        variant="outline"
                        size="sm"
                        aria-label={
                            path.length
                                ? `Add condition to Condition ${path.join(".")}`
                                : "Add condition"
                        }
                        disabled={remainingNodes <= 0 || target.expression.operands.length >= 12}
                        onClick={() =>
                            onChange({
                                ...target,
                                expression: {
                                    ...target.expression!,
                                    operands: [
                                        ...target.expression!.operands,
                                        craftingTargetSchema.parse({ groups: [] }),
                                    ],
                                },
                            })
                        }
                    >
                        Add condition
                    </Button>
                    <Button
                        variant="ghost"
                        size="xs"
                        aria-label={
                            path.length
                                ? `Remove combined condition from Condition ${path.join(".")}`
                                : "Remove combined condition"
                        }
                        onClick={() => onChange({ ...target, expression: undefined })}
                    >
                        Remove combined condition
                    </Button>
                </div>
            ) : (
                <Button
                    variant="outline"
                    size="sm"
                    disabled={remainingNodes <= 0 || path.length >= maximumConditionDepth}
                    onClick={() =>
                        onChange({
                            ...target,
                            expression: {
                                operator: "and",
                                operands: [craftingTargetSchema.parse({ groups: [] })],
                            },
                        })
                    }
                >
                    Add combined condition
                </Button>
            )}
            <BaseDefenceTargetEditor
                engine={engine}
                item={item}
                target={target}
                onChange={onChange}
            />
            {map || waystone || tierRange ? (
                <details className="flex flex-col gap-2 text-sm">
                    <summary className="cursor-pointer">{tierLabel} tier requirement</summary>
                    {tierRange ? (
                        <FieldGroup className="mt-3">
                            {(["min", "max"] as const).map((bound) => (
                                <Field key={bound}>
                                    <FieldLabel htmlFor={`${tierId}-${bound}`}>
                                        {bound === "min" ? "Minimum" : "Maximum"} {tierLabel} tier
                                    </FieldLabel>
                                    <Input
                                        id={`${tierId}-${bound}`}
                                        type="number"
                                        min={1}
                                        max={maximumTier}
                                        step={1}
                                        value={tierRange[bound]}
                                        onChange={(event) =>
                                            onChange({
                                                ...target,
                                                [tierKey]: {
                                                    ...tierRange,
                                                    [bound]: Number(event.target.value),
                                                },
                                            })
                                        }
                                    />
                                </Field>
                            ))}
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onChange({ ...target, [tierKey]: undefined })}
                            >
                                Clear tier requirement
                            </Button>
                        </FieldGroup>
                    ) : (
                        <Button
                            className="mt-3"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                                onChange({
                                    ...target,
                                    [tierKey]: {
                                        min: Math.min(
                                            maximumTier,
                                            (map?.tier ?? waystone?.tier ?? 1) + 1,
                                        ),
                                        max: maximumTier,
                                    },
                                })
                            }
                        >
                            Add tier requirement
                        </Button>
                    )}
                </details>
            ) : null}
            {socketLimit(engine.catalog, item) || target.sockets ? (
                <details className="flex flex-col gap-2 text-sm">
                    <summary className="cursor-pointer">Socket requirement</summary>
                    {target.sockets ? (
                        <FieldGroup className="mt-3">
                            {(["min", "max"] as const).map((bound) => (
                                <Field key={bound}>
                                    <FieldLabel htmlFor={`${socketsId}-${bound}`}>
                                        {bound === "min" ? "Minimum" : "Maximum"}{" "}
                                        {engine.catalog.game === "poe1" ? "gem" : "augment"} sockets
                                    </FieldLabel>
                                    <Input
                                        id={`${socketsId}-${bound}`}
                                        type="number"
                                        min={0}
                                        max={engine.catalog.game === "poe1" ? 6 : 7}
                                        step={1}
                                        value={target.sockets![bound]}
                                        onChange={(event) =>
                                            onChange({
                                                ...target,
                                                sockets: {
                                                    ...target.sockets!,
                                                    [bound]: Number(event.target.value),
                                                },
                                            })
                                        }
                                    />
                                </Field>
                            ))}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onChange({ ...target, sockets: undefined })}
                            >
                                Clear socket requirement
                            </Button>
                        </FieldGroup>
                    ) : (
                        <Button
                            className="mt-3"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                                onChange({
                                    ...target,
                                    sockets: {
                                        min: 1,
                                        max: engine.catalog.game === "poe1" ? 6 : 7,
                                    },
                                })
                            }
                        >
                            Add socket requirement
                        </Button>
                    )}
                </details>
            ) : null}
            {engine.catalog.game === "poe1" &&
            (socketLimit(engine.catalog, item) || target.linkedSockets) ? (
                <details className="rounded-md border p-3">
                    <summary className="cursor-pointer text-sm font-medium">
                        Linked socket requirement
                    </summary>
                    {target.linkedSockets ? (
                        <FieldGroup className="mt-3">
                            {(["min", "max"] as const).map((bound) => (
                                <Field key={bound}>
                                    <FieldLabel htmlFor={`${linksId}-${bound}`}>
                                        {bound === "min" ? "Minimum" : "Maximum"} linked sockets
                                    </FieldLabel>
                                    <Input
                                        id={`${linksId}-${bound}`}
                                        type="number"
                                        min={0}
                                        max={6}
                                        step={1}
                                        value={target.linkedSockets![bound]}
                                        onChange={(event) =>
                                            onChange({
                                                ...target,
                                                linkedSockets: {
                                                    ...target.linkedSockets!,
                                                    [bound]: Number(event.target.value),
                                                },
                                            })
                                        }
                                    />
                                </Field>
                            ))}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onChange({ ...target, linkedSockets: undefined })}
                            >
                                Clear linked socket requirement
                            </Button>
                        </FieldGroup>
                    ) : (
                        <Button
                            className="mt-3"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                                onChange({ ...target, linkedSockets: { min: 2, max: 6 } })
                            }
                        >
                            Add linked socket requirement
                        </Button>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                        Number of sockets in the largest linked group.
                    </p>
                </details>
            ) : null}
            {item.jewelSocket ||
            target.jewelSocket !== undefined ||
            availableAugments(engine.catalog, item).some(augmentCreatesJewelSocket) ? (
                <Field>
                    <FieldLabel htmlFor={jewelId}>Jewel socket requirement</FieldLabel>
                    <ToggleGroup
                        id={jewelId}
                        aria-label="Jewel socket requirement"
                        multiple={false}
                        value={[
                            target.jewelSocket === undefined
                                ? "any"
                                : target.jewelSocket
                                  ? "present"
                                  : "absent",
                        ]}
                        onValueChange={(values) =>
                            onChange({
                                ...target,
                                jewelSocket:
                                    values[0] === "present"
                                        ? true
                                        : values[0] === "absent"
                                          ? false
                                          : undefined,
                            })
                        }
                    >
                        <ToggleGroupItem value="any">Any</ToggleGroupItem>
                        <ToggleGroupItem value="present">Present</ToggleGroupItem>
                        <ToggleGroupItem value="absent">Absent</ToggleGroupItem>
                    </ToggleGroup>
                </Field>
            ) : null}
            {item.jewelSocket ||
            target.socketedJewel !== undefined ||
            availableAugments(engine.catalog, item).some(augmentCreatesJewelSocket) ? (
                <Field>
                    <FieldLabel htmlFor={socketedJewelId}>Socketed Jewel requirement</FieldLabel>
                    <ToggleGroup
                        id={socketedJewelId}
                        aria-label="Socketed Jewel requirement"
                        multiple={false}
                        value={[
                            target.socketedJewel === undefined
                                ? "any"
                                : target.socketedJewel
                                  ? "present"
                                  : "absent",
                        ]}
                        onValueChange={(values) =>
                            onChange({
                                ...target,
                                socketedJewel:
                                    values[0] === "present"
                                        ? true
                                        : values[0] === "absent"
                                          ? false
                                          : undefined,
                            })
                        }
                    >
                        <ToggleGroupItem value="any">Any</ToggleGroupItem>
                        <ToggleGroupItem value="present">Present</ToggleGroupItem>
                        <ToggleGroupItem value="absent">Absent</ToggleGroupItem>
                    </ToggleGroup>
                </Field>
            ) : null}
            {availableBaseQuality(engine.catalog, item).length ||
            mapQualityTypes.length ||
            item.quality ||
            target.quality ? (
                <details className="flex flex-col gap-2 text-sm">
                    <summary className="cursor-pointer">{qualityLabel} quality requirement</summary>
                    {target.quality ? (
                        <FieldGroup className="mt-3">
                            {mapQualityTypes.length ? (
                                <CatalogPicker
                                    id={`${qualityId}-map-type`}
                                    label="Required map quality type"
                                    options={mapQualityOptions}
                                    value={mapQualityOptions.find(
                                        (entry) => entry.id === (target.quality?.mapType ?? "any"),
                                    )}
                                    onSelect={(value) =>
                                        onChange({
                                            ...target,
                                            quality: {
                                                ...target.quality!,
                                                mapType: value === "any" ? undefined : value,
                                            },
                                        })
                                    }
                                />
                            ) : null}
                            {(["min", "max"] as const).map((bound) => (
                                <Field key={bound}>
                                    <FieldLabel htmlFor={`${qualityId}-${bound}`}>
                                        {bound === "min" ? "Minimum" : "Maximum"}{" "}
                                        {qualityLabel.toLowerCase()} quality (%)
                                    </FieldLabel>
                                    <Input
                                        id={`${qualityId}-${bound}`}
                                        type="number"
                                        min={0}
                                        max={retainedBaseQualityLimit(engine.catalog, {
                                            ...item,
                                            corrupted: true,
                                        })}
                                        step={1}
                                        value={target.quality![bound]}
                                        onChange={(event) =>
                                            onChange({
                                                ...target,
                                                quality: {
                                                    ...target.quality!,
                                                    [bound]: Number(event.target.value),
                                                },
                                            })
                                        }
                                    />
                                </Field>
                            ))}
                            <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => onChange({ ...target, quality: undefined })}
                            >
                                Clear quality requirement
                            </Button>
                        </FieldGroup>
                    ) : (
                        <Button
                            size="xs"
                            variant="outline"
                            onClick={() =>
                                onChange({
                                    ...target,
                                    quality: {
                                        min:
                                            baseQualityLimit(engine.catalog, item) ||
                                            mapQualityTypes[0]?.maximumQuality ||
                                            item.quality,
                                        max: retainedBaseQualityLimit(engine.catalog, {
                                            ...item,
                                            corrupted: true,
                                        }),
                                    },
                                })
                            }
                        >
                            Add quality requirement
                        </Button>
                    )}
                </details>
            ) : null}
            {supportsMemoryMap(engine.catalog, item) || target.intentions ? (
                <details className="flex flex-col gap-2 text-sm">
                    <summary className="cursor-pointer">Orb of Intention requirement</summary>
                    <p className="mt-2 text-xs text-muted-foreground">
                        Requires a Memory Influenced Map, including when the minimum is zero.
                    </p>
                    {target.intentions ? (
                        <FieldGroup className="mt-3">
                            {(["min", "max"] as const).map((bound) => (
                                <Field key={bound}>
                                    <FieldLabel htmlFor={`${intentionsId}-${bound}`}>
                                        {bound === "min" ? "Minimum" : "Maximum"} Intention uses
                                    </FieldLabel>
                                    <Input
                                        id={`${intentionsId}-${bound}`}
                                        type="number"
                                        min={0}
                                        max={engine.catalog.crafting.memoryMaps?.maximumUses}
                                        step={1}
                                        value={target.intentions![bound]}
                                        onChange={(event) =>
                                            onChange({
                                                ...target,
                                                intentions: {
                                                    ...target.intentions!,
                                                    [bound]: Number(event.target.value),
                                                },
                                            })
                                        }
                                    />
                                </Field>
                            ))}
                            <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => onChange({ ...target, intentions: undefined })}
                            >
                                Clear Intention requirement
                            </Button>
                        </FieldGroup>
                    ) : (
                        <Button
                            size="xs"
                            variant="outline"
                            onClick={() =>
                                onChange({
                                    ...target,
                                    intentions: {
                                        min: engine.catalog.crafting.memoryMaps!.maximumUses,
                                        max: engine.catalog.crafting.memoryMaps!.maximumUses,
                                    },
                                })
                            }
                        >
                            Add Intention requirement
                        </Button>
                    )}
                </details>
            ) : null}
            {engine.catalog.game === "poe1" ? (
                <details className="flex flex-col gap-2 text-sm">
                    <summary className="cursor-pointer">Memory strand requirement</summary>
                    {target.memoryStrands ? (
                        <FieldGroup className="mt-3">
                            {(["min", "max"] as const).map((bound) => (
                                <Field key={bound}>
                                    <FieldLabel htmlFor={`${strandsId}-${bound}`}>
                                        {bound === "min" ? "Minimum" : "Maximum"} memory strands
                                    </FieldLabel>
                                    <Input
                                        id={`${strandsId}-${bound}`}
                                        type="number"
                                        min={0}
                                        max={100}
                                        step={1}
                                        value={target.memoryStrands![bound]}
                                        onChange={(event) =>
                                            onChange({
                                                ...target,
                                                memoryStrands: {
                                                    ...target.memoryStrands!,
                                                    [bound]: Number(event.target.value),
                                                },
                                            })
                                        }
                                    />
                                </Field>
                            ))}
                            <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => onChange({ ...target, memoryStrands: undefined })}
                            >
                                Clear strand requirement
                            </Button>
                        </FieldGroup>
                    ) : (
                        <Button
                            size="xs"
                            variant="outline"
                            onClick={() =>
                                onChange({ ...target, memoryStrands: { min: 0, max: 100 } })
                            }
                        >
                            Add strand requirement
                        </Button>
                    )}
                </details>
            ) : null}
            {engine.catalog.game === "poe1" ? (
                <IntangibilityTarget value={target} onChange={onChange} />
            ) : null}
            {catalysts.length || target.catalyst ? (
                <details className="flex flex-col gap-2 text-sm">
                    <summary className="cursor-pointer">Catalyst quality requirement</summary>
                    <FieldGroup className="mt-3">
                        <CatalogPicker
                            id={catalystId}
                            label="Required catalyst"
                            options={catalystOptions}
                            value={
                                target.catalyst
                                    ? {
                                          id: target.catalyst.id ?? "any",
                                          label: target.catalyst.id
                                              ? catalystName(engine.catalog, target.catalyst.id)
                                              : "Any catalyst type",
                                      }
                                    : undefined
                            }
                            onSelect={(id) =>
                                onChange({
                                    ...target,
                                    catalyst: {
                                        min: catalystLimit(engine.catalog, item),
                                        max: 200,
                                        ...target.catalyst,
                                        id: id === "any" ? undefined : id,
                                    },
                                })
                            }
                        />
                        {target.catalyst ? (
                            <>
                                {(["min", "max"] as const).map((bound) => (
                                    <Field key={bound}>
                                        <FieldLabel htmlFor={`${catalystId}-${bound}`}>
                                            {bound === "min" ? "Minimum" : "Maximum"} catalyst
                                            quality (%)
                                        </FieldLabel>
                                        <Input
                                            id={`${catalystId}-${bound}`}
                                            type="number"
                                            min={0}
                                            max={200}
                                            step={1}
                                            value={target.catalyst![bound]}
                                            onChange={(event) =>
                                                onChange({
                                                    ...target,
                                                    catalyst: {
                                                        ...target.catalyst!,
                                                        [bound]: Number(event.target.value),
                                                    },
                                                })
                                            }
                                        />
                                    </Field>
                                ))}
                                <Button
                                    size="xs"
                                    variant="ghost"
                                    onClick={() => onChange({ ...target, catalyst: undefined })}
                                >
                                    Clear catalyst requirement
                                </Button>
                            </>
                        ) : null}
                    </FieldGroup>
                </details>
            ) : null}
            {passiveAllocationMod(engine.catalog, item) || target.grantedPassives?.length ? (
                <details className="space-y-2 text-sm">
                    <summary className="cursor-pointer">Allocated passive requirement</summary>
                    <CatalogPicker
                        id={passiveId}
                        label="Require allocated notable"
                        value={
                            target.grantedPassives?.[0]
                                ? {
                                      id: target.grantedPassives[0],
                                      label: passives[target.grantedPassives[0]]!.name,
                                  }
                                : undefined
                        }
                        options={Object.entries(passives).map(([id, passive]) => ({
                            id,
                            label: passive.name,
                        }))}
                        onSelect={(id) => onChange({ ...target, grantedPassives: [id] })}
                    />
                    {target.grantedPassives?.length ? (
                        <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => onChange({ ...target, grantedPassives: [] })}
                        >
                            Clear allocated passive requirement
                        </Button>
                    ) : null}
                </details>
            ) : null}
            {availableEnchantments(engine.catalog, item).length || target.enchantments?.length ? (
                <details className="space-y-2 text-sm">
                    <summary className="cursor-pointer">Enchantment requirement</summary>
                    <CatalogPicker
                        id={enchantmentId}
                        label="Require enchantment"
                        value={
                            target.enchantments?.[0]
                                ? {
                                      id: target.enchantments[0],
                                      label: enchantmentLabel(target.enchantments[0]),
                                  }
                                : undefined
                        }
                        options={availableEnchantments(engine.catalog, item).map((entry) => ({
                            id: entry.mod,
                            label: enchantmentLabel(entry.mod),
                        }))}
                        onSelect={(id) => onChange({ ...target, enchantments: [id] })}
                    />
                    {target.enchantments?.length ? (
                        <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => onChange({ ...target, enchantments: [] })}
                        >
                            Clear enchantment requirement
                        </Button>
                    ) : null}
                </details>
            ) : null}
            {availableAnointments(engine.catalog, item).length || target.anointments?.length ? (
                <details className="space-y-2 text-sm">
                    <summary className="cursor-pointer">Anointment requirements</summary>
                    <CatalogPicker
                        id={anointmentId}
                        label="Require anointment"
                        disabled={(target.anointments?.length ?? 0) >= (item.blight ? 9 : 4)}
                        options={availableAnointments(engine.catalog, item)
                            .filter(
                                (recipe) =>
                                    !(target.anointments ?? []).some(
                                        (id) =>
                                            anointmentKey(engine.catalog, id) ===
                                            anointmentKey(engine.catalog, recipe.id),
                                    ),
                            )
                            .map((recipe) => ({
                                id: recipe.id,
                                label: anointmentText(engine.catalog, recipe.id),
                            }))}
                        onSelect={(id) =>
                            onChange({
                                ...target,
                                anointments: [...(target.anointments ?? []), id],
                            })
                        }
                    />
                    {(target.anointments ?? []).map((id) => (
                        <div key={id} className="flex items-center gap-2 text-xs">
                            <span>{anointmentText(engine.catalog, id)}</span>
                            <Button
                                size="xs"
                                variant="ghost"
                                onClick={() =>
                                    onChange({
                                        ...target,
                                        anointments: target.anointments?.filter(
                                            (entry) => entry !== id,
                                        ),
                                    })
                                }
                            >
                                Remove anointment requirement
                            </Button>
                        </div>
                    ))}
                </details>
            ) : null}
            {!target.groups.length ? (
                <p className="text-sm text-muted-foreground">
                    Choose modifiers from the pool. Put alternative tiers in the same group.
                </p>
            ) : null}
            {target.groups.map((group, index) => (
                <div key={group.mods.join(",")} className="rounded border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium">
                            Group {index + 1}
                            {group.negated ? " · Exclude matches" : ""}
                        </span>
                        <Button
                            size="xs"
                            variant="ghost"
                            onClick={() =>
                                onChange({
                                    ...target,
                                    minimumGroups: 0,
                                    groups: target.groups.filter((entry) => entry !== group),
                                })
                            }
                        >
                            Remove group
                        </Button>
                    </div>
                    <ul className="my-2 space-y-1 text-xs text-muted-foreground">
                        {group.mods.map((id) => (
                            <li key={id}>
                                {modText(engine.mod(id))}{" "}
                                <span className="font-mono">
                                    {eldritchLabel(engine.mod(id)) ??
                                        `ilvl ${engine.mod(id).required_level}`}
                                </span>
                            </li>
                        ))}
                    </ul>
                    <Label className="flex items-center gap-2 text-xs">
                        {group.negated ? "Fewer than" : "Require at least"}
                        <FormSelect
                            className="rounded border border-input bg-background px-2 py-1"
                            aria-label={`Group ${index + 1} match threshold`}
                            value={group.minimum}
                            onValueChange={(selectedValue) =>
                                onChange({
                                    ...target,
                                    groups: target.groups.map((entry) =>
                                        entry === group
                                            ? { ...entry, minimum: Number(selectedValue) }
                                            : entry,
                                    ),
                                })
                            }
                        >
                            {Array.from({ length: maximumAffixes }, (_, index) => index + 1)
                                .filter((count) => count <= group.mods.length)
                                .map((count) => (
                                    <FormSelectItem key={count} value={count}>
                                        {count}
                                    </FormSelectItem>
                                ))}
                        </FormSelect>
                        modifier(s) from this group
                    </Label>
                    <FieldGroup className="mt-3">
                        <Field orientation="horizontal">
                            <Checkbox
                                id={`${exclusionId}-${index}`}
                                checked={group.negated ?? false}
                                onCheckedChange={(checked) =>
                                    onChange({
                                        ...target,
                                        groups: target.groups.map((entry) =>
                                            entry === group
                                                ? { ...entry, negated: checked }
                                                : entry,
                                        ),
                                    })
                                }
                            />
                            <FieldLabel htmlFor={`${exclusionId}-${index}`}>
                                Exclude matches in group {index + 1}
                            </FieldLabel>
                        </Field>
                        {group.negated ? (
                            <p className="text-xs text-muted-foreground">
                                Passes when fewer than {group.minimum} selected modifiers match. At
                                a threshold of 1, all selected {group.fractured ? "fractured " : ""}
                                modifiers must be absent. Exclusion groups follow the same group
                                matching rule as required groups.
                            </p>
                        ) : null}
                        <Field orientation="horizontal">
                            <Checkbox
                                id={`${fractureId}-${index}`}
                                checked={group.fractured ?? false}
                                onCheckedChange={(checked) =>
                                    onChange({
                                        ...target,
                                        groups: target.groups.map((entry) =>
                                            entry === group
                                                ? { ...entry, fractured: checked }
                                                : entry,
                                        ),
                                    })
                                }
                            />
                            <FieldLabel htmlFor={`${fractureId}-${index}`}>
                                {group.negated ? "Count only" : "Require"} fractured modifiers in
                                group {index + 1}
                            </FieldLabel>
                        </Field>
                    </FieldGroup>
                </div>
            ))}
            {target.groups.length > 1 ? (
                <Label className="block space-y-1 text-xs">
                    Group matching
                    <FormSelect
                        className={controlClass}
                        value={target.minimumGroups}
                        onValueChange={(selectedValue) =>
                            onChange({ ...target, minimumGroups: Number(selectedValue) })
                        }
                    >
                        <FormSelectItem value={0}>All groups</FormSelectItem>
                        {target.groups.map((group, index) => (
                            <FormSelectItem key={group.mods.join(",")} value={index + 1}>
                                At least {index + 1} group(s)
                            </FormSelectItem>
                        ))}
                    </FormSelect>
                </Label>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
                {(["openPrefixes", "openSuffixes"] as const).map((key) => (
                    <Label key={key} className="block space-y-1 text-xs">
                        {key === "openPrefixes" ? "Open prefixes" : "Open suffixes"}
                        <FormSelect
                            className={controlClass}
                            value={target[key]}
                            onValueChange={(selectedValue) =>
                                onChange({ ...target, [key]: Number(selectedValue) })
                            }
                        >
                            {[0, 1, 2, 3, 4, 5, 6].map((count) => (
                                <FormSelectItem key={count} value={count}>
                                    {count === 0 ? "Any" : `At least ${count}`}
                                </FormSelectItem>
                            ))}
                        </FormSelect>
                    </Label>
                ))}
            </div>
            <StatTargetEditor engine={engine} item={item} target={target} onChange={onChange} />
            <PropertyTargetEditor engine={engine} item={item} target={target} onChange={onChange} />
            <details className="rounded border border-border p-3">
                <summary className="cursor-pointer text-xs font-medium">Item conditions</summary>
                <div className="mt-3 space-y-3">
                    <FieldGroup>
                        {craftingFlags(engine.catalog.game).map(
                            ({ key, label, requirement, absent }) => (
                                <Field key={key}>
                                    <FieldLabel id={`${flagsId}-${key}`}>{requirement}</FieldLabel>
                                    <ToggleGroup
                                        aria-labelledby={`${flagsId}-${key}`}
                                        variant="outline"
                                        size="sm"
                                        spacing={0}
                                        value={[
                                            target[key] === undefined
                                                ? "any"
                                                : target[key]
                                                  ? "present"
                                                  : "absent",
                                        ]}
                                        onValueChange={(values) =>
                                            onChange({
                                                ...target,
                                                [key]:
                                                    values[0] === "present"
                                                        ? true
                                                        : values[0] === "absent"
                                                          ? false
                                                          : undefined,
                                            })
                                        }
                                    >
                                        <ToggleGroupItem value="any">Any</ToggleGroupItem>
                                        <ToggleGroupItem value="absent">{absent}</ToggleGroupItem>
                                        <ToggleGroupItem value="present">{label}</ToggleGroupItem>
                                    </ToggleGroup>
                                </Field>
                            ),
                        )}
                    </FieldGroup>
                    {engine.catalog.crafting.influences.some(
                        (rule) => rule.itemClass === engine.base(item).item_class,
                    ) ? (
                        <fieldset className="space-y-2">
                            <legend className="text-xs">Required influences</legend>
                            <p className="text-xs text-muted-foreground">
                                Require every selected influence, independently of its modifiers.
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                                {engine.catalog.crafting.influences
                                    .filter(
                                        (rule) => rule.itemClass === engine.base(item).item_class,
                                    )
                                    .map((rule) => (
                                        <Label
                                            key={rule.influence}
                                            className="flex items-center gap-2 text-xs"
                                        >
                                            <Checkbox
                                                checked={
                                                    target.influences?.includes(rule.influence) ??
                                                    false
                                                }
                                                disabled={
                                                    !engine.hasFixedInfluences(item) &&
                                                    (target.influences?.length ?? 0) >= 2 &&
                                                    !target.influences?.includes(rule.influence)
                                                }
                                                onCheckedChange={(checked) =>
                                                    onChange({
                                                        ...target,
                                                        influences: checked
                                                            ? [
                                                                  ...(target.influences ?? []),
                                                                  rule.influence,
                                                              ]
                                                            : target.influences?.filter(
                                                                  (value) =>
                                                                      value !== rule.influence,
                                                              ),
                                                    })
                                                }
                                            />
                                            Require {influenceNames[rule.influence]}
                                        </Label>
                                    ))}
                            </div>
                        </fieldset>
                    ) : null}
                    <Label className="block space-y-1 text-xs">
                        Required rarity
                        <FormSelect
                            className={controlClass}
                            value={target.rarity ?? ""}
                            onValueChange={(selectedValue) =>
                                onChange({
                                    ...target,
                                    rarity: selectedValue
                                        ? (selectedValue as CraftingTarget["rarity"])
                                        : undefined,
                                })
                            }
                        >
                            <FormSelectItem value="">Any rarity</FormSelectItem>
                            <FormSelectItem value="normal">normal</FormSelectItem>
                            <FormSelectItem value="magic">magic</FormSelectItem>
                            <FormSelectItem value="rare">rare</FormSelectItem>
                        </FormSelect>
                    </Label>
                    <Label className="block space-y-1 text-xs">
                        Open affixes of either type
                        <FormSelect
                            className={controlClass}
                            value={target.openAffixes ?? 0}
                            onValueChange={(selectedValue) =>
                                onChange({ ...target, openAffixes: Number(selectedValue) })
                            }
                        >
                            {Array.from({ length: maximumAffixes + 1 }, (_, count) => count).map(
                                (count) => (
                                    <FormSelectItem key={count} value={count}>
                                        {count ? `At least ${count}` : "Any"}
                                    </FormSelectItem>
                                ),
                            )}
                        </FormSelect>
                    </Label>
                    {(
                        [
                            ["affixCount", "Total affixes"],
                            ["prefixCount", "Prefixes"],
                            ["suffixCount", "Suffixes"],
                            ["unrevealedCount", "Unrevealed modifiers"],
                        ] as const
                    ).map(([key, label]) => (
                        <fieldset key={key} className="space-y-2">
                            <legend className="text-xs">{label}</legend>
                            <div className="grid grid-cols-2 gap-2">
                                {(["min", "max"] as const).map((bound) => (
                                    <Label key={bound} className="block space-y-1 text-xs">
                                        {bound === "min" ? "Minimum" : "Maximum"}{" "}
                                        {label.toLowerCase()}
                                        <Input
                                            className={controlClass}
                                            type="number"
                                            min={0}
                                            max={key === "affixCount" ? maximumAffixes : 6}
                                            value={
                                                target[key]?.[bound] ??
                                                (bound === "min"
                                                    ? 0
                                                    : key === "affixCount"
                                                      ? maximumAffixes
                                                      : 6)
                                            }
                                            onChange={(event) =>
                                                onChange({
                                                    ...target,
                                                    [key]: {
                                                        min: 0,
                                                        max:
                                                            key === "affixCount"
                                                                ? maximumAffixes
                                                                : 6,
                                                        ...target[key],
                                                        [bound]: Number(event.target.value),
                                                    },
                                                })
                                            }
                                        />
                                    </Label>
                                ))}
                            </div>
                        </fieldset>
                    ))}
                    <Button
                        variant="ghost"
                        size="xs"
                        onClick={() =>
                            onChange({
                                ...target,
                                rarity: undefined,
                                corrupted: undefined,
                                mirrored: undefined,
                                split: undefined,
                                sanctified: undefined,
                                influences: undefined,
                                openAffixes: undefined,
                                affixCount: undefined,
                                prefixCount: undefined,
                                suffixCount: undefined,
                                unrevealedCount: undefined,
                            })
                        }
                    >
                        Clear item conditions
                    </Button>
                </div>
            </details>
        </section>
    );
}
