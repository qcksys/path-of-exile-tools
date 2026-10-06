import {
    type CraftingLibrary,
    type CraftingProject,
    craftingLibrarySchema,
} from "../schemas/crafting";
import type { CraftingEngine } from "./crafting-engine";

export function validateInventory(
    engine: CraftingEngine,
    inventory: CraftingProject["inventory"],
    tabs: string[] = [],
) {
    if (new Set(inventory.map((entry) => entry.id)).size !== inventory.length)
        throw new Error("Inventory item IDs must be unique.");
    for (const entry of inventory) {
        if (entry.tab && !tabs.includes(entry.tab))
            throw new Error(`Unknown inventory tab: ${entry.tab}`);
        engine.validateItem(entry.item);
    }
}

export function validateLibrary(engine: CraftingEngine, input: unknown): CraftingLibrary {
    const library = craftingLibrarySchema.parse(input);
    if (library.game !== engine.catalog.game || library.patch !== engine.catalog.patch)
        throw new Error("The library was saved for a different game or client build.");
    validateInventory(engine, library.inventory, library.inventoryTabs);
    return library;
}

export function craftingInventory(
    project: CraftingProject["inventory"],
    library: CraftingLibrary["inventory"],
): CraftingProject["inventory"] {
    const ids = new Set(project.map((entry) => entry.id));
    return [
        ...project,
        ...library.map((entry) => {
            let id = `library:${entry.id}`;
            while (ids.has(id)) id = `library:${id}`;
            ids.add(id);
            return { ...entry, id, name: `Library · ${entry.name}`.slice(0, 100) };
        }),
    ];
}
