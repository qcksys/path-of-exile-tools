import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "~/components/ui/button";
import { useCraftingWorkspace } from "~/hooks/use-crafting-workspace";
import {
    CRAFTING_RULESET_INDEX_URL,
    rulesetReference,
    validateRulesetIndex,
} from "~/lib/crafting-rulesets";
import type { CraftingCatalog, CraftingProject } from "~/schemas/crafting";
import { craftingGraphSchema } from "~/schemas/crafting-graph";
import { downloadCraftingJson } from "./projects";

export function SendMethodToProject({
    catalog,
    project,
}: {
    catalog: CraftingCatalog;
    project: CraftingProject;
}) {
    const workspace = useCraftingWorkspace();
    const navigate = useNavigate();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const request = useRef<AbortController | null>(null);
    useEffect(() => () => request.current?.abort(), []);
    async function send() {
        const controller = new AbortController();
        request.current?.abort();
        request.current = controller;
        setBusy(true);
        setError("");
        try {
            const response = await fetch(CRAFTING_RULESET_INDEX_URL, {
                cache: "no-cache",
                signal: controller.signal,
            });
            if (!response.ok) throw new Error("Crafting revisions are unavailable.");
            const index = validateRulesetIndex(await response.json());
            const ruleset = index.revisions.find(
                (entry) =>
                    entry.game === catalog.game &&
                    entry.manifestSha256 === catalog.manifestSha256 &&
                    entry.craftingSha256 === catalog.craftingSha256 &&
                    index.latest.some(
                        (latest) =>
                            latest.game === entry.game &&
                            latest.era === entry.era &&
                            latest.revision === entry.revision,
                    ),
            );
            if (!ruleset)
                throw new Error("This item catalog has no published crafting revision yet.");
            const price = (amount: number) => ({
                amount,
                currency: "chaos",
                source: "manual",
                confidence: null,
            });
            const created = await fetch("/api/v1/crafting/graph/from-method", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                    game: catalog.game,
                    ruleset: rulesetReference(ruleset),
                    item: project.item,
                    method: project.method,
                    name: `${catalog.bases[project.item.baseId]?.name ?? "Item"} craft`,
                    price: project.baseCost === undefined ? null : price(project.baseCost),
                    prices: Object.fromEntries(
                        Object.entries(project.prices).map(([id, amount]) => [id, price(amount)]),
                    ),
                }),
            });
            const data = await created.json();
            if (!created.ok)
                throw new Error(
                    data &&
                        typeof data === "object" &&
                        "error" in data &&
                        typeof data.error === "string"
                        ? data.error
                        : "The selected craft could not become a graph.",
                );
            const graph = craftingGraphSchema.parse(
                data && typeof data === "object" && "graph" in data ? data.graph : undefined,
            );
            if (controller.signal.aborted) return;
            workspace.store.refresh();
            workspace.store.edit({ action: "createProject", graph });
            const saved = workspace.store.snapshot();
            if (saved.unsaved)
                throw new Error(
                    saved.error ?? "Export the unsaved project before leaving this page.",
                );
            await navigate(`/${catalog.game === "poe1" ? 1 : 2}/crafting/projects`);
        } catch (error) {
            if (!controller.signal.aborted)
                setError(error instanceof Error ? error.message : "Cannot create this project.");
        } finally {
            if (!controller.signal.aborted) setBusy(false);
        }
    }
    return (
        <div className="space-y-2">
            <Button
                variant="outline"
                disabled={!workspace.ready || busy || workspace.unsaved}
                onClick={() => void send()}
            >
                {busy ? "Creating craft project…" : "Use selected craft in new project"}
            </Button>
            <p className="text-xs text-muted-foreground">
                Copies this item, the selected method, any consumed donor and entered prices into
                one craft step. Configure outcomes and recovery in the new project; calculator
                targets and multi-step processes are not copied.
            </p>
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            {workspace.unsaved && (
                <Button
                    variant="outline"
                    onClick={() => downloadCraftingJson(workspace.state, "crafting-drafts")}
                >
                    Export unsaved craft project
                </Button>
            )}
        </div>
    );
}
