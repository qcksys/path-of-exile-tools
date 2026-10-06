import { useId } from "react";
import { Button } from "~/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { itemProperties, itemPropertyNames } from "~/lib/crafting-properties";
import {
    type CraftingItem,
    type CraftingTarget,
    craftingAggregatePropertyKeySchema,
    craftingPropertyKeySchema,
} from "~/schemas/crafting";

export function PropertyTargetEditor({
    engine,
    item,
    target,
    onChange,
}: {
    engine: CraftingEngine;
    item: CraftingItem;
    target: CraftingTarget;
    onChange: (target: CraftingTarget) => void;
}) {
    const id = useId();
    const values = itemProperties(engine, item);
    const keys = craftingPropertyKeySchema.options.filter(
        (key) => Object.hasOwn(values, key) || target.properties?.[key],
    );
    if (!keys.length) return null;
    return (
        <details className="rounded border border-border p-3">
            <summary className="cursor-pointer text-xs font-medium">
                Final item property conditions
            </summary>
            <div className="mt-3 space-y-3">
                <p className="text-xs text-muted-foreground">
                    Includes local modifiers, quality, enchantments and socketed augments. All
                    selected properties must pass. DPS excludes skills, character bonuses and
                    critical strikes. Set any missing raw base defence rolls before calculating.
                    Resistance totals sum the elements; Total Resistance also includes chaos. Flat
                    Life includes direct additions and quality enchantments, without attributes or
                    passive skills.
                </p>
                {engine.base(item).flask.duration !== null && (
                    <p className="text-xs text-muted-foreground">
                        Flask recovery is the total per use, including instant recovery. Duration is
                        the nominal effect duration before instant recovery. Low-life, low-mana and
                        character bonuses are excluded.
                    </p>
                )}
                {values.reloadTime !== undefined && (
                    <p className="text-xs text-muted-foreground">
                        Reload Time includes local attack and reload speed. Skill and character
                        bonuses are excluded.
                    </p>
                )}
                {values.strengthRequirement !== undefined && (
                    <p className="text-xs text-muted-foreground">
                        Attribute requirements include local modifiers and socket conversions.
                        Character bonuses and other equipment are excluded.
                    </p>
                )}
                {values.requiredLevel !== undefined && (
                    <p className="text-xs text-muted-foreground">
                        Required Character Level includes the base, modifiers and socketed augments.
                        Zero means no level requirement. Item Level controls modifier eligibility
                        separately.
                    </p>
                )}
                {keys.map((key) => {
                    const range = target.properties?.[key];
                    const name = itemPropertyNames[key];
                    return (
                        <div key={key} className="space-y-2 rounded border p-2">
                            <p className="text-xs">
                                {name}:{" "}
                                {values[key] === undefined && Object.hasOwn(values, key)
                                    ? "Set base roll"
                                    : (values[key] ?? 0)}
                            </p>
                            {range ? (
                                <>
                                    <FieldGroup className="grid grid-cols-2 gap-2">
                                        {(["min", "max"] as const).map((bound) => (
                                            <Field key={bound}>
                                                <FieldLabel htmlFor={`${id}-${key}-${bound}`}>
                                                    {bound === "min" ? "Minimum" : "Maximum"} {name}
                                                </FieldLabel>
                                                <Input
                                                    id={`${id}-${key}-${bound}`}
                                                    type="number"
                                                    min={
                                                        craftingAggregatePropertyKeySchema.options.some(
                                                            (name) => name === key,
                                                        )
                                                            ? undefined
                                                            : 0
                                                    }
                                                    step="any"
                                                    value={range[bound] ?? ""}
                                                    placeholder="Any"
                                                    onChange={(event) => {
                                                        const next = {
                                                            ...range,
                                                            [bound]:
                                                                event.target.value === ""
                                                                    ? undefined
                                                                    : Number(event.target.value),
                                                        };
                                                        const properties = {
                                                            ...target.properties,
                                                            [key]: next,
                                                        };
                                                        if (
                                                            next.min === undefined &&
                                                            next.max === undefined
                                                        )
                                                            delete properties[key];
                                                        onChange({
                                                            ...target,
                                                            properties: Object.keys(properties)
                                                                .length
                                                                ? properties
                                                                : undefined,
                                                        });
                                                    }}
                                                />
                                            </Field>
                                        ))}
                                    </FieldGroup>
                                    <Button
                                        variant="ghost"
                                        size="xs"
                                        onClick={() => {
                                            const properties = { ...target.properties };
                                            delete properties[key];
                                            onChange({
                                                ...target,
                                                properties: Object.keys(properties).length
                                                    ? properties
                                                    : undefined,
                                            });
                                        }}
                                    >
                                        Clear {name} requirement
                                    </Button>
                                </>
                            ) : (
                                <Button
                                    variant="outline"
                                    size="xs"
                                    onClick={() =>
                                        onChange({
                                            ...target,
                                            properties: {
                                                ...target.properties,
                                                [key]: { min: values[key] ?? 0 },
                                            },
                                        })
                                    }
                                >
                                    Require {name}
                                </Button>
                            )}
                        </div>
                    );
                })}
            </div>
        </details>
    );
}
