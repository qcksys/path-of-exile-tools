import { useState } from "react";
import { Button } from "~/components/ui/button";
import type { CraftingEngine } from "~/lib/crafting-engine";
import type { CraftingResult } from "~/lib/crafting-simulation";
import type { CraftingItem } from "~/schemas/crafting";
import { ItemCard, modText } from "./item-card";
import { SuccessDistribution } from "./success-distribution";

const number = (value: number | null) =>
    value === null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
export function CraftingResults({
    engine,
    result,
    onUse,
}: {
    engine: CraftingEngine;
    result: CraftingResult;
    onUse: (item: CraftingItem) => void;
}) {
    const exact = result.kind === "exact" || result.kind === "exact-process";
    const process = result.kind === "process" || result.kind === "exact-process";
    const attempts = exact ? 1 : Math.max(1, result.trials);
    const [sampleIndex, setSampleIndex] = useState(0);
    const index = Math.min(sampleIndex, Math.max(0, result.samples.length - 1));
    const sample = result.samples[index];
    return (
        <section className="space-y-5" aria-label="Crafting results">
            <div className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-baseline justify-between gap-2">
                    <h2 className="font-semibold">
                        {exact ? "Calculated odds" : "Simulation results"}
                    </h2>
                    <span className="text-xs text-muted-foreground">
                        {exact
                            ? "Exact within the model"
                            : `${result.trials.toLocaleString()} trials`}
                    </span>
                </div>
                <div className="mt-4 font-mono text-4xl tracking-tight">
                    {!exact && !result.trials
                        ? "—"
                        : (result.probability * 100).toLocaleString(undefined, {
                              maximumSignificantDigits: 4,
                          })}
                    {exact || result.trials ? (
                        <span className="ml-1 text-lg text-muted-foreground">%</span>
                    ) : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                    {exact
                        ? `Chance of meeting your requirements in one ${process ? "process attempt" : "craft"}`
                        : !result.trials
                          ? "No completed trials."
                          : result.simulationLimit
                            ? `${result.successes.toLocaleString()} successful trials out of ${result.trials.toLocaleString()} completed trials`
                            : `${result.successes.toLocaleString()} successful trials · 95% interval ${(result.interval[0] * 100).toPrecision(3)}–${(result.interval[1] * 100).toPrecision(3)}%`}
                </p>
                {result.simulationLimit ? (
                    <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                        {result.simulationLimit.kind === "manual" ? (
                            <p>
                                No fixed simulation target. Results include the last completed
                                batch.
                            </p>
                        ) : (
                            <p role="status">
                                {result.stopReason === "trials"
                                    ? "Maximum trial count reached before the simulation target."
                                    : result.stopReason === "successes"
                                      ? "Successful item target reached."
                                      : result.stopReason === "actions"
                                        ? "Simulation action limit reached."
                                        : "Simulation target not yet reached."}{" "}
                                {result.simulationLimit.kind === "successes"
                                    ? result.successes.toLocaleString()
                                    : (
                                          (result.totalSteps ?? 0) + (result.unfinished?.steps ?? 0)
                                      ).toLocaleString()}{" "}
                                / {result.simulationLimit.count.toLocaleString()}{" "}
                                {result.simulationLimit.kind === "successes"
                                    ? "successful items"
                                    : "simulation actions"}
                            </p>
                        )}
                        <p>
                            Rates and averages describe completed trials. Use a fixed trial count
                            for the 95% sampling interval; stopping based on results changes its
                            coverage.
                        </p>
                    </div>
                ) : null}
                <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
                    {[
                        ["Average attempts", result.attempts],
                        ["Attempts for 95% chance", result.attempts95],
                        ["Average cost (chaos)", result.meanCost],
                        ["Expected cost / success", result.costPerSuccess],
                        ...(result.baseItems === undefined
                            ? []
                            : [["Starting items / attempt", result.baseItems / attempts]]),
                        ...(result.baseSpending === undefined
                            ? []
                            : [
                                  [
                                      "Starting item cost / attempt (chaos)",
                                      result.baseSpending / attempts,
                                  ],
                              ]),
                        [
                            "Average crafts / attempt",
                            exact
                                ? result.totalActions
                                : result.trials
                                  ? result.totalActions / result.trials
                                  : null,
                        ],
                    ].map(([label, value]) => (
                        <div key={String(label)}>
                            <dt className="text-xs text-muted-foreground">{label}</dt>
                            <dd className="mt-1 font-mono">{number(value as number | null)}</dd>
                        </div>
                    ))}
                </dl>
                {!exact && !result.successes ? (
                    <p className="mt-4 text-xs text-muted-foreground">
                        No successes observed. This does not establish that the target is
                        impossible; increase the sample size.
                    </p>
                ) : null}
                {result.unpriced.length ? (
                    <p className="mt-4 text-xs text-muted-foreground">
                        Enter prices for all consumed currencies to calculate costs. Missing prices
                        are not treated as zero.
                    </p>
                ) : null}
                {result.baseItems !== undefined && result.baseSpending === undefined ? (
                    <p className="mt-4 text-xs text-muted-foreground">
                        Starting item costs are excluded. Enter a starting item price to include
                        them in process costs.
                    </p>
                ) : null}
                {result.timeouts ? (
                    <p className="mt-4 text-sm text-amber-600">
                        {exact
                            ? `${number(result.timeouts * 100)}% of`
                            : result.timeouts.toLocaleString()}{" "}
                        trials reached the step limit and count as failures.
                    </p>
                ) : null}
                {Object.entries(result.errors).map(([message, count]) => (
                    <p key={message} className="mt-2 text-sm text-destructive">
                        {exact
                            ? `${number(count * 100)}% of trials failed`
                            : `${count.toLocaleString()} failed trials`}
                        : {message}
                    </p>
                ))}
            </div>
            {result.successCosts ? (
                <section
                    className="rounded-lg border border-border bg-card p-4"
                    aria-label="Successful trial costs"
                >
                    <h3 className="text-sm font-medium">Successful trial costs</h3>
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <dt className="text-xs text-muted-foreground">
                                Cheapest craft (chaos)
                            </dt>
                            <dd className="mt-1 font-mono">
                                {number(result.successCosts.cheapest)}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs text-muted-foreground">
                                Costliest craft (chaos)
                            </dt>
                            <dd className="mt-1 font-mono">
                                {number(result.successCosts.costliest)}
                            </dd>
                        </div>
                    </dl>
                    <p className="mt-3 text-xs text-muted-foreground">
                        Observed across every successful trial, including unstored items and costs
                        of restarts within that trial. Separate failed and unfinished trials are
                        excluded. This is an observed range, not a prediction of future costs.
                    </p>
                    {!result.successes ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                            No successful trial costs to compare.
                        </p>
                    ) : result.successCosts.unpriced ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                            {result.successCosts.unpriced.toLocaleString()} successful trials have
                            missing currency prices. The full cost range is unknown.
                        </p>
                    ) : null}
                    {result.baseItems !== undefined && result.baseSpending === undefined ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                            Starting item costs are excluded because no starting item price was
                            entered.
                        </p>
                    ) : null}
                </section>
            ) : null}
            {result.unfinished ? (
                <section
                    className="space-y-3 rounded-lg border border-border bg-card p-4"
                    aria-label="Unfinished trial"
                >
                    <h3 className="text-sm font-medium">Unfinished trial</h3>
                    <p className="text-xs text-muted-foreground">
                        Stopped after {result.unfinished.actions.toLocaleString()} craft actions and{" "}
                        {result.unfinished.steps.toLocaleString()} steps, using{" "}
                        {result.unfinished.baseItems.toLocaleString()} starting items. This item,
                        its currency and its routes are excluded from completed-trial statistics. It
                        does not count as a failed trial.
                    </p>
                    <dl className="space-y-2 text-sm" aria-label="Unfinished trial spending">
                        {Object.entries(result.unfinished.spending).map(([id, amount]) => (
                            <div key={id} className="flex justify-between gap-3">
                                <dt>{engine.costName(id)}</dt>
                                <dd className="font-mono">{number(amount)}</dd>
                            </div>
                        ))}
                    </dl>
                    <details>
                        <summary className="cursor-pointer text-sm">
                            Inspect unfinished item
                        </summary>
                        <div className="mt-3">
                            <ItemCard engine={engine} item={result.unfinished.item} />
                        </div>
                        <Button
                            className="mt-2"
                            variant="outline"
                            size="sm"
                            onClick={() => onUse(result.unfinished!.item)}
                        >
                            Use unfinished item
                        </Button>
                    </details>
                </section>
            ) : null}
            <details className="rounded-lg border border-border bg-card p-4">
                <summary className="cursor-pointer text-sm font-medium">
                    {exact
                        ? "Expected currency per attempt"
                        : result.unfinished
                          ? "Currency consumed by completed trials"
                          : "Total currency consumed"}
                </summary>
                <dl className="mt-3 space-y-2 text-sm">
                    {Object.entries(result.spending).map(([id, amount]) => (
                        <div key={id} className="flex justify-between gap-3">
                            <dt>{engine.costName(id)}</dt>
                            <dd className="font-mono">{number(amount)}</dd>
                        </div>
                    ))}
                </dl>
            </details>
            {Object.keys(result.affixes).length ? (
                <details className="rounded-lg border border-border bg-card p-4">
                    <summary className="cursor-pointer text-sm font-medium">
                        Most frequent modifiers
                    </summary>
                    <ol className="mt-3 space-y-3">
                        {Object.entries(result.affixes)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 20)
                            .map(([id, count]) => (
                                <li key={id} className="text-sm">
                                    <div className="flex justify-between gap-3">
                                        <span>{modText(engine.mod(id))}</span>
                                        <span className="font-mono">
                                            {((count / result.trials) * 100).toFixed(1)}%
                                        </span>
                                    </div>
                                    <div className="mt-1 h-1 rounded bg-muted">
                                        <div
                                            className="h-1 rounded bg-primary"
                                            style={{ width: `${(count / result.trials) * 100}%` }}
                                        />
                                    </div>
                                </li>
                            ))}
                    </ol>
                </details>
            ) : null}
            {result.successDistribution ? (
                <SuccessDistribution
                    engine={engine}
                    rows={result.successDistribution}
                    successes={result.successes}
                />
            ) : null}
            {sample ? (
                <details className="rounded-lg border border-border bg-card p-4">
                    <summary className="cursor-pointer text-sm font-medium">
                        Sample outcomes
                    </summary>
                    <div className="mt-4 space-y-5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={!index}
                                onClick={() => setSampleIndex(index - 1)}
                            >
                                Previous outcome
                            </Button>
                            <span className="text-xs" aria-live="polite">
                                Item {index + 1} of {result.samples.length}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={index >= result.samples.length - 1}
                                onClick={() => setSampleIndex(index + 1)}
                            >
                                Next outcome
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {result.sampleStorage?.mode === "successes"
                                ? "First successful items"
                                : result.sampleStorage?.mode === "all"
                                  ? "First completed outcomes"
                                  : "Preview includes the first success when available"}
                            . Stored items are examples, not a random sample of all outcomes.
                        </p>
                        <div key={sample.trial}>
                            <p className="mb-2 text-xs text-muted-foreground">
                                Trial {sample.trial.toLocaleString()} ·{" "}
                                {sample.success ? "Target met" : "Target not met"}
                            </p>
                            {sample.cost ? (
                                <section
                                    className="mb-3 space-y-2 text-xs"
                                    aria-label="Stored outcome cost"
                                >
                                    <p className="font-medium">
                                        Trial cost (chaos):{" "}
                                        <span className="font-mono">
                                            {number(sample.cost.total)}
                                        </span>
                                    </p>
                                    <dl className="space-y-1">
                                        {sample.cost.baseItems !== undefined ? (
                                            <div className="flex justify-between gap-3">
                                                <dt>Starting items</dt>
                                                <dd className="font-mono">
                                                    {number(sample.cost.baseItems)}
                                                </dd>
                                            </div>
                                        ) : null}
                                        {sample.cost.baseSpending !== undefined ? (
                                            <div className="flex justify-between gap-3">
                                                <dt>Starting item cost (chaos)</dt>
                                                <dd className="font-mono">
                                                    {number(sample.cost.baseSpending)}
                                                </dd>
                                            </div>
                                        ) : null}
                                        {Object.entries(sample.cost.spending).map(
                                            ([id, amount]) => (
                                                <div
                                                    key={id}
                                                    className="flex justify-between gap-3"
                                                >
                                                    <dt>{engine.costName(id)}</dt>
                                                    <dd className="font-mono">{number(amount)}</dd>
                                                </div>
                                            ),
                                        )}
                                    </dl>
                                    {sample.cost.unpriced.length ? (
                                        <p className="text-muted-foreground">
                                            Missing prices:{" "}
                                            {sample.cost.unpriced
                                                .map((id) => engine.costName(id))
                                                .join(", ")}
                                            . Quantities are retained; the total is unknown.
                                        </p>
                                    ) : null}
                                    {sample.cost.baseItems !== undefined &&
                                    sample.cost.baseSpending === undefined ? (
                                        <p className="text-muted-foreground">
                                            Starting item costs are excluded.
                                        </p>
                                    ) : null}
                                </section>
                            ) : null}
                            <ItemCard engine={engine} item={sample.item} />
                            <Button
                                className="mt-2"
                                variant="outline"
                                size="sm"
                                onClick={() => onUse(sample.item)}
                            >
                                Use this item
                            </Button>
                        </div>
                    </div>
                </details>
            ) : result.sampleStorage ? (
                <p className="text-xs text-muted-foreground">
                    {result.sampleStorage.mode === "none"
                        ? "Outcome storage is disabled."
                        : "No matching outcomes were stored."}
                </p>
            ) : null}
        </section>
    );
}
