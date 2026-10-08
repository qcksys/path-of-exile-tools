import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import type { CraftingCatalog, CraftingItem } from "~/schemas/crafting";
import { type CraftingGraph, craftingGraphSchema } from "~/schemas/crafting-graph";

const Workbench = lazy(async () => ({ default: (await import("./workbench")).CraftingWorkbench }));

export function PurchaseItemWorkbench({
    graph,
    nodeId,
    alternativeId,
    item,
    catalog,
    onChange,
}: {
    graph: CraftingGraph;
    nodeId: string;
    alternativeId: string;
    item: CraftingItem;
    catalog: CraftingCatalog;
    onChange: (graph: CraftingGraph) => void;
}) {
    const [original, setOriginal] = useState<CraftingItem>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const request = useRef<AbortController | null>(null);
    const latest = useRef({ graph, onChange });
    latest.current = { graph, onChange };
    useEffect(() => () => request.current?.abort(), []);
    function close() {
        request.current?.abort();
        setOriginal(undefined);
        setBusy(false);
        setError("");
    }
    async function apply(item: CraftingItem) {
        if (!original) return;
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        const submitted = latest.current.graph;
        setBusy(true);
        setError("");
        try {
            const response = await fetch("/api/v1/crafting/graph/purchase-item", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    graph: submitted,
                    nodeId,
                    alternativeId,
                    expectedItem: original,
                    item,
                }),
                signal: controller.signal,
            });
            const data = await response.json();
            if (!response.ok)
                throw new Error(
                    data &&
                        typeof data === "object" &&
                        "error" in data &&
                        typeof data.error === "string"
                        ? data.error
                        : "This prepared item could not be applied to the selected crafting revision.",
                );
            const next = craftingGraphSchema.parse(
                data && typeof data === "object" && "graph" in data ? data.graph : undefined,
            );
            if (controller.signal.aborted) return;
            if (latest.current.graph !== submitted)
                throw new Error(
                    "The project changed while applying this item. Review it and apply again.",
                );
            latest.current.onChange(next);
            close();
        } catch (error) {
            if (!controller.signal.aborted)
                setError(error instanceof Error ? error.message : "Cannot apply this item.");
        } finally {
            if (!controller.signal.aborted) setBusy(false);
        }
    }
    return (
        <div className="space-y-3">
            <Button
                variant="outline"
                size="sm"
                aria-expanded={Boolean(original)}
                onClick={() => (original ? close() : setOriginal(structuredClone(item)))}
            >
                Edit prepared item
            </Button>
            {original && (
                <section
                    aria-label="Prepare purchased item"
                    className="space-y-3 rounded border p-3"
                >
                    <div className="flex items-center justify-between gap-2">
                        <h4 className="font-semibold">Prepare purchased item</h4>
                        <Button variant="ghost" size="sm" onClick={close}>
                            Cancel item edits
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Use the full workbench, then apply the item to this purchase. Changed items
                        require a new price. Your standalone workbench draft is kept separately.
                    </p>
                    {error && (
                        <p role="alert" className="text-destructive">
                            {error}
                        </p>
                    )}
                    {original && (
                        <Suspense fallback={<p role="status">Loading the workbench…</p>}>
                            <Workbench
                                catalog={catalog}
                                editing={{
                                    item: original,
                                    busy,
                                    onApply: (item) => void apply(item),
                                }}
                            />
                        </Suspense>
                    )}
                </section>
            )}
        </div>
    );
}
