import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
} from "~/components/ui/dialog";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Label } from "~/components/ui/label";
import type { CraftingEngine } from "~/lib/crafting-engine";
import type { CraftingMethod } from "~/schemas/crafting";
import {
    type CraftingGraph,
    craftingGraphSchema,
    type GraphCraftNode,
} from "~/schemas/crafting-graph";
import { controlClass, MethodPicker } from "./method-picker";

export function GraphMethodEditor({
    graph,
    node,
    engine,
    onChange,
}: {
    graph: CraftingGraph;
    node: GraphCraftNode;
    engine: CraftingEngine;
    onChange: (graph: CraftingGraph) => void;
}) {
    const [draft, setDraft] = useState<{ original: CraftingMethod; method: CraftingMethod }>();
    const [referenceId, setReferenceId] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const request = useRef<AbortController | null>(null);
    const latest = useRef({ graph, onChange });
    latest.current = { graph, onChange };
    useEffect(() => () => request.current?.abort(), []);
    const references = graph.nodes.flatMap((source) =>
        source.kind === "acquire"
            ? source.alternatives.flatMap((option) =>
                  option.kind === "purchase"
                      ? [
                            {
                                id: JSON.stringify([source.id, option.id]),
                                name: `${source.name} / ${option.name}`,
                                item: option.item,
                            },
                        ]
                      : [],
              )
            : [],
    );
    const reference = references.find((entry) => entry.id === referenceId);
    function close() {
        request.current?.abort();
        setDraft(undefined);
        setBusy(false);
        setError("");
    }
    async function apply() {
        if (!draft) return;
        const controller = new AbortController();
        request.current?.abort();
        request.current = controller;
        const submitted = latest.current.graph;
        setBusy(true);
        setError("");
        try {
            const response = await fetch("/api/v1/crafting/graph/method", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                    graph: submitted,
                    nodeId: node.id,
                    expectedMethod: draft.original,
                    method: draft.method,
                }),
            });
            const data = await response.json();
            if (!response.ok)
                throw new Error(
                    data &&
                        typeof data === "object" &&
                        "error" in data &&
                        typeof data.error === "string"
                        ? data.error
                        : "This method could not be applied.",
                );
            const next = craftingGraphSchema.parse(
                data && typeof data === "object" && "graph" in data ? data.graph : undefined,
            );
            if (controller.signal.aborted) return;
            if (latest.current.graph !== submitted)
                throw new Error(
                    "The project changed while applying this method. Review it and apply again.",
                );
            latest.current.onChange(next);
            close();
        } catch (error) {
            if (!controller.signal.aborted)
                setError(error instanceof Error ? error.message : "Cannot apply this method.");
        } finally {
            if (!controller.signal.aborted) setBusy(false);
        }
    }
    return (
        <Dialog
            open={Boolean(draft)}
            onOpenChange={(open) => {
                if (!open) return close();
                setReferenceId("");
                setDraft({
                    original: structuredClone(node.method),
                    method: structuredClone(node.method),
                });
            }}
        >
            <DialogTrigger render={<Button variant="outline" size="sm" />}>
                Edit full method options
            </DialogTrigger>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
                <DialogTitle>Configure crafting method</DialogTitle>
                <DialogDescription>
                    Choose a reference item to show the workbench's available options. This only
                    changes the method; actual inputs come from the graph and may have different
                    properties after earlier crafts. Calculation checks their eligibility.
                </DialogDescription>
                <Label className="block space-y-1 text-sm">
                    Reference item for method options
                    <FormSelect
                        className={controlClass}
                        value={referenceId}
                        onValueChange={(selectedValue) => setReferenceId(selectedValue)}
                        disabled={busy}
                    >
                        <FormSelectItem value="">Choose a purchased item</FormSelectItem>
                        {references.map((entry) => (
                            <FormSelectItem key={entry.id} value={entry.id}>
                                {entry.name}
                            </FormSelectItem>
                        ))}
                    </FormSelect>
                </Label>
                {!references.length && (
                    <p>Add a purchased item to configure available method options.</p>
                )}
                <p className="text-sm">
                    Selected method: {engine.methodName(draft?.method ?? node.method)}
                </p>
                {draft && reference && (
                    <fieldset disabled={busy} className="min-w-0 space-y-3">
                        <p className="text-xs text-muted-foreground">
                            {engine.base(reference.item).name} · item level {reference.item.level} ·{" "}
                            {reference.item.rarity}
                        </p>
                        <MethodPicker
                            engine={engine}
                            item={reference.item}
                            value={draft.method}
                            connectedInputs
                            onChange={(method) => setDraft({ ...draft, method })}
                        />
                    </fieldset>
                )}
                <p className="text-xs text-muted-foreground">
                    Existing input connections, conditions and prices are preserved. A newly
                    required second input initially uses the first input's source and consumes a
                    separate item; review its connection after applying. Methods unavailable in this
                    era are refused.
                </p>
                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                )}
                <div className="flex gap-2">
                    <Button disabled={busy || !reference} onClick={() => void apply()}>
                        {busy ? "Applying…" : "Apply method options"}
                    </Button>
                    <Button variant="outline" onClick={close}>
                        Cancel
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
