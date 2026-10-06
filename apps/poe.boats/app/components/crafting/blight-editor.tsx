import { useId } from "react";
import { CatalogPicker } from "~/components/recombinator/catalog-item-editor";
import { blightedMap, blightedMapName, mapOilLimit } from "~/lib/crafting-anointing";
import type { CraftingEngine } from "~/lib/crafting-engine";
import type { CraftingItem } from "~/schemas/crafting";

export function BlightEditor({
    engine,
    item,
    onChange,
}: {
    engine: CraftingEngine;
    item: CraftingItem;
    onChange: (item: CraftingItem) => void;
}) {
    const id = useId();
    const types = engine.catalog.crafting.anointing.maps;
    if (!types.length || engine.base(item).item_class !== "Map") return null;
    const map = blightedMap(engine.catalog, item);
    const options = [
        { id: "none", label: "Ordinary map" },
        ...types.map((entry) => ({
            id: entry.mod,
            label: `${blightedMapName(engine.catalog, { blight: entry.mod })} map`,
        })),
    ];
    return (
        <div className="space-y-2">
            <CatalogPicker
                id={id}
                label="Blight map type"
                options={options}
                value={options.find((entry) => entry.id === (item.blight ?? "none"))}
                onSelect={(value) =>
                    onChange({
                        ...item,
                        blight: value === "none" ? undefined : value,
                        anointments: [],
                    })
                }
            />
            {map ? (
                <p className="text-xs text-muted-foreground">
                    Set up an existing map. Anoint with up to {map.maximumAnointments} oils, at most{" "}
                    {mapOilLimit(engine.catalog)} of each type. Applying a recipe replaces all
                    existing map anointments.
                </p>
            ) : null}
        </div>
    );
}
