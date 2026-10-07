import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { z } from "zod";
import { downloadCraftingJson } from "~/components/crafting/projects";
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
import { useCraftingWorkspace } from "~/hooks/use-crafting-workspace";
import { catalogBaseOptions } from "~/lib/recombinator-catalog";
import type { RecombinatorDraft } from "~/lib/recombinator-plan";
import { type CraftingGraph, craftingGraphSchema } from "~/schemas/crafting-graph";
import type { RecombinatorCatalog } from "~/schemas/recombinator-catalog";
import { recombinatorCraftingPlanSchema } from "~/schemas/recombinator-crafting";

const control = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
type Choices = z.infer<typeof recombinatorCraftingPlanSchema>["inputs"];

export function SendPlanToCrafting({
    catalog,
    draft,
    finalStep,
    required,
    exact,
    requiredBase,
}: {
    catalog: RecombinatorCatalog;
    draft: RecombinatorDraft;
    finalStep: string;
    required: string[];
    exact: boolean;
    requiredBase: string;
}) {
    const workspace = useCraftingWorkspace();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [choices, setChoices] = useState<Choices>({});
    const [preview, setPreview] = useState<CraftingGraph>();
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const request = useRef<AbortController | null>(null);
    function reset() {
        request.current?.abort();
        setPreview(undefined);
        setError("");
        setBusy(false);
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: Plan edits invalidate a pending preview.
    useEffect(() => {
        request.current?.abort();
        setPreview(undefined);
        setBusy(false);
        return () => request.current?.abort();
    }, [draft, finalStep, required, exact, requiredBase, catalog]);
    async function prepare() {
        reset();
        const controller = new AbortController();
        request.current = controller;
        setBusy(true);
        try {
            const input = recombinatorCraftingPlanSchema.parse({
                source: {
                    patch: catalog.patch,
                    manifestSha256: catalog.source.manifestSha256,
                    craftingSha256: catalog.source.craftingDataSha256,
                },
                draft,
                inputs: choices,
                finalStep,
                required,
                exact,
                requiredBase,
            });
            const response = await fetch("/api/v1/crafting/graph/from-recombinator", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input),
                signal: controller.signal,
            });
            const data = await response.json();
            if (!response.ok) {
                const failure = z.object({ error: z.string() }).safeParse(data);
                throw new Error(
                    failure.success ? failure.data.error : "Cannot transfer this plan.",
                );
            }
            if (!controller.signal.aborted)
                setPreview(z.object({ graph: craftingGraphSchema }).parse(data).graph);
        } catch (error) {
            if (!controller.signal.aborted)
                setError(error instanceof Error ? error.message : "Cannot prepare this plan.");
        } finally {
            if (!controller.signal.aborted) setBusy(false);
        }
    }
    async function save() {
        if (!preview) return;
        setBusy(true);
        try {
            workspace.store.refresh();
            workspace.store.edit({ action: "createProject", graph: preview });
            const saved = workspace.store.snapshot();
            if (saved.unsaved)
                throw new Error(saved.error ?? "Export the unsaved project before leaving.");
            await navigate("/1/crafting/projects");
        } catch (error) {
            setError(error instanceof Error ? error.message : "Cannot save this project.");
        } finally {
            setBusy(false);
        }
    }
    return (
        <Dialog
            open={open}
            onOpenChange={(value) => {
                reset();
                setOpen(value);
                if (value)
                    setChoices(
                        Object.fromEntries(
                            draft.items.map((entry) => [
                                entry.id,
                                {
                                    baseId: entry.catalog?.base.id.startsWith("generic:")
                                        ? ""
                                        : (entry.catalog?.base.id ?? ""),
                                    rarity: "rare",
                                    rolls: "minimum",
                                },
                            ]),
                        ),
                    );
            }}
        >
            <DialogTrigger render={<Button variant="outline" />}>
                Use plan in crafting project
            </DialogTrigger>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
                <DialogTitle>Prepare recombination plan</DialogTitle>
                <DialogDescription>
                    Choose concrete inputs and roll assumptions. Copies connected recombinations,
                    bench preparation, crafted-mod removal and the selected step's target. Prices
                    remain unknown. Idealized essence preparation and manual modifier flags must be
                    resolved before transfer.
                </DialogDescription>
                <p className="text-sm">
                    Final step:{" "}
                    {draft.steps.find((step) => step.id === finalStep)?.name ??
                        "Choose a result step"}
                    . The graph uses the retained crafting engine and its full item rules; its
                    estimates may differ from the standalone modifier-only model.
                </p>
                {draft.items.map((entry) => {
                    const chosen = catalogBaseOptions(catalog.bases).find(
                        (base) => base.id === entry.catalog?.base.id,
                    );
                    const bases = catalog.bases.filter(
                        (base) =>
                            chosen &&
                            (chosen.id.startsWith("generic:")
                                ? base.itemClass === chosen.itemClass &&
                                  chosen.tags.every((tag) => base.tags.includes(tag))
                                : chosen.id === base.id),
                    );
                    const choice = choices[entry.id];
                    function change(update: Partial<Choices[string]>) {
                        reset();
                        setChoices((current) => ({
                            ...current,
                            [entry.id]: { ...current[entry.id]!, ...update },
                        }));
                    }
                    return (
                        <fieldset key={entry.id} className="space-y-2 rounded border p-3">
                            <legend className="px-1 font-medium">{entry.name}</legend>
                            <Label className="block text-sm">
                                Concrete base
                                <FormSelect
                                    className={control}
                                    value={choice?.baseId ?? ""}
                                    onValueChange={(selectedValue) =>
                                        change({ baseId: selectedValue })
                                    }
                                >
                                    <FormSelectItem value="">Choose a base</FormSelectItem>
                                    {bases.map((base) => (
                                        <FormSelectItem key={base.id} value={base.id}>
                                            {base.name}
                                        </FormSelectItem>
                                    ))}
                                </FormSelect>
                            </Label>
                            <div className="grid grid-cols-2 gap-2">
                                <Label className="block text-sm">
                                    Rarity
                                    <FormSelect
                                        className={control}
                                        value={choice?.rarity ?? "rare"}
                                        onValueChange={(selectedValue) =>
                                            change({
                                                rarity: selectedValue as Choices[string]["rarity"],
                                            })
                                        }
                                    >
                                        <FormSelectItem value="normal">Normal</FormSelectItem>
                                        <FormSelectItem value="magic">Magic</FormSelectItem>
                                        <FormSelectItem value="rare">Rare</FormSelectItem>
                                    </FormSelect>
                                </Label>
                                <Label className="block text-sm">
                                    Assumed rolls
                                    <FormSelect
                                        className={control}
                                        value={choice?.rolls ?? "minimum"}
                                        onValueChange={(selectedValue) =>
                                            change({
                                                rolls: selectedValue as Choices[string]["rolls"],
                                            })
                                        }
                                    >
                                        <FormSelectItem value="minimum">Minimum</FormSelectItem>
                                        <FormSelectItem value="maximum">Maximum</FormSelectItem>
                                    </FormSelect>
                                </Label>
                            </div>
                        </fieldset>
                    );
                })}
                <Button
                    variant="outline"
                    disabled={busy || draft.items.some((entry) => !choices[entry.id]?.baseId)}
                    onClick={() => void prepare()}
                >
                    {busy ? "Preparing…" : "Preview crafting plan"}
                </Button>
                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                )}
                {preview && (
                    <>
                        <section
                            aria-label="Crafting plan preview"
                            className="rounded bg-muted p-3 text-sm"
                        >
                            <p>
                                {preview.nodes.filter((node) => node.kind === "acquire").length}{" "}
                                purchased inputs ·{" "}
                                {preview.nodes.filter((node) => node.kind === "craft").length} craft
                                steps
                            </p>
                            <ol className="list-inside list-decimal">
                                {preview.nodes.map((node) => (
                                    <li key={node.id}>{node.name}</li>
                                ))}
                            </ol>
                            <p>
                                Enter purchase and crafting prices in the project before calculating
                                costs.
                            </p>
                        </section>
                        <Button
                            disabled={busy || !workspace.ready || workspace.unsaved}
                            onClick={() => void save()}
                        >
                            Create project from plan
                        </Button>
                    </>
                )}
                {workspace.unsaved && (
                    <Button
                        variant="outline"
                        onClick={() => downloadCraftingJson(workspace.state, "crafting-drafts")}
                    >
                        Export unsaved project
                    </Button>
                )}
            </DialogContent>
        </Dialog>
    );
}
