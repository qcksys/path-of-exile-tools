import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "~/components/ui/button";
import { useCraftingWorkspace } from "~/hooks/use-crafting-workspace";
import { projectFromItem } from "~/lib/crafting-graph-authoring";
import { CRAFTING_RULESET_INDEX_URL, validateRulesetIndex } from "~/lib/crafting-rulesets";
import type { CraftingCatalog, CraftingItem } from "~/schemas/crafting";
import type { CraftingPrice } from "~/schemas/crafting-economy";
import type { CraftingRuleset } from "~/schemas/crafting-rulesets";
import { downloadCraftingJson } from "./projects";

export function SendItemToProject({
    catalog,
    item,
    price,
    ruleset: pinnedRuleset,
}: {
    catalog: CraftingCatalog;
    item: CraftingItem;
    price: CraftingPrice | null;
    ruleset?: CraftingRuleset;
}) {
    const workspace = useCraftingWorkspace();
    const navigate = useNavigate();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const request = useRef<AbortController | null>(null);
    useEffect(() => () => request.current?.abort(), []);
    return (
        <div className="space-y-2">
            <Button
                variant="outline"
                disabled={!workspace.ready || busy || workspace.unsaved}
                onClick={async () => {
                    request.current?.abort();
                    const controller = new AbortController();
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
                                entry.craftingSha256 === catalog.craftingSha256 &&
                                entry.manifestSha256 === catalog.manifestSha256 &&
                                (pinnedRuleset
                                    ? entry.era === pinnedRuleset.era &&
                                      entry.revision === pinnedRuleset.revision &&
                                      entry.engine === pinnedRuleset.engine &&
                                      entry.patch === pinnedRuleset.patch
                                    : index.latest.some(
                                          (latest) =>
                                              latest.game === entry.game &&
                                              latest.era === entry.era &&
                                              latest.revision === entry.revision,
                                      )),
                        );
                        if (!ruleset)
                            throw new Error(
                                pinnedRuleset
                                    ? "The sample's crafting revision is no longer available."
                                    : "This item catalog has no published crafting revision yet.",
                            );
                        if (controller.signal.aborted) return;
                        workspace.store.refresh();
                        workspace.store.edit({
                            action: "createProject",
                            graph: projectFromItem(
                                ruleset,
                                item,
                                `${catalog.bases[item.baseId]?.name ?? "Item"} process`,
                                price,
                            ),
                        });
                        const saved = workspace.store.snapshot();
                        if (saved.unsaved)
                            throw new Error(
                                saved.error ??
                                    "The new project could not be saved. Export the draft before leaving this page.",
                            );
                        await navigate(`/${catalog.game === "poe1" ? 1 : 2}/crafting/projects`);
                    } catch (error) {
                        if (!controller.signal.aborted)
                            setError(error instanceof Error ? error.message : String(error));
                    } finally {
                        if (!controller.signal.aborted) setBusy(false);
                    }
                }}
            >
                {busy ? "Creating project…" : "Use item in new project"}
            </Button>
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
                    Export unsaved project drafts
                </Button>
            )}
        </div>
    );
}
