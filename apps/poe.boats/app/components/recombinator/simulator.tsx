import { ArrowDown, ArrowRight, FlaskConical, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CatalogItemEditor } from "~/components/recombinator/catalog-item-editor";
import { CraftingTree } from "~/components/recombinator/crafting-tree";
import {
    ModifierFlags,
    ModifierIcons,
    ModifierLegend,
} from "~/components/recombinator/modifier-icons";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
    calculateRecombinatorPlan,
    matchesTarget,
    outcomeKey,
    RECOMBINATOR_GUIDE_URL,
    RECOMBINATOR_TABLE_URL,
    type RecombinatorStepResult,
    summarizeCounts,
} from "~/lib/recombinator";
import {
    exampleRecombinatorDraft,
    parseRecombinatorDraft,
    type RecombinatorDraft,
} from "~/lib/recombinator-plan";
import { draftAffixes, toggleDraftAffixFlag } from "~/lib/recombinator-tree";
import type { RecombinatorAffix, RecombinatorPlan } from "~/schemas/recombinator";
import type { RecombinatorCatalog } from "~/schemas/recombinator-catalog";

const examplePlan = parseRecombinatorDraft(exampleRecombinatorDraft);
const exampleResults = calculateRecombinatorPlan(examplePlan);
const selectClass =
    "h-9 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring";
const textareaClass =
    "min-h-24 w-full resize-y rounded-lg border border-input bg-background p-2 text-sm leading-6 placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring";
const pageSize = 20;

function percent(value: number) {
    if (value > 0 && value < 0.000001) return `${(value * 100).toExponential(2)}%`;
    return `${(value * 100).toLocaleString("en-US", { maximumFractionDigits: 4 })}%`;
}

function AffixList({ affixes, side }: { affixes: RecombinatorAffix[]; side: "prefix" | "suffix" }) {
    return affixes.length ? (
        <ul className={side === "prefix" ? "text-mod-prefix" : "text-mod-suffix"}>
            {affixes.map((affix) => (
                <li key={affix.id} className="flex items-center gap-1">
                    <ModifierIcons affix={affix} />
                    <span>{affix.label ?? affix.id}</span>
                </li>
            ))}
        </ul>
    ) : (
        <span className="text-muted-foreground">None</span>
    );
}

type Calculation = { plan: RecombinatorPlan; results: RecombinatorStepResult[] };

export function RecombinatorSimulator({ catalog }: { catalog?: RecombinatorCatalog }) {
    const [draft, setDraft] = useState(exampleRecombinatorDraft);
    const [calculation, setCalculation] = useState<Calculation | null>({
        plan: examplePlan,
        results: exampleResults,
    });
    const [selectedStep, setSelectedStep] = useState("finish");
    const [required, setRequired] = useState<string[]>(["T1 life", "T1 armour", "T1 evasion"]);
    const [exact, setExact] = useState(false);
    const [matchingOnly, setMatchingOnly] = useState(false);
    const [page, setPage] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const worker = useRef<Worker | null>(null);

    useEffect(() => () => worker.current?.terminate(), []);

    function edit(next: RecombinatorDraft) {
        worker.current?.terminate();
        worker.current = null;
        setBusy(false);
        setDraft(next);
        setCalculation(null);
        setError(null);
        setPage(0);
    }

    function calculate() {
        setError(null);
        let plan: RecombinatorPlan;
        try {
            plan = parseRecombinatorDraft(draft, catalog);
        } catch (caught) {
            const message = caught instanceof Error ? caught.message : "Check your inputs.";
            setError(message);
            return;
        }
        setBusy(true);
        try {
            const nextWorker = new Worker(
                new URL("../../lib/recombinator.worker.ts", import.meta.url),
                { type: "module" },
            );
            worker.current = nextWorker;
            nextWorker.onmessage = (
                event: MessageEvent<{ results?: RecombinatorStepResult[]; error?: string }>,
            ) => {
                if (event.data.results) {
                    setCalculation({ plan, results: event.data.results });
                    setSelectedStep(plan.steps.at(-1)!.id);
                    const available = new Set(
                        plan.items.flatMap(({ item }) =>
                            [...item.prefixes, ...item.suffixes].map((affix) => affix.id),
                        ),
                    );
                    setRequired((previous) => previous.filter((id) => available.has(id)));
                    setPage(0);
                } else setError(event.data.error ?? "Calculation failed.");
                setBusy(false);
                nextWorker.terminate();
                worker.current = null;
            };
            nextWorker.onerror = () => {
                setError("Could not run the calculator. Try calculating again.");
                setBusy(false);
                nextWorker.terminate();
                worker.current = null;
            };
            nextWorker.postMessage(plan);
        } catch {
            worker.current?.terminate();
            worker.current = null;
            setBusy(false);
            setError("Could not start the calculator. Try reloading this page.");
        }
    }

    const outcomes = calculation?.results.find((step) => step.id === selectedStep)?.outcomes ?? [];
    const counts = useMemo(() => summarizeCounts(outcomes), [outcomes]);
    const modifiers = useMemo(() => {
        const unique = new Map<string, { affix: RecombinatorAffix; side: string }>();
        for (const { item } of calculation?.plan.items ?? []) {
            for (const side of ["prefixes", "suffixes"] as const) {
                for (const affix of item[side]) unique.set(affix.id, { affix, side });
            }
        }
        return [...unique.values()];
    }, [calculation]);
    const matching = outcomes.filter(({ item }) => matchesTarget(item, required, exact));
    const targetChance = matching.reduce((sum, outcome) => sum + outcome.probability, 0);
    const visible = matchingOnly ? matching : outcomes;
    const pages = Math.max(1, Math.ceil(visible.length / pageSize));
    const displayedPage = Math.min(page, pages - 1);
    const sourceName = (id: string) =>
        [...draft.items, ...draft.steps].find((source) => source.id === id)?.name ?? id;
    const inUse = (id: string) => draft.steps.some((step) => step.left === id || step.right === id);

    return (
        <div className="space-y-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Crafting laboratory · PoE 1 · 3.26 model
                    </p>
                    <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                        Recombinator simulator
                    </h1>
                    <p className="text-muted-foreground">
                        Build your items, connect crafting steps, and calculate every possible
                        modifier outcome through the whole plan.
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={() => {
                        edit(exampleRecombinatorDraft);
                        setCalculation({ plan: examplePlan, results: exampleResults });
                        setSelectedStep("finish");
                        setRequired(["T1 life", "T1 armour", "T1 evasion"]);
                        setExact(false);
                        setMatchingOnly(false);
                    }}
                >
                    <RotateCcw />
                    Load example
                </Button>
            </div>

            <div className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm leading-6">
                <strong>Estimated odds.</strong> Uses the guide’s measured affix-count table and
                equal selection weight per modifier copy. Actual modifier weights are uncertain. All
                items must have compatible bases and transferable modifiers.
                <details className="mt-1">
                    <summary className="w-fit cursor-pointer font-medium underline underline-offset-4">
                        Rules, scope and sources
                    </summary>
                    <div className="mt-3 space-y-2 text-muted-foreground">
                        <p>
                            Duplicate copies increase the input count and selection chance, but only
                            one modifier per group can survive. Prefixes and suffixes roll
                            independently, except isolated 1p + 1s: the three non-empty outcomes
                            each have a 1/3 chance.
                        </p>
                        <p>
                            The published 3- and 4-input columns total 101%; each is normalized to
                            100%. Small differences from the guide’s diagrams are expected.
                            Calculations enumerate every outcome under this model; they are not
                            random samples.
                        </p>
                        <p>
                            At most one exclusive modifier is supported across each pair, including
                            duplicate copies. Fractured mods, base-specific transfer restrictions,
                            output base and item level, new modifiers, and gold/dust costs are
                            outside this model. Use distinct labels for different tiers and a shared
                            group for conflicting mods.
                        </p>
                        <p>
                            Each reference to an earlier step means a fresh, independent run of that
                            recipe. All its outcomes continue, including failures. Reusing a step
                            requires making another item; this does not model consuming the same
                            physical item twice or retrying until success.
                        </p>
                        <p>
                            <a
                                className="underline underline-offset-4"
                                href={RECOMBINATOR_GUIDE_URL}
                                target="_blank"
                                rel="noreferrer"
                            >
                                Read the linked guide
                            </a>
                            {" · "}
                            <a
                                className="underline underline-offset-4"
                                href={RECOMBINATOR_TABLE_URL}
                                target="_blank"
                                rel="noreferrer"
                            >
                                Original probability table
                            </a>
                        </p>
                    </div>
                </details>
            </div>

            <CraftingTree
                draft={draft}
                results={calculation?.results}
                selectedStep={selectedStep}
                required={required}
                exact={exact}
                onEdit={edit}
                onSelect={(id, kind) => {
                    if (kind === "step") {
                        setSelectedStep(id);
                        setPage(0);
                    } else {
                        document
                            .getElementById(`recombinator-item-${id}`)
                            ?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                }}
            />

            <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                <div className="min-w-0 space-y-8">
                    <section aria-labelledby="items-heading" className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                            <h2 id="items-heading" className="text-lg font-semibold">
                                01 <span className="ml-2">Starting items</span>
                            </h2>
                            <Button
                                variant="outline"
                                disabled={draft.items.length >= 12}
                                onClick={() =>
                                    edit({
                                        ...draft,
                                        items: [
                                            ...draft.items,
                                            {
                                                id: crypto.randomUUID(),
                                                name: `Item ${draft.items.length + 1}`,
                                                prefixes: "",
                                                suffixes: "",
                                            },
                                        ],
                                    })
                                }
                            >
                                <Plus />
                                Add item
                            </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Choose a base and item level to select its natural mods, or enter custom
                            modifiers. Each item supports up to 3 prefixes and 3 suffixes in total.
                        </p>
                        {catalog ? (
                            <p className="text-xs text-muted-foreground">
                                PoE 1 client {catalog.patch} ·{" "}
                                {catalog.bases.length.toLocaleString()} equipment bases. The catalog
                                covers natural, uninfluenced mods. Spawn weights filter eligibility;
                                recombination uses the probability model above.
                            </p>
                        ) : null}
                        <ModifierLegend />
                        <p className="text-xs text-muted-foreground">
                            NNN markers are annotations. Odds assume these modifiers are eligible on
                            both bases; base-transfer restrictions are not simulated.
                        </p>
                        <details className="text-sm text-muted-foreground">
                            <summary className="cursor-pointer">
                                Mod groups and modifier flags
                            </summary>
                            <p className="mt-2">
                                Use <code>T1 life | life</code> and <code>T2 life | life</code> to
                                share a mod group. Mark an exclusive modifier with <code>*</code>,
                                for example <code>*Essence reservation</code>, or an NNN modifier
                                with <code>!</code>, for example <code>!T1 spell suppression</code>.
                                Labels and groups are case-sensitive.
                            </p>
                        </details>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {draft.items.map((entry, index) => (
                                <article
                                    key={entry.id}
                                    id={`recombinator-item-${entry.id}`}
                                    className="min-w-0 rounded-xl border border-border bg-card p-4"
                                >
                                    <div className="mb-4 flex items-center gap-2">
                                        <span className="text-xs font-mono text-muted-foreground">
                                            {String(index + 1).padStart(2, "0")}
                                        </span>
                                        <Input
                                            aria-label={`Item ${index + 1} name`}
                                            value={entry.name}
                                            maxLength={80}
                                            onChange={(event) =>
                                                edit({
                                                    ...draft,
                                                    items: draft.items.map((item) =>
                                                        item.id === entry.id
                                                            ? { ...item, name: event.target.value }
                                                            : item,
                                                    ),
                                                })
                                            }
                                        />
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label={`Remove item ${index + 1}`}
                                            disabled={inUse(entry.id) || draft.items.length <= 2}
                                            title={
                                                inUse(entry.id)
                                                    ? "Used by a crafting step"
                                                    : "Remove item"
                                            }
                                            onClick={() =>
                                                edit({
                                                    ...draft,
                                                    items: draft.items.filter(
                                                        (item) => item.id !== entry.id,
                                                    ),
                                                })
                                            }
                                        >
                                            <Trash2 />
                                        </Button>
                                    </div>
                                    {catalog ? (
                                        <CatalogItemEditor
                                            entry={entry}
                                            index={index}
                                            catalog={catalog}
                                            knownAffixes={draft.items.flatMap((item) => [
                                                ...(item.catalog?.prefixes ?? []),
                                                ...(item.catalog?.suffixes ?? []),
                                            ])}
                                            onChange={(next) =>
                                                edit({
                                                    ...draft,
                                                    items: draft.items.map((item) =>
                                                        item.id === entry.id ? next : item,
                                                    ),
                                                })
                                            }
                                            onToggle={(id, flag, enabled) =>
                                                edit(toggleDraftAffixFlag(draft, id, flag, enabled))
                                            }
                                        />
                                    ) : null}
                                    <details open={!entry.catalog}>
                                        <summary className="mb-3 cursor-pointer text-sm text-muted-foreground">
                                            Custom modifiers (
                                            {draftAffixes(entry.prefixes).length +
                                                draftAffixes(entry.suffixes).length}
                                            )
                                        </summary>
                                        <div className="space-y-3">
                                            {(["prefixes", "suffixes"] as const).map((side) => (
                                                <div key={side} className="space-y-1.5">
                                                    <label className="block space-y-1.5">
                                                        <span
                                                            className={`text-xs font-semibold uppercase tracking-wider ${side === "prefixes" ? "text-mod-prefix" : "text-mod-suffix"}`}
                                                        >
                                                            {side}
                                                        </span>
                                                        <textarea
                                                            aria-label={`Item ${index + 1} ${side}`}
                                                            className={textareaClass}
                                                            value={entry[side]}
                                                            maxLength={500}
                                                            spellCheck={false}
                                                            placeholder={
                                                                side === "prefixes"
                                                                    ? "T1 life\nT1 armour"
                                                                    : "T1 fire resistance"
                                                            }
                                                            onChange={(event) =>
                                                                edit({
                                                                    ...draft,
                                                                    items: draft.items.map(
                                                                        (item) =>
                                                                            item.id === entry.id
                                                                                ? {
                                                                                      ...item,
                                                                                      [side]: event
                                                                                          .target
                                                                                          .value,
                                                                                  }
                                                                                : item,
                                                                    ),
                                                                })
                                                            }
                                                        />
                                                    </label>
                                                    <ModifierFlags
                                                        text={entry[side]}
                                                        onToggle={(id, flag, enabled) =>
                                                            edit(
                                                                toggleDraftAffixFlag(
                                                                    draft,
                                                                    id,
                                                                    flag,
                                                                    enabled,
                                                                ),
                                                            )
                                                        }
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </details>
                                </article>
                            ))}
                        </div>
                    </section>

                    <section aria-labelledby="steps-heading" className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                            <h2 id="steps-heading" className="text-lg font-semibold">
                                02 <span className="ml-2">Crafting steps</span>
                            </h2>
                            <Button
                                variant="outline"
                                disabled={draft.steps.length >= 8}
                                onClick={() =>
                                    edit({
                                        ...draft,
                                        steps: [
                                            ...draft.steps,
                                            {
                                                id: crypto.randomUUID(),
                                                name: `Step ${draft.steps.length + 1}`,
                                                left: draft.steps.at(-1)?.id ?? draft.items[0].id,
                                                right: draft.items[1].id,
                                            },
                                        ],
                                    })
                                }
                            >
                                <Plus />
                                Add step
                            </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            A previous step carries every outcome forward. Each reference runs that
                            recipe independently, with fresh items.
                        </p>
                        <ol className="space-y-3">
                            {draft.steps.map((step, index) => (
                                <li
                                    key={step.id}
                                    className="rounded-xl border border-border bg-card p-4"
                                >
                                    <div className="mb-3 flex items-center gap-3">
                                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-xs">
                                            {index + 1}
                                        </span>
                                        <Input
                                            aria-label={`Step ${index + 1} name`}
                                            value={step.name}
                                            maxLength={80}
                                            onChange={(event) =>
                                                edit({
                                                    ...draft,
                                                    steps: draft.steps.map((entry) =>
                                                        entry.id === step.id
                                                            ? { ...entry, name: event.target.value }
                                                            : entry,
                                                    ),
                                                })
                                            }
                                        />
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label={`Remove step ${index + 1}`}
                                            disabled={inUse(step.id) || draft.steps.length <= 1}
                                            title={
                                                inUse(step.id)
                                                    ? "Used by a later step"
                                                    : "Remove step"
                                            }
                                            onClick={() =>
                                                edit({
                                                    ...draft,
                                                    steps: draft.steps.filter(
                                                        (entry) => entry.id !== step.id,
                                                    ),
                                                })
                                            }
                                        >
                                            <Trash2 />
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
                                        {(["left", "right"] as const).map((side) => (
                                            <label
                                                key={side}
                                                className={`min-w-0 space-y-1 ${side === "right" ? "col-start-3" : ""}`}
                                            >
                                                <span className="text-xs text-muted-foreground">
                                                    Input {side === "left" ? "A" : "B"}
                                                </span>
                                                <select
                                                    className={selectClass}
                                                    aria-label={`Step ${index + 1} input ${side === "left" ? "A" : "B"}`}
                                                    value={step[side]}
                                                    onChange={(event) =>
                                                        edit({
                                                            ...draft,
                                                            steps: draft.steps.map((entry) =>
                                                                entry.id === step.id
                                                                    ? {
                                                                          ...entry,
                                                                          [side]: event.target
                                                                              .value,
                                                                      }
                                                                    : entry,
                                                            ),
                                                        })
                                                    }
                                                >
                                                    <optgroup label="Starting items">
                                                        {draft.items.map((item) => (
                                                            <option key={item.id} value={item.id}>
                                                                {item.name || "Unnamed item"}
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                    {index > 0 ? (
                                                        <optgroup label="Earlier results · independent run">
                                                            {draft.steps
                                                                .slice(0, index)
                                                                .map((entry, stepIndex) => (
                                                                    <option
                                                                        key={entry.id}
                                                                        value={entry.id}
                                                                    >
                                                                        Step {stepIndex + 1}:{" "}
                                                                        {entry.name ||
                                                                            "Unnamed step"}
                                                                    </option>
                                                                ))}
                                                        </optgroup>
                                                    ) : null}
                                                </select>
                                            </label>
                                        ))}
                                        <Plus
                                            aria-hidden="true"
                                            className="col-start-2 row-start-1 mb-2 size-4 text-muted-foreground"
                                        />
                                    </div>
                                    <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                                        <ArrowDown className="size-3" />
                                        Full outcome distribution →{" "}
                                        {step.name || `Step ${index + 1}`}
                                    </p>
                                </li>
                            ))}
                        </ol>
                        {error ? (
                            <div
                                role="alert"
                                className="whitespace-pre-wrap break-words rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                            >
                                {error}
                            </div>
                        ) : null}
                        <Button size="lg" className="w-full" disabled={busy} onClick={calculate}>
                            <FlaskConical />
                            {busy ? "Calculating all outcomes…" : "Calculate plan"}
                            <ArrowRight />
                        </Button>
                    </section>
                </div>

                <section
                    aria-labelledby="outcomes-heading"
                    className="min-w-0 space-y-5 xl:sticky xl:top-20"
                    aria-busy={busy}
                >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 id="outcomes-heading" className="text-lg font-semibold">
                            03 <span className="ml-2">Outcome odds</span>
                        </h2>
                        {calculation ? (
                            <select
                                aria-label="View step results"
                                className={`${selectClass} sm:max-w-64`}
                                value={selectedStep}
                                onChange={(event) => {
                                    setSelectedStep(event.target.value);
                                    setPage(0);
                                }}
                            >
                                {calculation.plan.steps.map((step, index) => (
                                    <option key={step.id} value={step.id}>
                                        Step {index + 1}: {step.name}
                                    </option>
                                ))}
                            </select>
                        ) : null}
                    </div>
                    {!calculation ? (
                        <div
                            role="status"
                            className="rounded-xl border border-dashed border-border px-6 py-16 text-center text-muted-foreground"
                        >
                            <FlaskConical className="mx-auto mb-4 size-8" />
                            <p>
                                {busy
                                    ? "Calculating your crafting plan…"
                                    : "Your plan has changed. Calculate to see updated odds."}
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="rounded-xl border border-border bg-card p-5">
                                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Target modifiers
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {modifiers.map(({ affix, side }) => (
                                        <label
                                            key={affix.id}
                                            className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs ${required.includes(affix.id) ? "border-foreground/30 bg-muted" : "border-border"}`}
                                        >
                                            <input
                                                type="checkbox"
                                                className="accent-foreground"
                                                aria-label={affix.label ?? affix.id}
                                                checked={required.includes(affix.id)}
                                                onChange={(event) => {
                                                    setRequired((previous) =>
                                                        event.target.checked
                                                            ? [...previous, affix.id]
                                                            : previous.filter(
                                                                  (id) => id !== affix.id,
                                                              ),
                                                    );
                                                    setPage(0);
                                                }}
                                            />
                                            <span
                                                className={
                                                    side === "prefixes"
                                                        ? "text-mod-prefix"
                                                        : "text-mod-suffix"
                                                }
                                            >
                                                <ModifierIcons affix={affix} />{" "}
                                                {affix.label ?? affix.id}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                                <label className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                                    <input
                                        type="checkbox"
                                        checked={exact}
                                        onChange={(event) => {
                                            setExact(event.target.checked);
                                            setPage(0);
                                        }}
                                    />
                                    Exact match (no additional modifiers)
                                </label>
                                <div className="mt-5 flex items-end justify-between gap-3 border-t border-border pt-4">
                                    <div>
                                        <p className="text-sm text-muted-foreground">
                                            {required.length === 0
                                                ? exact
                                                    ? "No-modifier outcome"
                                                    : "All outcomes"
                                                : "Target chance through this step"}
                                        </p>
                                        <p
                                            className="mt-1 font-mono text-4xl font-semibold tracking-tight"
                                            data-testid="target-chance"
                                        >
                                            {percent(targetChance)}
                                        </p>
                                    </div>
                                    <p className="text-right text-xs text-muted-foreground">
                                        {matching.length} matching outcomes
                                        <br />
                                        Includes earlier failures
                                    </p>
                                </div>
                            </div>
                            <div className="rounded-xl border border-border p-4">
                                <h3 className="mb-3 text-sm font-medium">
                                    Affix-count distribution
                                </h3>
                                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                                    {counts.map((count) => (
                                        <div
                                            key={`${count.prefixes}/${count.suffixes}`}
                                            className="rounded-md bg-muted/60 px-2 py-2 text-center"
                                        >
                                            <p className="text-xs text-muted-foreground">
                                                <span className="text-mod-prefix">
                                                    {count.prefixes}p
                                                </span>{" "}
                                                /{" "}
                                                <span className="text-mod-suffix">
                                                    {count.suffixes}s
                                                </span>
                                            </p>
                                            <p className="mt-1 font-mono text-xs">
                                                {percent(count.probability)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="overflow-hidden rounded-xl border border-border">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3 text-xs">
                                    <span className="font-medium">
                                        {sourceName(selectedStep)} · {outcomes.length} outcomes
                                    </span>
                                    <label className="flex cursor-pointer items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={matchingOnly}
                                            onChange={(event) => {
                                                setMatchingOnly(event.target.checked);
                                                setPage(0);
                                            }}
                                        />
                                        Matching only
                                    </label>
                                </div>
                                <div className="max-h-[32rem] overflow-auto">
                                    <table className="w-full table-fixed text-left text-xs leading-5">
                                        <caption className="sr-only">
                                            Modifier outcomes and unconditional probabilities for{" "}
                                            {sourceName(selectedStep)}
                                        </caption>
                                        <thead className="sticky top-0 bg-muted">
                                            <tr>
                                                <th className="px-3 py-2 font-medium">Prefixes</th>
                                                <th className="px-3 py-2 font-medium">Suffixes</th>
                                                <th className="w-28 px-3 py-2 text-right font-medium">
                                                    Probability
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {visible
                                                .slice(
                                                    displayedPage * pageSize,
                                                    (displayedPage + 1) * pageSize,
                                                )
                                                .map((outcome) => (
                                                    <tr
                                                        key={outcomeKey(outcome.item)}
                                                        className={`border-t border-border align-top ${required.length && matchesTarget(outcome.item, required, exact) ? "bg-success/5" : ""}`}
                                                    >
                                                        <td className="break-words px-3 py-3">
                                                            <AffixList
                                                                affixes={outcome.item.prefixes}
                                                                side="prefix"
                                                            />
                                                        </td>
                                                        <td className="break-words px-3 py-3">
                                                            <AffixList
                                                                affixes={outcome.item.suffixes}
                                                                side="suffix"
                                                            />
                                                        </td>
                                                        <td className="px-3 py-3 text-right font-mono tabular-nums">
                                                            {percent(outcome.probability)}
                                                        </td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                    {visible.length === 0 ? (
                                        <p className="p-6 text-center text-sm text-muted-foreground">
                                            No outcomes match these target modifiers.
                                        </p>
                                    ) : null}
                                </div>
                                <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={displayedPage === 0}
                                        onClick={() => setPage(displayedPage - 1)}
                                    >
                                        Previous
                                    </Button>
                                    <span>
                                        Page {displayedPage + 1} of {pages}
                                    </span>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={displayedPage + 1 >= pages}
                                        onClick={() => setPage(displayedPage + 1)}
                                    >
                                        Next
                                    </Button>
                                </div>
                            </div>
                            <p className="text-xs leading-5 text-muted-foreground">
                                Probabilities are per complete recipe attempt, without retries or
                                discarding failures. Target filtering does not renormalize the odds.
                                Displayed percentages are rounded.
                            </p>
                        </>
                    )}
                </section>
            </div>
        </div>
    );
}
