import { useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { validateLibrary } from "~/lib/crafting-inventory";
import type { CraftingItem, CraftingLibrary, CraftingProject } from "~/schemas/crafting";
import { InventoryPanel } from "./inventory-panel";
import { controlClass } from "./method-picker";
import type { useItemLibrary } from "./use-item-library";

export function InventoryStorage({
    engine,
    project,
    library,
    onChange,
    onLoad,
}: {
    engine: CraftingEngine;
    project: CraftingProject;
    library: ReturnType<typeof useItemLibrary>;
    onChange: (inventory: CraftingProject["inventory"], tabs: string[]) => void;
    onLoad: (item: CraftingItem, name: string) => void;
}) {
    const [scope, setScope] = useState("project");
    const [pending, setPending] = useState<CraftingLibrary>();
    const [error, setError] = useState("");
    const file = useRef<HTMLInputElement>(null);
    const shared = scope === "library";
    const selected = shared ? library.library : project;
    return (
        <section aria-label="Item storage" className="space-y-3">
            <label className="block space-y-1 text-xs">
                Inventory storage
                <select
                    className={controlClass}
                    value={scope}
                    onChange={(event) => setScope(event.target.value)}
                >
                    <option value="project">Project inventory</option>
                    <option value="library">Shared library</option>
                </select>
            </label>
            <fieldset disabled={shared && (!library.ready || library.blocked)}>
                <InventoryPanel
                    key={scope}
                    engine={engine}
                    item={project.item}
                    entries={selected.inventory}
                    tabs={selected.inventoryTabs ?? []}
                    shared={shared}
                    onChange={(inventory, inventoryTabs) =>
                        shared
                            ? library.save({ ...library.library, inventory, inventoryTabs })
                            : onChange(inventory, inventoryTabs)
                    }
                    onLoad={onLoad}
                />
            </fieldset>
            {shared ? (
                <div className="space-y-3 text-xs">
                    <p className="text-muted-foreground">
                        Both inventories are available in donor and Jewel pickers. Selected donors
                        and Jewels are copied into the project when you choose them.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            size="xs"
                            variant="outline"
                            disabled={!library.ready || library.blocked}
                            onClick={() => {
                                const data = JSON.stringify(library.library, null, 2);
                                const url = URL.createObjectURL(
                                    new Blob([data], { type: "application/json" }),
                                );
                                const link = document.createElement("a");
                                link.href = url;
                                link.download = `crafting-library-${project.game}-${project.patch}.json`;
                                link.click();
                                setTimeout(() => URL.revokeObjectURL(url), 1000);
                            }}
                        >
                            Export library
                        </Button>
                        <Button size="xs" variant="outline" onClick={() => file.current?.click()}>
                            Import library
                        </Button>
                        <Button size="xs" variant="ghost" onClick={library.reload}>
                            Reload library
                        </Button>
                        {library.blocked ? (
                            <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => setPending(library.empty())}
                            >
                                Start empty library
                            </Button>
                        ) : null}
                    </div>
                    <input
                        ref={file}
                        type="file"
                        accept="application/json,.json"
                        aria-label="Import crafting library"
                        className="hidden"
                        onChange={async (event) => {
                            const upload = event.target.files?.[0];
                            event.target.value = "";
                            if (!upload) return;
                            setPending(undefined);
                            setError("");
                            try {
                                if (upload.size > 2 * 1024 * 1024)
                                    throw new Error("Library files must be at most 2 MB.");
                                setPending(
                                    validateLibrary(engine, JSON.parse(await upload.text())),
                                );
                            } catch (error) {
                                setError(`Cannot import library: ${String(error)}`);
                            }
                        }}
                    />
                    {pending ? (
                        <section aria-label="Replace shared library" className="space-y-2">
                            <p>
                                Replace the shared library with {pending.inventory.length} items and{" "}
                                {pending.inventoryTabs?.length ?? 0} tabs? Existing library items
                                will be removed. Project inventories will be kept.
                            </p>
                            <div className="flex gap-2">
                                <Button
                                    size="xs"
                                    onClick={() => {
                                        if (library.save(pending, true)) setPending(undefined);
                                    }}
                                >
                                    Replace library
                                </Button>
                                <Button
                                    size="xs"
                                    variant="ghost"
                                    onClick={() => setPending(undefined)}
                                >
                                    Cancel import
                                </Button>
                            </div>
                        </section>
                    ) : null}
                    {error ? <p role="alert">{error}</p> : null}
                </div>
            ) : null}
            {library.error ? (
                <p role="alert" className="text-xs text-destructive">
                    {library.error}
                </p>
            ) : null}
        </section>
    );
}
