import { CatalogPicker } from "~/components/recombinator/catalog-item-editor";
import { Button } from "~/components/ui/button";
import { availableEnchantments } from "~/lib/crafting-enchantments";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { heistEnchantments, heistSources } from "~/lib/crafting-heist";
import {
    availableBaseQuality,
    availableCatalysts,
    availableMapQuality,
    baseQualityLimit,
    catalystLimit,
    catalystName,
    mapQualityRecipe,
    retainedBaseQualityLimit,
    retainedCatalystLimit,
} from "~/lib/crafting-quality";
import { socketLimit } from "~/lib/crafting-sockets";
import type { CraftingItem } from "~/schemas/crafting";
import { modText } from "./item-card";
import { controlClass } from "./method-picker";

export function QualityEditor({
    engine,
    item,
    onChange,
}: {
    engine: CraftingEngine;
    item: CraftingItem;
    onChange: (item: CraftingItem) => void;
}) {
    const id = useId();
    const heist = heistEnchantments(engine.catalog, item);
    const selectedHeist = item.enchantments?.find((entry) =>
        heist.some((choice) => choice.mod === entry.id),
    );
    const catalysts = availableCatalysts(engine.catalog, item);
    const mapTypes = availableMapQuality(engine.catalog, item);
    const mapType = mapQualityRecipe(engine.catalog, item);
    const qualityCurrencies = availableBaseQuality(engine.catalog, item);
    const baseQuality = Boolean(
        item.quality ||
            mapTypes.length ||
            qualityCurrencies.length ||
            availableEnchantments(engine.catalog, item).length,
    );
    if (!catalysts.length && !baseQuality) return null;
    const maximum = catalystLimit(engine.catalog, item);
    const retainedMaximum = retainedCatalystLimit(engine.catalog, item);
    return (
        <div className="space-y-3 border-t pt-3">
            {heist.length ? (
                <details className="space-y-2 text-sm">
                    <summary className="cursor-pointer">Heist enchantment (manual)</summary>
                    <CatalogPicker
                        id={`${id}-heist`}
                        label="Starting Heist enchantment"
                        options={heist.map((entry) => ({
                            id: entry.mod,
                            label: modText(engine.catalog.mods[entry.mod]!),
                        }))}
                        value={
                            selectedHeist
                                ? {
                                      id: selectedHeist.id,
                                      label: modText(engine.catalog.mods[selectedHeist.id]!),
                                  }
                                : undefined
                        }
                        onSelect={(modId) => {
                            const next = {
                                ...item,
                                anointments: undefined,
                                enchantments: [
                                    {
                                        id: modId,
                                        values: engine.catalog.mods[modId]!.stats.map(
                                            (stat) => stat.min,
                                        ),
                                        crafted: false,
                                        fractured: false,
                                    },
                                ],
                            };
                            if ((next.sockets ?? 0) > socketLimit(engine.catalog, next)) {
                                next.sockets = socketLimit(engine.catalog, next);
                                next.socketLinks =
                                    next.sockets > 1
                                        ? next.socketLinks?.slice(0, next.sockets - 1)
                                        : undefined;
                            }
                            onChange(next);
                        }}
                    />
                    {selectedHeist ? (
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onChange({ ...item, enchantments: undefined })}
                        >
                            Clear starting Heist enchantment
                        </Button>
                    ) : null}
                    <p className="text-xs text-muted-foreground" role="note">
                        Manual selection spends no currency. Random Tempering and Tailoring odds are
                        unknown. Eligibility follows{" "}
                        <a
                            className="underline"
                            href={
                                heistSources[
                                    engine.base(item).item_class === "Body Armour"
                                        ? "armour"
                                        : "weapon"
                                ]
                            }
                            target="_blank"
                            rel="noreferrer"
                        >
                            PoE Wiki
                        </a>
                        ; values come from the build. Socket colors are displayed as restrictions;
                        color rolls are not simulated.
                    </p>
                </details>
            ) : null}
            {mapTypes.length ? (
                <CatalogPicker
                    id={`${id}-map-type`}
                    label="Map quality type"
                    options={mapTypes.map((entry) => ({ id: entry.id, label: entry.description }))}
                    value={mapType ? { id: mapType.id, label: mapType.description } : undefined}
                    onSelect={(value) =>
                        onChange({
                            ...item,
                            mapQuality: mapTypes
                                .find((entry) => entry.id === value)!
                                .stats.includes("map_item_drop_quantity_+%")
                                ? undefined
                                : value,
                        })
                    }
                />
            ) : null}
            {baseQuality && !item.catalyst ? (
                <FieldGroup>
                    <Field>
                        <FieldLabel htmlFor={id}>
                            {mapTypes.length ? "Map" : "Base"} quality (%)
                        </FieldLabel>
                        <Input
                            id={id}
                            type="number"
                            min={0}
                            max={retainedBaseQualityLimit(engine.catalog, item)}
                            step={1}
                            value={item.quality}
                            onChange={(event) =>
                                onChange({ ...item, quality: Number(event.target.value) })
                            }
                        />
                    </Field>
                    {engine.catalog.game === "poe2" ? (
                        <p className="text-xs text-muted-foreground">
                            Current crafting maximum {baseQualityLimit(engine.catalog, item)}%.
                            Starting items can retain up to{" "}
                            {retainedBaseQualityLimit(engine.catalog, item)}% from Infusers and
                            maximum-quality Runes.
                        </p>
                    ) : null}
                </FieldGroup>
            ) : null}
            {catalysts.length ? (
                <>
                    <Label className="block space-y-1 text-xs">
                        Catalyst
                        <FormSelect
                            className={controlClass}
                            value={item.catalyst?.id ?? ""}
                            onValueChange={(selectedValue) =>
                                onChange({
                                    ...item,
                                    quality: selectedValue ? 0 : item.quality,
                                    catalyst: selectedValue
                                        ? {
                                              id: selectedValue,
                                              quality: Math.min(
                                                  item.catalyst?.quality ?? 20,
                                                  maximum,
                                              ),
                                          }
                                        : undefined,
                                })
                            }
                        >
                            <FormSelectItem value="">No catalyst quality</FormSelectItem>
                            {catalysts.map((catalyst) => (
                                <FormSelectItem key={catalyst.id} value={catalyst.id}>
                                    {catalystName(engine.catalog, catalyst.id)}
                                </FormSelectItem>
                            ))}
                        </FormSelect>
                    </Label>
                    {item.catalyst ? (
                        <Label className="block space-y-1 text-xs">
                            Catalyst quality (%)
                            <Input
                                className={controlClass}
                                type="number"
                                min={0}
                                max={retainedMaximum}
                                step={1}
                                value={item.catalyst.quality}
                                onChange={(event) =>
                                    onChange({
                                        ...item,
                                        catalyst: {
                                            id: item.catalyst!.id,
                                            quality: Number(event.target.value),
                                        },
                                    })
                                }
                            />
                            <span className="text-muted-foreground">
                                Current crafting maximum {maximum}%
                                {retainedMaximum > maximum
                                    ? ` · Starting items can retain up to ${retainedMaximum}% from Infusers and maximum-quality modifiers.`
                                    : ""}
                            </span>
                        </Label>
                    ) : null}
                </>
            ) : null}
            <p className="text-xs text-muted-foreground">
                Sets starting quality without spending currency.{" "}
                {catalysts.length
                    ? "Select a catalyst as the crafting method to apply it and track each use."
                    : "Select a compatible quality currency as the crafting method to apply it and track each use."}
            </p>
        </div>
    );
}

import { useId } from "react";
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
