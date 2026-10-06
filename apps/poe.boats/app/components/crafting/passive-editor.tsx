import { useId } from "react";
import { CatalogPicker } from "~/components/recombinator/catalog-item-editor";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { extractedGrantedPassives, passiveAllocationMod } from "~/lib/crafting-passives";
import type { CraftingItem } from "~/schemas/crafting";

export function PassiveEditor({
    engine,
    item,
    onSelect,
}: {
    engine: CraftingEngine;
    item: CraftingItem;
    onSelect: (id: string) => void;
}) {
    const pickerId = useId();
    const mod = passiveAllocationMod(engine.catalog, item);
    if (!mod) return null;
    const passives = extractedGrantedPassives(engine.catalog);
    const selected = item.mods.find((entry) => entry.id === mod)?.grantedPassive;
    return (
        <details className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
            <summary className="cursor-pointer font-medium">Existing Delirium passive</summary>
            <p className="text-xs text-muted-foreground">
                Set the notable already allocated by your essence modifier. This edits the starting
                item. Extracted notables are not a verified random essence pool; rolling this
                essence is unavailable.
            </p>
            <CatalogPicker
                id={pickerId}
                label="Allocated notable"
                value={selected ? { id: selected, label: passives[selected]!.name } : undefined}
                options={Object.entries(passives).map(([id, passive]) => ({
                    id,
                    label: passive.name,
                }))}
                onSelect={onSelect}
            />
        </details>
    );
}
