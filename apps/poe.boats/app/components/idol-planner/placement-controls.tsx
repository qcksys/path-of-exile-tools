import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Field, FieldLabel } from "~/components/ui/field";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { IDOL_BASES } from "~/data/idol-bases";
import { GRID_HEIGHT, GRID_WIDTH } from "~/lib/grid-utils";
import { canPlaceInSet } from "~/operations/planner";
import type { IdolPlacement } from "~/schemas/idol-set";
import type { InventoryIdol } from "~/schemas/inventory";

export function PlacementControls({
    inventory,
    placements,
    unlockedConditions = [],
    onPlace,
    onMove,
    onRemove,
}: {
    inventory: InventoryIdol[];
    placements: IdolPlacement[];
    unlockedConditions?: string[];
    onPlace: (id: string, x: number, y: number) => void;
    onMove: (id: string, x: number, y: number) => void;
    onRemove: (id: string) => void;
}) {
    const [idolId, setIdolId] = useState("");
    const [position, setPosition] = useState("");
    const [message, setMessage] = useState("");
    const idol = inventory.find((entry) => entry.id === idolId);
    const placed = placements.find((entry) => entry.inventoryIdolId === idolId);
    const positions = Array.from({ length: GRID_HEIGHT * GRID_WIDTH }, (_, index) => {
        const x = index % GRID_WIDTH;
        const y = Math.floor(index / GRID_WIDTH);
        return {
            x,
            y,
            id: `${x},${y}`,
            valid: Boolean(
                idol &&
                    canPlaceInSet(
                        { inventory, placements, unlockedConditions },
                        idolId,
                        { x, y },
                        placed?.id,
                    ),
            ),
        };
    });
    const selected = positions.find((entry) => entry.id === position);
    return (
        <section
            aria-label="Arrange idols without dragging"
            className="flex w-full min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4"
        >
            <h2 className="font-semibold">Place or move an idol</h2>
            <p className="text-sm text-muted-foreground">
                Choose an idol and its top-left cell. Rows run from top to bottom; columns run from
                left to right.
            </p>
            <Field>
                <FieldLabel htmlFor="arrange-idol">Idol to arrange</FieldLabel>
                <FormSelect
                    id="arrange-idol"
                    aria-label="Idol to arrange"
                    value={idol ? idolId : ""}
                    onValueChange={(id) => {
                        setIdolId(id);
                        setPosition("");
                        setMessage("");
                    }}
                >
                    <FormSelectItem value="">Choose an idol…</FormSelectItem>
                    {inventory.map((entry) => (
                        <FormSelectItem key={entry.id} value={entry.id}>
                            {entry.idol.name || IDOL_BASES[entry.idol.baseType].name}
                            {placements.some((placement) => placement.inventoryIdolId === entry.id)
                                ? " · placed"
                                : ""}
                        </FormSelectItem>
                    ))}
                </FormSelect>
            </Field>
            {placed && (
                <p className="text-sm">
                    Currently at row {placed.position.y + 1}, column {placed.position.x + 1}.
                </p>
            )}
            <Field>
                <FieldLabel htmlFor="arrange-position">Grid position</FieldLabel>
                <FormSelect
                    id="arrange-position"
                    aria-label="Grid position"
                    value={position}
                    disabled={!idol}
                    onValueChange={setPosition}
                >
                    <FormSelectItem value="">Choose a cell…</FormSelectItem>
                    {positions.map((entry) => (
                        <FormSelectItem key={entry.id} value={entry.id} disabled={!entry.valid}>
                            Row {entry.y + 1}, column {entry.x + 1}
                            {entry.valid ? "" : " · unavailable"}
                        </FormSelectItem>
                    ))}
                </FormSelect>
                <p className="text-xs text-muted-foreground">
                    Unavailable cells are locked, occupied, or do not fit this idol.
                </p>
            </Field>
            <div className="flex flex-wrap gap-2">
                <Button
                    disabled={!idol || !selected?.valid}
                    onClick={() => {
                        if (!idol || !selected?.valid) return;
                        if (placed) onMove(placed.id, selected.x, selected.y);
                        else onPlace(idol.id, selected.x, selected.y);
                        setMessage(
                            `Idol ${placed ? "moved" : "placed"} at row ${selected.y + 1}, column ${selected.x + 1}.`,
                        );
                    }}
                >
                    {placed ? "Move idol" : "Place idol"}
                </Button>
                {placed && (
                    <Button
                        variant="outline"
                        onClick={() => {
                            onRemove(placed.id);
                            setMessage("Idol removed from the grid. It remains in your inventory.");
                        }}
                    >
                        Remove from grid
                    </Button>
                )}
            </div>
            <p role="status" className="text-sm text-muted-foreground">
                {message || (!inventory.length ? "Create or import an idol to start placing." : "")}
            </p>
        </section>
    );
}
