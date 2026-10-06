import { useId } from "react";
import { CatalogPicker } from "~/components/recombinator/catalog-item-editor";
import { Field, FieldDescription, FieldLabel, FieldSet } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import type { CraftingEngine } from "~/lib/crafting-engine";
import {
    hasAbyssSockets,
    initialSockets,
    retainedSocketLimit,
    setSocketCount,
    socketLimit,
} from "~/lib/crafting-sockets";
import type { CraftingItem } from "~/schemas/crafting";

export function SocketEditor({
    engine,
    item,
    onChange,
}: {
    engine: CraftingEngine;
    item: CraftingItem;
    onChange: (item: CraftingItem) => void;
}) {
    const id = useId();
    const maximum = socketLimit(engine.catalog, item);
    if (item.jewelSocket)
        return (
            <FieldDescription>
                One permanent Jewel socket. Augment sockets cannot be added to this item. Use Socket
                inventory Jewel or Remove socketed Jewel to change its contents.
            </FieldDescription>
        );
    if (!maximum) return null;
    if (hasAbyssSockets(engine.catalog, item))
        return (
            <FieldDescription>
                Gem socket counts with Abyss sockets are not modeled yet.
            </FieldDescription>
        );
    return (
        <Field>
            <FieldLabel htmlFor={id}>
                {engine.catalog.game === "poe1" ? "Gem sockets" : "Augment sockets"}
            </FieldLabel>
            <Input
                id={id}
                type="number"
                min={Math.max(item.augments?.length ?? 0, initialSockets(engine.catalog, item))}
                max={retainedSocketLimit(engine.catalog, item)}
                step={1}
                value={item.sockets ?? 0}
                onChange={(event) => {
                    const changed = { ...item };
                    setSocketCount(changed, Number(event.target.value));
                    onChange(changed);
                }}
            />
            <FieldDescription>
                Sets the starting socket count. This base supports {maximum} sockets.
                {initialSockets(engine.catalog, item)
                    ? ` It starts with ${initialSockets(engine.catalog, item)} sockets from its base properties.`
                    : ""}
                {engine.catalog.game === "poe1"
                    ? " Bench socket-count recipes ignore item level. Changing this count clears known links. Socket colours are not modeled."
                    : retainedSocketLimit(engine.catalog, { ...item, corrupted: true }) > maximum
                      ? " Corruption can add one more. Choose a Socket method to add or replace an augment."
                      : " Corruption cannot add another socket beyond the item's inventory size. Choose a Socket method to add or replace an augment."}
            </FieldDescription>
            {engine.catalog.game === "poe1" && (item.sockets ?? 0) > 1 ? (
                <FieldSet className="space-y-2" aria-label="Starting socket links">
                    {Array.from({ length: item.sockets! - 1 }, (_, index) => {
                        const options = [
                            { id: "unknown", label: "Unknown" },
                            { id: "linked", label: "Linked" },
                            { id: "separate", label: "Separate" },
                        ];
                        const connection = item.socketLinks?.[index];
                        const selected =
                            connection == null ? "unknown" : connection ? "linked" : "separate";
                        return (
                            <CatalogPicker
                                // biome-ignore lint/suspicious/noArrayIndexKey: Each index is a fixed physical connection between adjacent sockets.
                                key={`connection-${index}`}
                                id={`${id}-link-${index}`}
                                label={`Socket ${index + 1} to ${index + 2}`}
                                options={options}
                                value={options.find((entry) => entry.id === selected)}
                                onSelect={(choice) => {
                                    const socketLinks = Array.from(
                                        { length: item.sockets! - 1 },
                                        (_, position) =>
                                            position === index
                                                ? choice === "unknown"
                                                    ? null
                                                    : choice === "linked"
                                                : (item.socketLinks?.[position] ?? null),
                                    );
                                    onChange({ ...item, socketLinks });
                                }}
                            />
                        );
                    })}
                    <FieldDescription>
                        Connections follow socket order. Unknown links are not treated as separate
                        sockets; a probability is available only when the requirement can be
                        decided.
                    </FieldDescription>
                </FieldSet>
            ) : null}
        </Field>
    );
}
