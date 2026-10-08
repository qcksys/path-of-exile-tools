import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/ui/table";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { processBranches, processStepName } from "~/lib/crafting-flow";
import {
    type CraftingRoutes,
    craftingBranchCount,
    craftingRoute,
    emptyCraftingRoute,
} from "~/lib/crafting-routes";
import type { CraftingProject } from "~/schemas/crafting";

const format = (value: number) => value.toLocaleString(undefined, { maximumSignificantDigits: 4 });

export function ProcessRouteResults({
    engine,
    project,
    routes,
    attempts,
    label,
}: {
    engine: CraftingEngine;
    project: CraftingProject;
    routes: CraftingRoutes;
    attempts: number;
    label: string;
}) {
    const destination = (id: string) => {
        const index = project.steps.findIndex((step) => step.id === id);
        return index < 0 ? id : processStepName(project.steps[index]!, index);
    };
    const denominator = Math.max(1, attempts);
    return (
        <section
            aria-label="Process route results"
            className="space-y-3 rounded-lg border bg-card p-4"
        >
            <h3 className="font-semibold">Process routes</h3>
            <p className="text-xs text-muted-foreground">
                {label}. Counts and spending below are averages per attempt. Loops can visit a step
                more than once. A passed condition still needs the final requirements to succeed.
                {project.baseCost !== undefined
                    ? " Starting item costs are included in the overall results, separately from each step's currency."
                    : ""}
            </p>
            {project.steps.map((step, index) => {
                const route = craftingRoute(routes, step.id) ?? emptyCraftingRoute();
                const unpriced = Object.keys(route.spending).some(
                    (id) => project.prices[id] === undefined,
                );
                const cost =
                    Object.entries(route.spending).reduce(
                        (sum, [id, amount]) => sum + amount * (project.prices[id] ?? 0),
                        0,
                    ) / denominator;
                return (
                    <article
                        key={step.id}
                        className="space-y-2 border-t pt-3"
                        aria-label={`${processStepName(step, index)} route results`}
                    >
                        <h4 className="text-sm font-medium">{processStepName(step, index)}</h4>
                        <p className="text-xs text-muted-foreground">
                            {format(route.visits / denominator)} visits ·{" "}
                            {unpriced
                                ? "Enter missing currency prices"
                                : `${format(cost)} chaos / attempt`}
                        </p>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Route</TableHead>
                                    <TableHead>Destination</TableHead>
                                    <TableHead className="text-right">Uses / attempt</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {processBranches(step).map((branch, index) => (
                                    <TableRow key={branch.id}>
                                        <TableCell>
                                            {step.branches ? `Route ${index + 1}` : "Passed"}
                                        </TableCell>
                                        <TableCell>{destination(branch.destination)}</TableCell>
                                        <TableCell className="text-right font-mono">
                                            {format(
                                                (step.branches
                                                    ? craftingBranchCount(route, branch.id)
                                                    : route.passed) / denominator,
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                <TableRow>
                                    <TableCell>
                                        {step.branches ? "No route matched" : "Failed"}
                                    </TableCell>
                                    <TableCell>{destination(step.onFailure)}</TableCell>
                                    <TableCell className="text-right font-mono">
                                        {format(route.failed / denominator)}
                                    </TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell>Step errors</TableCell>
                                    <TableCell>failure</TableCell>
                                    <TableCell className="text-right font-mono">
                                        {format(route.errors / denominator)}
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                        {Object.keys(route.spending).length ? (
                            <details className="text-xs">
                                <summary className="cursor-pointer">
                                    Step currency / attempt
                                </summary>
                                <dl className="mt-2 space-y-1">
                                    {Object.entries(route.spending).map(([id, amount]) => (
                                        <div className="flex justify-between gap-3" key={id}>
                                            <dt>
                                                <ItemName
                                                    id={id}
                                                    name={engine.costName(id)}
                                                    game={engine.catalog.game}
                                                />
                                            </dt>
                                            <dd className="font-mono">
                                                {format(amount / denominator)}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            </details>
                        ) : null}
                    </article>
                );
            })}
        </section>
    );
}

import { ItemName } from "~/components/item-art";
