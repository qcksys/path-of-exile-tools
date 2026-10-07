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
import { useCraftingWorkspace } from "~/hooks/use-crafting-workspace";
import { catalogBaseOptions } from "~/lib/recombinator-catalog";
import type { RecombinatorDraftItem } from "~/lib/recombinator-plan";
import { craftingGraphSchema } from "~/schemas/crafting-graph";
import type { RecombinatorCatalog } from "~/schemas/recombinator-catalog";

const previewSchema = z.object({ graph: craftingGraphSchema, itemText: z.string() });
const control = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export function SendInputToCrafting({
    entry,
    catalog,
}: {
    entry: RecombinatorDraftItem;
    catalog: RecombinatorCatalog;
}) {
    const workspace = useCraftingWorkspace();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [baseId, setBaseId] = useState("");
    const [rarity, setRarity] = useState("rare");
    const [rolls, setRolls] = useState("minimum");
    const [preview, setPreview] = useState<z.infer<typeof previewSchema>>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const request = useRef<AbortController | null>(null);
    useEffect(() => () => request.current?.abort(), []);
    const chosen = catalogBaseOptions(catalog.bases).find(
        (base) => base.id === entry.catalog?.base.id,
    );
    const bases = chosen
        ? catalog.bases.filter((base) =>
              chosen.id.startsWith("generic:")
                  ? base.itemClass === chosen.itemClass &&
                    chosen.tags.every((tag) => base.tags.includes(tag))
                  : base.id === chosen.id,
          )
        : [];
    function reset() {
        request.current?.abort();
        setPreview(undefined);
        setError("");
        setBusy(false);
    }
    async function prepare() {
        reset();
        const controller = new AbortController();
        request.current = controller;
        setBusy(true);
        try {
            const response = await fetch("/api/v1/crafting/items/from-recombinator", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                    source: {
                        patch: catalog.patch,
                        manifestSha256: catalog.source.manifestSha256,
                        craftingSha256: catalog.source.craftingDataSha256,
                    },
                    selection: entry,
                    baseId,
                    rarity,
                    rolls,
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
                        : "Cannot prepare this input.",
                );
            if (!controller.signal.aborted) setPreview(previewSchema.parse(data));
        } catch (error) {
            if (!controller.signal.aborted)
                setError(error instanceof Error ? error.message : "Cannot prepare this input.");
        } finally {
            if (!controller.signal.aborted) setBusy(false);
        }
    }
    async function save() {
        if (!preview) return;
        setBusy(true);
        try {
            workspace.store.refresh();
            workspace.store.edit({ action: "createProject", graph: preview.graph });
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
                if (value) {
                    setBaseId(chosen && !chosen.id.startsWith("generic:") ? chosen.id : "");
                    setRarity(
                        entry.catalog &&
                            entry.catalog.prefixes.length <= 1 &&
                            entry.catalog.suffixes.length <= 1
                            ? "magic"
                            : "rare",
                    );
                    setRolls("minimum");
                }
            }}
        >
            <DialogTrigger render={<Button variant="outline" size="sm" className="mt-3" />}>
                Use input in crafting project
            </DialogTrigger>
            <DialogContent className="max-h-[90dvh] overflow-y-auto">
                <DialogTitle>Prepare {entry.name} for crafting</DialogTitle>
                <DialogDescription>
                    The recombinator stores modifier identities without rolled values. Choose a
                    concrete base and value assumptions, then review the item. This copies one
                    starting input; recombination steps and preparation recipes stay in the original
                    plan. The purchase price is unknown. You can edit the prepared item in the
                    project's full workbench.
                </DialogDescription>
                <label className="space-y-1 text-sm">
                    Concrete item base
                    <select
                        className={control}
                        value={baseId}
                        onChange={(event) => {
                            reset();
                            setBaseId(event.target.value);
                        }}
                    >
                        <option value="">Choose a base</option>
                        {bases.map((base) => (
                            <option key={base.id} value={base.id}>
                                {base.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="space-y-1 text-sm">
                    Input rarity
                    <select
                        className={control}
                        value={rarity}
                        onChange={(event) => {
                            reset();
                            setRarity(event.target.value);
                        }}
                    >
                        <option value="normal">Normal</option>
                        <option value="magic">Magic</option>
                        <option value="rare">Rare</option>
                    </select>
                </label>
                <label className="space-y-1 text-sm">
                    Assumed modifier rolls
                    <select
                        className={control}
                        value={rolls}
                        onChange={(event) => {
                            reset();
                            setRolls(event.target.value);
                        }}
                    >
                        <option value="minimum">Minimum values</option>
                        <option value="maximum">Maximum values</option>
                    </select>
                </label>
                <p className="text-xs text-muted-foreground">
                    Explicit and implicit rolls use this assumption. Other item properties start at
                    workbench defaults. Custom modifier text and manual probability flags must be
                    resolved before transfer.
                </p>
                <Button variant="outline" disabled={!baseId || busy} onClick={() => void prepare()}>
                    {busy ? "Preparing…" : "Preview prepared input"}
                </Button>
                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                )}
                {preview && (
                    <>
                        <section
                            aria-label="Prepared input preview"
                            className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 font-mono text-xs"
                        >
                            {preview.itemText}
                        </section>
                        <Button
                            disabled={busy || !workspace.ready || workspace.unsaved}
                            onClick={() => void save()}
                        >
                            Create project from prepared input
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
