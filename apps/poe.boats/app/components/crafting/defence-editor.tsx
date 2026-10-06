import { useId } from "react";
import { Button } from "~/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { baseDefenceEntries, baseDefenceNames, baseDefenceValue } from "~/lib/crafting-defences";
import type { CraftingEngine } from "~/lib/crafting-engine";
import {
    type CraftingItem,
    type CraftingTarget,
    craftingDefenceKeySchema,
} from "~/schemas/crafting";

export function BaseDefenceEditor({
    engine,
    item,
    onChange,
}: {
    engine: CraftingEngine;
    item: CraftingItem;
    onChange: (item: CraftingItem) => void;
}) {
    const id = useId();
    const entries = baseDefenceEntries(engine.catalog, item);
    if (!entries.length) return null;
    return (
        <details className="space-y-3 border-t pt-3">
            <summary className="cursor-pointer text-sm">Starting base defences</summary>
            <p className="text-xs text-muted-foreground">
                Values before quality and modifiers. Enter the starting rolls to target them, or use
                a Sacred Orb to reroll them in PoE 1. Unspecified variable rolls stay unknown.
            </p>
            <FieldGroup>
                {entries.map(({ key, range, name }) => (
                    <Field key={key}>
                        <FieldLabel htmlFor={`${id}-${key}`}>
                            Base {name} ({range.min}–{range.max})
                        </FieldLabel>
                        <Input
                            id={`${id}-${key}`}
                            aria-label={`Starting Base ${name}`}
                            type="number"
                            min={range.min}
                            max={range.max}
                            step={1}
                            value={baseDefenceValue(engine.catalog, item, key) ?? ""}
                            placeholder="Not set"
                            onChange={(event) => {
                                const baseDefences = { ...item.baseDefences };
                                if (event.target.value === "") delete baseDefences[key];
                                else baseDefences[key] = Number(event.target.value);
                                onChange({
                                    ...item,
                                    baseDefences: Object.keys(baseDefences).length
                                        ? baseDefences
                                        : undefined,
                                });
                            }}
                        />
                    </Field>
                ))}
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                        onChange({
                            ...item,
                            baseDefences: Object.fromEntries(
                                entries.map(({ key, range }) => [key, range.max]),
                            ),
                        })
                    }
                >
                    Set maximum base defences
                </Button>
            </FieldGroup>
        </details>
    );
}

export function BaseDefenceTargetEditor({
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
    const keys = craftingDefenceKeySchema.options.filter(
        (key) => engine.base(item).defences[key] || target.baseDefences?.[key],
    );
    if (!keys.length) return null;
    return (
        <details className="space-y-3 text-sm">
            <summary className="cursor-pointer">Base defence requirements</summary>
            <p className="text-xs text-muted-foreground">
                Checks raw base rolls before quality and modifiers. All selected defence
                requirements must pass.
            </p>
            {keys.map((key) => {
                const range = target.baseDefences?.[key];
                const name = `Base ${baseDefenceNames[key]}`;
                return range ? (
                    <FieldGroup key={key}>
                        {(["min", "max"] as const).map((bound) => (
                            <Field key={bound}>
                                <FieldLabel htmlFor={`${id}-${key}-${bound}`}>
                                    {bound === "min" ? "Minimum" : "Maximum"} {name}
                                </FieldLabel>
                                <Input
                                    id={`${id}-${key}-${bound}`}
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={range[bound]}
                                    onChange={(event) =>
                                        onChange({
                                            ...target,
                                            baseDefences: {
                                                ...target.baseDefences,
                                                [key]: {
                                                    ...range,
                                                    [bound]: Number(event.target.value),
                                                },
                                            },
                                        })
                                    }
                                />
                            </Field>
                        ))}
                        <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => {
                                const baseDefences = { ...target.baseDefences };
                                delete baseDefences[key];
                                onChange({
                                    ...target,
                                    baseDefences: Object.keys(baseDefences).length
                                        ? baseDefences
                                        : undefined,
                                });
                            }}
                        >
                            Clear {name} requirement
                        </Button>
                    </FieldGroup>
                ) : (
                    <Button
                        key={key}
                        variant="outline"
                        size="xs"
                        onClick={() => {
                            const maximum = engine.base(item).defences[key]!.max;
                            onChange({
                                ...target,
                                baseDefences: {
                                    ...target.baseDefences,
                                    [key]: { min: maximum, max: maximum },
                                },
                            });
                        }}
                    >
                        Require {name}
                    </Button>
                );
            })}
        </details>
    );
}
