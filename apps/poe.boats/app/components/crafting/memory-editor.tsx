import { useId } from "react";
import { Checkbox } from "~/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { supportsMemoryMap, supportsMemoryStrands } from "~/lib/crafting-memory";
import type { CraftingItem } from "~/schemas/crafting";

export function MemoryEditor({
    engine,
    item,
    onChange,
}: {
    engine: CraftingEngine;
    item: CraftingItem;
    onChange: (item: CraftingItem) => void;
}) {
    const id = useId();
    if (supportsMemoryMap(engine.catalog, item))
        return (
            <FieldGroup>
                <Field orientation="horizontal">
                    <Checkbox
                        id={id}
                        checked={Boolean(item.memoryMap)}
                        onCheckedChange={(checked) =>
                            onChange({
                                ...item,
                                memoryMap: checked ? { intentions: 0 } : undefined,
                            })
                        }
                    />
                    <FieldLabel htmlFor={id}>Memory Influenced Map</FieldLabel>
                </Field>
                {item.memoryMap ? (
                    <Field>
                        <FieldLabel htmlFor={`${id}-uses`}>Existing Intention uses</FieldLabel>
                        <Input
                            id={`${id}-uses`}
                            type="number"
                            min={0}
                            max={engine.catalog.crafting.memoryMaps!.maximumUses}
                            step={1}
                            value={item.memoryMap.intentions}
                            onChange={(event) =>
                                onChange({
                                    ...item,
                                    memoryMap: { intentions: Number(event.target.value) },
                                })
                            }
                        />
                        <FieldDescription>
                            Set up an existing map here. Apply Orb of Intention as a crafting method
                            to track each use and its cost. Map drops are not simulated.
                        </FieldDescription>
                    </Field>
                ) : null}
            </FieldGroup>
        );
    if (!supportsMemoryStrands(engine.catalog, item)) return null;
    return (
        <FieldGroup>
            <Field>
                <FieldLabel htmlFor={id}>Memory strands</FieldLabel>
                <Input
                    id={id}
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={item.memoryStrands ?? 0}
                    onChange={(event) =>
                        onChange({
                            ...item,
                            memoryStrands: Number(event.target.value) || undefined,
                        })
                    }
                />
                <FieldDescription>
                    Set up an existing item with strands. Unravelling consumes all strands and
                    attempts to upgrade each eligible modifier independently, using the supplied
                    research model. Remembrance rerolls strands on a normal item. Other consuming
                    crafts use the starting strand count for tier filtering, then spend strands.
                    Identification filters tiers without consuming strands.
                </FieldDescription>
            </Field>
        </FieldGroup>
    );
}
