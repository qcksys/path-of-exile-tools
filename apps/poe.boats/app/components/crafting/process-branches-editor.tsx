import { useId } from "react";
import { Button } from "~/components/ui/button";
import { Field, FieldLabel } from "~/components/ui/field";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { withProcessBranches } from "~/lib/crafting-flow";
import type { CraftingBranch, CraftingProject, CraftingStep } from "~/schemas/crafting";
import { TargetEditor } from "./target-editor";

function Destination({
    label,
    value,
    destinations,
    onChange,
}: {
    label: string;
    value: string;
    destinations: { id: string; name: string }[];
    onChange: (value: string) => void;
}) {
    const id = useId();
    return (
        <Field>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <Select
                value={value}
                items={destinations.map((entry) => ({ value: entry.id, label: entry.name }))}
                onValueChange={(value) => {
                    if (value !== null) onChange(value);
                }}
            >
                <SelectTrigger id={id} className="w-full">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {destinations.map((entry) => (
                        <SelectItem key={entry.id} value={entry.id}>
                            {entry.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </Field>
    );
}

export function ProcessBranchesEditor({
    engine,
    project,
    step,
    destinations,
    onChange,
}: {
    engine: CraftingEngine;
    project: CraftingProject;
    step: CraftingStep;
    destinations: { id: string; name: string }[];
    onChange: (step: CraftingStep) => void;
}) {
    const branches = step.branches!;
    const change = (id: string, patch: Partial<CraftingBranch>) =>
        onChange(
            withProcessBranches(
                step,
                branches.map((branch) => (branch.id === id ? { ...branch, ...patch } : branch)),
            ),
        );
    const move = (index: number, offset: number) => {
        const ordered = [...branches];
        [ordered[index], ordered[index + offset]] = [ordered[index + offset]!, ordered[index]!];
        onChange(withProcessBranches(step, ordered));
    };
    return (
        <section aria-label="Ordered routes" className="space-y-3">
            <p className="text-sm text-muted-foreground">
                Check routes from top to bottom after the step. Take the first matching route; use
                the fallback if none match. Checking routes does not spend currency or add steps.
            </p>
            {branches.map((branch, index) => (
                <section
                    key={branch.id}
                    aria-label={`Route ${index + 1}`}
                    className="space-y-3 rounded-lg border p-3"
                >
                    <div className="flex flex-wrap items-center gap-2">
                        <h4 className="mr-auto text-sm font-semibold">Route {index + 1}</h4>
                        <Button
                            size="xs"
                            variant="outline"
                            disabled={index === 0}
                            aria-label={`Move route ${index + 1} up`}
                            onClick={() => move(index, -1)}
                        >
                            Move up
                        </Button>
                        <Button
                            size="xs"
                            variant="outline"
                            disabled={index === branches.length - 1}
                            aria-label={`Move route ${index + 1} down`}
                            onClick={() => move(index, 1)}
                        >
                            Move down
                        </Button>
                        <Button
                            size="xs"
                            variant="ghost"
                            aria-label={`Remove route ${index + 1}`}
                            onClick={() =>
                                onChange(
                                    withProcessBranches(
                                        step,
                                        branches.filter((entry) => entry.id !== branch.id),
                                    ),
                                )
                            }
                        >
                            Remove
                        </Button>
                    </div>
                    <Destination
                        label={`Route ${index + 1} destination`}
                        value={branch.destination}
                        destinations={destinations}
                        onChange={(destination) => change(branch.id, { destination })}
                    />
                    <div className="flex flex-wrap gap-2">
                        <Button
                            size="xs"
                            variant="outline"
                            onClick={() =>
                                change(branch.id, { condition: structuredClone(project.target) })
                            }
                        >
                            Use current requirements
                        </Button>
                        <Button
                            size="xs"
                            variant="ghost"
                            onClick={() =>
                                change(branch.id, {
                                    condition: {
                                        groups: [],
                                        minimumGroups: 0,
                                        openPrefixes: 0,
                                        openSuffixes: 0,
                                    },
                                })
                            }
                        >
                            Always pass
                        </Button>
                    </div>
                    <details>
                        <summary className="cursor-pointer text-xs font-medium">
                            Edit route {index + 1} condition
                        </summary>
                        <div className="mt-2">
                            <TargetEditor
                                engine={engine}
                                item={project.item}
                                target={branch.condition}
                                title={`Route ${index + 1} condition`}
                                onChange={(condition) => change(branch.id, { condition })}
                            />
                        </div>
                    </details>
                </section>
            ))}
            <Destination
                label="No route matched"
                value={step.onFailure}
                destinations={destinations}
                onChange={(onFailure) => onChange({ ...step, onFailure })}
            />
        </section>
    );
}
