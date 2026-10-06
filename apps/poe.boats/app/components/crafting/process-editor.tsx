import { lazy, Suspense, useId, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Field, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import type { CraftingEngine } from "~/lib/crafting-engine";
import {
    copyProcessStep,
    processBranches,
    processStepName,
    removeProcessStep,
    withProcessBranches,
} from "~/lib/crafting-flow";
import type { CraftingRoutes } from "~/lib/crafting-routes";
import { craftingSequences } from "~/lib/crafting-sequences";
import { targetEntries } from "~/lib/crafting-targets";
import type { CraftingProject, CraftingStep } from "~/schemas/crafting";
import { controlClass, MethodPicker } from "./method-picker";
import { ProcessBranchesEditor } from "./process-branches-editor";
import { ProcessRouteResults } from "./process-route-results";
import { TargetEditor } from "./target-editor";

const ProcessFlow = lazy(() => import("./process-flow"));

export function ProcessEditor({
    engine,
    project,
    inventory = project.inventory,
    onChange,
    routes,
    attempts = 1,
    routeLabel = "Last process run",
    activeStep,
}: {
    engine: CraftingEngine;
    project: CraftingProject;
    inventory?: CraftingProject["inventory"];
    onChange: (steps: CraftingStep[], presentationOnly?: boolean) => void;
    routes?: CraftingRoutes;
    attempts?: number;
    routeLabel?: string;
    activeStep?: string;
}) {
    const formId = useId();
    const stepElements = useRef(new Map<string, HTMLElement>());
    const [showFlow, setShowFlow] = useState(false);
    const [selectedStep, setSelectedStep] = useState<string>();
    const [sequenceId, setSequenceId] = useState("");
    const sequences = craftingSequences(engine);
    const selected = sequences.find((entry) => entry.id === sequenceId);
    const change = (id: string, patch: Partial<CraftingStep>) =>
        onChange(
            project.steps.map((step) => (step.id === id ? { ...step, ...patch } : step)),
            Object.keys(patch).every((key) => ["name", "description", "position"].includes(key)),
        );
    const destinations = [
        { id: "success", name: "Finish successfully" },
        { id: "failure", name: "Finish as failure" },
        { id: "restart", name: "Restart with starting item" },
        ...project.steps.map((step, index) => ({
            id: step.id,
            name: processStepName(step, index),
        })),
    ];
    return (
        <section className="space-y-4" aria-label="Crafting process">
            <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="font-semibold">Crafting process</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                    Each trial starts with the current item. Craft steps apply their method before
                    checking the condition. Condition-only steps route the item without spending
                    currency. All steps count toward the step limit.
                </p>
                <div className="mt-4 space-y-2">
                    <label className="block space-y-1 text-xs">
                        Currency sequence
                        <select
                            className={controlClass}
                            value={sequenceId}
                            onChange={(event) => setSequenceId(event.target.value)}
                        >
                            <option value="">Choose a sequence</option>
                            {sequences.map((sequence) => (
                                <option key={sequence.id} value={sequence.id}>
                                    {sequence.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    {selected ? (
                        <p className="text-xs text-muted-foreground">
                            Starts from a {selected.rarity} item that can become rare. Fills
                            available magic affixes before the last currency; full magic items skip
                            that step. Edit the steps to add your own conditions.
                        </p>
                    ) : null}
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={
                            !selected ||
                            selected.rarity !== project.item.rarity ||
                            !engine.base(project.item).rarities.includes("rare")
                        }
                        onClick={() => selected && onChange(structuredClone(selected.steps))}
                    >
                        {project.steps.length
                            ? "Replace process with sequence"
                            : "Use currency sequence"}
                    </Button>
                </div>
            </div>
            <Button
                variant="outline"
                aria-expanded={showFlow}
                onClick={() => setShowFlow((value) => !value)}
            >
                {showFlow ? "Hide process flow" : "Show process flow"}
            </Button>
            {showFlow ? (
                <Suspense fallback={<p role="status">Loading process flow…</p>}>
                    <ProcessFlow
                        engine={engine}
                        steps={project.steps}
                        routes={routes}
                        attempts={attempts}
                        activeStep={activeStep}
                        selectedStep={selectedStep}
                        onChange={onChange}
                        onSelect={(id) => {
                            setSelectedStep(id);
                            const element = stepElements.current.get(id);
                            element?.scrollIntoView({ block: "nearest" });
                            element?.focus({ preventScroll: true });
                        }}
                    />
                </Suspense>
            ) : null}
            {routes ? (
                <ProcessRouteResults
                    engine={engine}
                    project={project}
                    routes={routes}
                    attempts={attempts}
                    label={routeLabel}
                />
            ) : null}
            {project.steps.map((step, index) => (
                <article
                    key={step.id}
                    aria-label={`${processStepName(step, index)} editor`}
                    tabIndex={-1}
                    ref={(element) => {
                        if (element) stepElements.current.set(step.id, element);
                        else stepElements.current.delete(step.id);
                    }}
                    className="space-y-4 rounded-lg border border-border bg-card p-4"
                >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-mono text-sm">
                            {String(index + 1).padStart(2, "0")} ·{" "}
                            {step.method ? "Craft" : "Check item"}
                        </h3>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="xs"
                                disabled={project.steps.length >= 50}
                                onClick={() =>
                                    onChange([
                                        ...project.steps.slice(0, index + 1),
                                        copyProcessStep(step, index),
                                        ...project.steps.slice(index + 1),
                                    ])
                                }
                            >
                                Copy step
                            </Button>
                            <Button
                                variant="ghost"
                                size="xs"
                                onClick={() => onChange(removeProcessStep(project.steps, step.id))}
                            >
                                Remove step
                            </Button>
                        </div>
                    </div>
                    <Field>
                        <FieldLabel htmlFor={`${formId}-${step.id}-name`}>Step name</FieldLabel>
                        <Input
                            id={`${formId}-${step.id}-name`}
                            value={step.name ?? ""}
                            maxLength={120}
                            placeholder={`Step ${index + 1}`}
                            onChange={(event) =>
                                change(step.id, { name: event.target.value || undefined })
                            }
                        />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor={`${formId}-${step.id}-description`}>
                            Step description
                        </FieldLabel>
                        <Textarea
                            id={`${formId}-${step.id}-description`}
                            value={step.description ?? ""}
                            maxLength={1000}
                            placeholder="Explain the purpose of this step"
                            onChange={(event) =>
                                change(step.id, { description: event.target.value || undefined })
                            }
                        />
                    </Field>
                    <label className="block space-y-1 text-xs">
                        Step action
                        <select
                            className={controlClass}
                            value={step.method ? "craft" : "check"}
                            onChange={(event) =>
                                change(step.id, {
                                    method:
                                        event.target.value === "craft"
                                            ? structuredClone(project.method)
                                            : undefined,
                                })
                            }
                        >
                            <option value="craft">Craft, then check condition</option>
                            <option value="check">Check condition only</option>
                        </select>
                    </label>
                    {step.method ? (
                        <MethodPicker
                            engine={engine}
                            item={project.item}
                            value={step.method}
                            inventory={inventory}
                            onChange={(method) => change(step.id, { method })}
                        />
                    ) : null}
                    {step.branches ? (
                        <ProcessBranchesEditor
                            engine={engine}
                            project={project}
                            step={step}
                            destinations={destinations}
                            onChange={(changed) => change(step.id, changed)}
                        />
                    ) : (
                        <>
                            <div className="rounded border border-border bg-muted/30 p-3 text-sm">
                                <p>
                                    Condition:{" "}
                                    {step.condition.expression
                                        ? `${targetEntries(step.condition).length - 1} nested conditions (${step.condition.expression.negated ? "NOT " : ""}${step.condition.expression.operator.toUpperCase()}) · `
                                        : ""}
                                    {step.condition.groups.length
                                        ? `${step.condition.minimumGroups || step.condition.groups.length} of ${step.condition.groups.length} target groups`
                                        : "No modifier groups required"}
                                    {step.condition.groups.some((group) => group.negated)
                                        ? ` · ${step.condition.groups.filter((group) => group.negated).length} exclusion group(s)`
                                        : ""}
                                    {step.condition.openPrefixes
                                        ? ` · ${step.condition.openPrefixes} open prefixes`
                                        : ""}
                                    {step.condition.openSuffixes
                                        ? ` · ${step.condition.openSuffixes} open suffixes`
                                        : ""}
                                    {step.condition.openAffixes
                                        ? ` · ${step.condition.openAffixes} open affixes`
                                        : ""}
                                    {step.condition.rarity ? ` · ${step.condition.rarity}` : ""}
                                    {step.condition.jewelSocket === undefined
                                        ? ""
                                        : step.condition.jewelSocket
                                          ? " · Jewel socket"
                                          : " · no Jewel socket"}
                                    {step.condition.corrupted === undefined
                                        ? ""
                                        : step.condition.corrupted
                                          ? " · corrupted"
                                          : " · uncorrupted"}
                                    {step.condition.waystoneTier
                                        ? ` · Waystone tier ${step.condition.waystoneTier.min}–${step.condition.waystoneTier.max}`
                                        : ""}
                                    {step.condition.mapTier
                                        ? ` · Map tier ${step.condition.mapTier.min}–${step.condition.mapTier.max}`
                                        : ""}
                                    {step.condition.catalyst
                                        ? ` · ${step.condition.catalyst.min}–${step.condition.catalyst.max}% catalyst quality${step.condition.catalyst.id ? ` (${engine.costName(step.condition.catalyst.id)})` : ""}`
                                        : ""}
                                    {step.condition.quality
                                        ? ` · ${step.condition.quality.min}–${step.condition.quality.max}% ${step.condition.quality.mapType ? engine.catalog.crafting.mapQuality.find((entry) => entry.id === step.condition.quality!.mapType)!.description : "base quality"}`
                                        : ""}
                                    {step.condition.memoryStrands
                                        ? ` · ${step.condition.memoryStrands.min}–${step.condition.memoryStrands.max} memory strands`
                                        : ""}
                                    {step.condition.intentions
                                        ? ` · ${step.condition.intentions.min}–${step.condition.intentions.max} Intention uses`
                                        : ""}
                                    {step.condition.influences?.length
                                        ? ` · ${step.condition.influences.length} required influences`
                                        : ""}
                                    {step.condition.stats?.length
                                        ? ` · ${step.condition.stats.length} stat requirements`
                                        : ""}
                                    {Object.keys(step.condition.baseDefences ?? {}).length
                                        ? ` · ${Object.keys(step.condition.baseDefences ?? {}).length} base defence requirements`
                                        : ""}
                                    {Object.keys(step.condition.properties ?? {}).length
                                        ? ` · ${Object.keys(step.condition.properties ?? {}).length} final item property requirements`
                                        : ""}
                                    {step.condition.anointments?.length
                                        ? ` · ${step.condition.anointments.length} anointment requirements`
                                        : ""}
                                    {step.condition.enchantments?.length
                                        ? " · enchantment required"
                                        : ""}
                                    {(
                                        [
                                            ["affixCount", "affixes"],
                                            ["prefixCount", "prefixes"],
                                            ["suffixCount", "suffixes"],
                                            ["unrevealedCount", "unrevealed"],
                                        ] as const
                                    )
                                        .map(([key, label]) =>
                                            step.condition[key]
                                                ? ` · ${step.condition[key].min}–${step.condition[key].max} ${label}`
                                                : "",
                                        )
                                        .join("")}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <Button
                                        size="xs"
                                        variant="outline"
                                        onClick={() =>
                                            change(step.id, {
                                                condition: structuredClone(project.target),
                                            })
                                        }
                                    >
                                        Use current requirements
                                    </Button>
                                    <Button
                                        size="xs"
                                        variant="ghost"
                                        onClick={() =>
                                            change(step.id, {
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
                                <details className="mt-3">
                                    <summary className="cursor-pointer text-xs font-medium">
                                        Edit step condition
                                    </summary>
                                    <div className="mt-2">
                                        <TargetEditor
                                            engine={engine}
                                            item={project.item}
                                            target={step.condition}
                                            title={`Step ${index + 1} condition`}
                                            onChange={(condition) => change(step.id, { condition })}
                                        />
                                    </div>
                                </details>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {(["onSuccess", "onFailure"] as const).map((key) => (
                                    <label key={key} className="space-y-1 text-xs">
                                        {key === "onSuccess"
                                            ? "Condition passed"
                                            : "Condition failed"}
                                        <select
                                            className={controlClass}
                                            value={step[key]}
                                            onChange={(event) =>
                                                change(step.id, { [key]: event.target.value })
                                            }
                                        >
                                            {destinations.map((entry) => (
                                                <option key={entry.id} value={entry.id}>
                                                    {entry.name}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                ))}
                            </div>
                        </>
                    )}
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={processBranches(step).length >= 12}
                        onClick={() =>
                            change(
                                step.id,
                                withProcessBranches(step, [
                                    ...processBranches(step),
                                    {
                                        id: `route-${crypto.randomUUID()}`,
                                        condition: structuredClone(project.target),
                                        destination: "success",
                                    },
                                ]),
                            )
                        }
                    >
                        Add conditional route
                    </Button>
                </article>
            ))}
            <Button
                variant="outline"
                disabled={project.steps.length >= 50}
                onClick={() =>
                    onChange([
                        ...project.steps,
                        {
                            id: `step-${crypto.randomUUID()}`,
                            method: structuredClone(project.method),
                            condition: structuredClone(project.target),
                            onSuccess: "success",
                            onFailure: "failure",
                        },
                    ])
                }
            >
                Add crafting step
            </Button>
            <Button
                variant="outline"
                disabled={project.steps.length >= 50}
                onClick={() =>
                    onChange([
                        ...project.steps,
                        {
                            id: `step-${crypto.randomUUID()}`,
                            condition: structuredClone(project.target),
                            onSuccess: "success",
                            onFailure: "failure",
                        },
                    ])
                }
            >
                Add condition check
            </Button>
        </section>
    );
}
