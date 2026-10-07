import { useMemo, useState } from "react";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { exportCraftingItemText } from "~/lib/crafting-item-text";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import type { CraftingGraphResult } from "~/schemas/crafting-graph-result";
import type { CraftingRuleset } from "~/schemas/crafting-rulesets";
import { graphControl } from "./graph-query-editor";
import { ItemCard } from "./item-card";
import { SendItemToProject } from "./send-to-project";

export function GraphSamples({
    engine,
    graph,
    result,
    ruleset,
}: {
    engine: CraftingEngine;
    graph: CraftingGraph;
    result: CraftingGraphResult;
    ruleset: CraftingRuleset;
}) {
    const [selected, setSelected] = useState(0);
    const sample = result.samples[selected];
    const item = sample?.item;
    const exported = useMemo(() => {
        if (!item) return { text: "", issue: "" };
        try {
            return { text: exportCraftingItemText(engine, item), issue: "" };
        } catch (error) {
            return {
                text: JSON.stringify(item, null, 2),
                issue:
                    error instanceof Error
                        ? error.message
                        : "Item text is unavailable; the complete item is shown as JSON.",
            };
        }
    }, [engine, item]);
    if (!result.samples.length) return null;
    return (
        <section
            aria-label="Sampled output items"
            className="space-y-3 rounded-lg border border-border bg-card p-4"
        >
            <h2 className="font-semibold">Sampled output items</h2>
            <p className="text-xs text-muted-foreground">
                These are the first {result.samples.length} sampled trials, not a complete outcome
                distribution or items you own. A new project preserves the selected item's full
                state and crafting revision. Its acquisition price is unknown; this trial's spending
                is not an estimate of the cost to produce that particular item.
            </p>
            <Label className="block space-y-1 text-xs">
                Sampled trial
                <FormSelect
                    className={graphControl}
                    value={selected}
                    onValueChange={(selectedValue) => setSelected(Number(selectedValue))}
                >
                    {result.samples.map((entry, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: A trial's ordinal is its identity; this fixed prefix is never reordered.
                        <FormSelectItem key={index} value={index}>
                            Trial {index + 1} ·{" "}
                            {graph.outcomes.find((outcome) => outcome.id === entry.outcomeId)
                                ?.name ?? entry.status}
                        </FormSelectItem>
                    ))}
                </FormSelect>
            </Label>
            {sample && (
                <p className="text-xs text-muted-foreground">
                    This trial: {sample.actions} craft actions ·{" "}
                    {sample.cost === null
                        ? "incomplete cost"
                        : `${sample.cost.toFixed(2)} ${graph.currency} spent`}
                </p>
            )}
            {sample?.error && <p className="text-sm">{sample.error}</p>}
            {item ? (
                <div className="grid gap-4 lg:grid-cols-2">
                    <ItemCard engine={engine} item={item} label="Sampled output" />
                    <div className="min-w-0 space-y-3">
                        {exported.issue && (
                            <p className="text-xs text-muted-foreground">{exported.issue}</p>
                        )}
                        <Label className="block space-y-1 text-xs">
                            {exported.issue ? "Sampled item JSON" : "Sampled item text"}
                            <Textarea
                                className={`${graphControl} min-h-56 font-mono text-xs`}
                                readOnly
                                value={exported.text}
                            />
                        </Label>
                        {item.destroyed ? (
                            <p className="text-xs">
                                Destroyed items cannot become crafting inputs.
                            </p>
                        ) : (
                            <SendItemToProject
                                key={selected}
                                catalog={engine.catalog}
                                item={item}
                                price={null}
                                ruleset={ruleset}
                            />
                        )}
                    </div>
                </div>
            ) : (
                <p className="text-sm">This trial did not return a final item.</p>
            )}
        </section>
    );
}
