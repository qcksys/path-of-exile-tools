import { Button } from "~/components/ui/button";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { configureSimpleCraft } from "~/lib/crafting-smart";
import type { GraphCraftNode } from "~/schemas/crafting-graph";
import type { SimpleCraftCapability, SimpleCraftGoal } from "~/schemas/crafting-smart";

const fieldNames = {
    memoryStrands: "memory strands",
    quality: "quality",
    catalystQuality: "catalyst quality",
    sockets: "sockets",
    links: "linked sockets",
};

export function SimpleCraftEditor({
    node,
    engine,
    capability,
    onChange,
    onError,
}: {
    node: GraphCraftNode;
    engine: CraftingEngine;
    capability: SimpleCraftCapability;
    onChange: (node: GraphCraftNode) => void;
    onError: (error: unknown) => void;
}) {
    const apply = (goal: SimpleCraftGoal) => {
        try {
            onChange(configureSimpleCraft(engine, node, goal));
        } catch (error) {
            onError(error);
        }
    };
    const suggested: SimpleCraftGoal = capability.target
        ? { kind: "minimum", field: capability.target.field, value: capability.target.suggested }
        : { kind: "once" };
    return (
        <div className="space-y-3 rounded border border-border p-3" data-simple-craft-editor>
            <p className="text-sm font-medium">{capability.effect}</p>
            {capability.available === false && (
                <p role="status" className="text-xs text-amber-700 dark:text-amber-400">
                    {capability.reason}
                </p>
            )}
            {capability.available === null && (
                <p className="text-xs text-muted-foreground">
                    Input eligibility will be checked when this step runs.
                </p>
            )}
            {!node.smart ? (
                <>
                    <p className="text-xs text-muted-foreground">
                        This saved step uses custom conditions. Simple outcomes replace them with a
                        supported target and its retry path.
                    </p>
                    <Button size="sm" variant="outline" onClick={() => apply(suggested)}>
                        Use simple outcomes
                    </Button>
                </>
            ) : (
                <>
                    <Label className="block text-xs">
                        Outcome
                        <FormSelect
                            aria-label="Simple craft outcome"
                            value={node.smart.kind}
                            onValueChange={(kind) =>
                                apply(kind === "once" ? { kind: "once" } : suggested)
                            }
                        >
                            <FormSelectItem value="once">Apply once</FormSelectItem>
                            {capability.target && (
                                <FormSelectItem value="minimum">
                                    Apply until minimum {fieldNames[capability.target.field]}
                                </FormSelectItem>
                            )}
                        </FormSelect>
                    </Label>
                    {node.smart.kind === "minimum" && capability.target && (
                        <Label className="block text-xs">
                            Minimum {fieldNames[node.smart.field]}
                            <Input
                                key={`${node.smart.field}:${node.smart.value}`}
                                aria-label={`Minimum ${fieldNames[node.smart.field]}`}
                                type="number"
                                min={1}
                                max={capability.target.maximum}
                                defaultValue={node.smart.value}
                                onBlur={(event) => {
                                    const value = Number(event.currentTarget.value);
                                    if (node.smart?.kind !== "minimum") return;
                                    if (
                                        !Number.isInteger(value) ||
                                        value < 1 ||
                                        value > capability.target!.maximum
                                    ) {
                                        event.currentTarget.value = String(node.smart.value);
                                        onError(
                                            new Error(
                                                `Choose a whole number from 1 to ${capability.target!.maximum}.`,
                                            ),
                                        );
                                    } else apply({ ...node.smart, value });
                                }}
                            />
                        </Label>
                    )}
                    <p className="text-xs text-muted-foreground">
                        {node.smart.kind === "once"
                            ? "Apply this craft once, then continue with its result."
                            : "Already at the target: continue for free. Below the target: apply again to the same item. Stop when the target is reached."}
                    </p>
                </>
            )}
        </div>
    );
}
