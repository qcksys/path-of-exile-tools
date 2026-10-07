import { ArrowDown, ArrowRight, FlaskConical, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CatalogItemEditor } from "~/components/recombinator/catalog-item-editor";
import { CraftingTree } from "~/components/recombinator/crafting-tree";
import {
    ModifierFlags,
    ModifierIcons,
    ModifierLegend,
} from "~/components/recombinator/modifier-icons";
import { PreparationEditor } from "~/components/recombinator/preparation-editor";
import { SendInputToCrafting } from "~/components/recombinator/send-input-to-crafting";
import { SendPlanToCrafting } from "~/components/recombinator/send-plan-to-crafting";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "~/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "~/components/ui/empty";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/ui/table";
import { Textarea } from "~/components/ui/textarea";
import {
    calculateRecombinatorPlan,
    matchesTarget,
    outcomeKey,
    RECOMBINATOR_EXCLUSIVE_URL,
    RECOMBINATOR_GUIDE_URL,
    RECOMBINATOR_PREPARATION_URL,
    RECOMBINATOR_TABLE_URL,
    type RecombinatorStepResult,
    summarizeCounts,
} from "~/lib/recombinator";
import {
    catalogExampleDraft,
    draftSourceBases,
    emptyRecombinatorDraft,
    exampleRecombinatorDraft,
    parseRecombinatorDraft,
    type RecombinatorDraft,
} from "~/lib/recombinator-plan";
import { draftAffixes, toggleDraftAffixFlag } from "~/lib/recombinator-tree";
import { cn } from "~/lib/utils";
import type { RecombinatorAffix, RecombinatorPlan } from "~/schemas/recombinator";
import type { RecombinatorCatalog } from "~/schemas/recombinator-catalog";

const examplePlan = parseRecombinatorDraft(exampleRecombinatorDraft);
const exampleResults = calculateRecombinatorPlan(examplePlan);
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
    const [draft, setDraft] = useState(catalog ? emptyRecombinatorDraft : exampleRecombinatorDraft);
    const [calculation, setCalculation] = useState<Calculation | null>(
        catalog
            ? null
            : {
                  plan: examplePlan,
                  results: exampleResults,
              },
    );
    const [selectedStep, setSelectedStep] = useState(catalog ? "combine" : "finish");
    const [required, setRequired] = useState<string[]>(
        catalog ? [] : ["T1 life", "T1 armour", "T1 evasion"],
    );
    const [exact, setExact] = useState(false);
    const [matchingOnly, setMatchingOnly] = useState(false);
    const [requiredBase, setRequiredBase] = useState("any");
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
        setRequiredBase("any");
    }

    function calculate() {
        setError(null);
        let plan: RecombinatorPlan;
        try {
            if (
                catalog &&
                draft.items.some(
                    (item) => !item.catalog && !item.prefixes.trim() && !item.suffixes.trim(),
                )
            ) {
                throw new Error("Choose a base for each starting item before calculating.");
            }
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
        for (const step of calculation?.plan.steps ?? []) {
            for (const preparation of [step.leftPreparation, step.rightPreparation]) {
                if (preparation)
                    unique.set(preparation.affix.id, {
                        affix: preparation.affix,
                        side: preparation.side,
                    });
            }
        }
        return [...unique.values()];
    }, [calculation]);
    const matching = outcomes.filter(
        ({ item }) =>
            matchesTarget(item, required, exact) &&
            (requiredBase === "any" || item.base?.id === requiredBase),
    );
    const sourceBases = useMemo(() => draftSourceBases(draft), [draft]);
    const outputBases = [
        ...new Map(
            outcomes.flatMap(({ item }) => (item.base ? [[item.base.id, item.base] as const] : [])),
        ).values(),
    ];
    const targetChance = matching.reduce((sum, outcome) => sum + outcome.probability, 0);
    const visible = matchingOnly ? matching : outcomes;
    const pages = Math.max(1, Math.ceil(visible.length / pageSize));
    const displayedPage = Math.min(page, pages - 1);
    const sourceName = (id: string) =>
        [...draft.items, ...draft.steps].find((source) => source.id === id)?.name ?? id;
    const inUse = (id: string) => draft.steps.some((step) => step.left === id || step.right === id);

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex max-w-2xl flex-col gap-3">
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
                        const next = catalog
                            ? catalogExampleDraft(catalog)
                            : exampleRecombinatorDraft;
                        edit(next);
                        if (!catalog)
                            setCalculation({ plan: examplePlan, results: exampleResults });
                        setSelectedStep("finish");
                        setRequired(
                            catalog
                                ? [
                                      ...new Set(
                                          next.items.flatMap(
                                              (item) =>
                                                  item.catalog?.prefixes.map((affix) => affix.id) ??
                                                  [],
                                          ),
                                      ),
                                  ]
                                : ["T1 life", "T1 armour", "T1 evasion"],
                        );
                        setExact(false);
                        setMatchingOnly(false);
                    }}
                >
                    <RotateCcw data-icon="inline-start" />
                    Load example
                </Button>
                {catalog && (
                    <SendPlanToCrafting
                        catalog={catalog}
                        draft={draft}
                        finalStep={selectedStep}
                        required={required}
                        exact={exact}
                        requiredBase={requiredBase}
                    />
                )}
            </div>

            <Alert role="note">
                <AlertTitle>Estimated odds</AlertTitle>
                <AlertDescription>
                    <p>
                        Uses the guide’s measured affix-count table. Ordinary pools use equal weight
                        per modifier copy; exclusive crafts use a weight-based estimate. Base
                        restrictions are applied before choosing the surviving mods.
                    </p>
                    <Accordion>
                        <AccordionItem value="rules">
                            <AccordionTrigger>Rules, scope and sources</AccordionTrigger>
                            <AccordionContent>
                                <p>
                                    Duplicate copies increase the input count and selection chance,
                                    but only one modifier per group can survive. Prefixes and
                                    suffixes roll independently, except isolated 1p + 1s: the three
                                    non-empty outcomes each have a 1/3 chance.
                                </p>
                                <p>
                                    The published 3- and 4-input columns total 101%; each is
                                    normalized to 100%. Small differences from the guide’s diagrams
                                    are expected. Calculations enumerate every outcome under this
                                    model; they are not random samples.
                                </p>
                                <p>
                                    Bases have equal chances of surviving. Natural mods which cannot
                                    roll on the chosen base count toward the pool, then are
                                    excluded. Manually marking NNN excludes that mod on every base.
                                    Exclusive crafts use estimated odds: 50/50 affix order, natural
                                    spawn weights and an assumed craft weight of 1,000. Two one-mod
                                    magic inputs can each have a craft on their empty affix side; at
                                    most one exclusive mod can survive. Fractures, influences,
                                    output item level, new modifiers and gold/dust costs are outside
                                    this model. Use distinct labels for different tiers and a shared
                                    group for conflicting mods.
                                </p>
                                <p>
                                    Each reference to an earlier step means a fresh, independent run
                                    of that recipe. All its outcomes continue, including failures.
                                    Reusing a step requires making another item; this does not model
                                    consuming the same physical item twice or retrying until
                                    success.
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
                                    {" · "}
                                    <a
                                        className="underline underline-offset-4"
                                        href={RECOMBINATOR_PREPARATION_URL}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        Essence NNN preparation
                                    </a>
                                    {" · "}
                                    <a
                                        className="underline underline-offset-4"
                                        href={RECOMBINATOR_EXCLUSIVE_URL}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        Exclusive magic-pair research
                                    </a>
                                </p>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </AlertDescription>
            </Alert>

            <CraftingTree
                draft={draft}
                results={calculation?.results}
                selectedStep={selectedStep}
                required={required}
                exact={exact}
                requiredBase={requiredBase}
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
                <div className="flex min-w-0 flex-col gap-8">
                    <section aria-labelledby="items-heading" className="flex flex-col gap-4">
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
                                <Plus data-icon="inline-start" />
                                Add item
                            </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Search for an armour attribute type, weapon category, or specific base.
                            Choose an item level, then search its valid mods. Each item supports up
                            to 3 prefixes and 3 suffixes.
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
                            NNN modifiers contribute to the input mod count but cannot survive on
                            either base. Generated essence recipes apply base eligibility
                            automatically.
                        </p>
                        <Accordion>
                            <AccordionItem value="groups">
                                <AccordionTrigger>Mod groups and modifier flags</AccordionTrigger>
                                <AccordionContent>
                                    <p>
                                        Catalog mods include their actual groups and tiers. For
                                        custom mods, Use <code>T1 life | life</code> and{" "}
                                        <code>T2 life | life</code> to share a mod group. Mark an
                                        exclusive modifier with <code>*</code>, for example{" "}
                                        <code>*Essence reservation</code>, or an NNN modifier with{" "}
                                        <code>!</code>, for example{" "}
                                        <code>!T1 spell suppression</code>. Labels and groups are
                                        case-sensitive.
                                    </p>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {draft.items.map((entry, index) => (
                                <Card
                                    key={entry.id}
                                    id={`recombinator-item-${entry.id}`}
                                    className="min-w-0"
                                >
                                    <CardHeader>
                                        <CardTitle>Item {index + 1}</CardTitle>
                                        <CardDescription>
                                            {entry.catalog?.base.name ??
                                                "Choose a base to get started"}
                                        </CardDescription>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                aria-label={`Item ${index + 1} name`}
                                                value={entry.name}
                                                maxLength={80}
                                                onChange={(event) =>
                                                    edit({
                                                        ...draft,
                                                        items: draft.items.map((item) =>
                                                            item.id === entry.id
                                                                ? {
                                                                      ...item,
                                                                      name: event.target.value,
                                                                  }
                                                                : item,
                                                        ),
                                                    })
                                                }
                                            />
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                aria-label={`Remove item ${index + 1}`}
                                                disabled={
                                                    inUse(entry.id) || draft.items.length <= 2
                                                }
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
                                    </CardHeader>
                                    <CardContent>
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
                                        ) : null}
                                        <Accordion defaultValue={catalog ? [] : ["custom"]}>
                                            <AccordionItem value="custom">
                                                <AccordionTrigger>
                                                    Custom modifiers (
                                                    {draftAffixes(entry.prefixes).length +
                                                        draftAffixes(entry.suffixes).length}
                                                    )
                                                </AccordionTrigger>
                                                <AccordionContent>
                                                    <FieldGroup>
                                                        {(["prefixes", "suffixes"] as const).map(
                                                            (side) => (
                                                                <Field key={side}>
                                                                    <FieldLabel
                                                                        htmlFor={`${entry.id}-custom-${side}`}
                                                                    >
                                                                        {side}
                                                                    </FieldLabel>
                                                                    <Textarea
                                                                        id={`${entry.id}-custom-${side}`}
                                                                        aria-label={`Item ${index + 1} ${side}`}
                                                                        className="min-h-24"
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
                                                                                        item.id ===
                                                                                        entry.id
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
                                                                    <ModifierFlags
                                                                        text={entry[side]}
                                                                        onToggle={(
                                                                            id,
                                                                            flag,
                                                                            enabled,
                                                                        ) =>
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
                                                                </Field>
                                                            ),
                                                        )}
                                                    </FieldGroup>
                                                </AccordionContent>
                                            </AccordionItem>
                                        </Accordion>
                                        {catalog && (
                                            <SendInputToCrafting entry={entry} catalog={catalog} />
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </section>

                    <section aria-labelledby="steps-heading" className="flex flex-col gap-4">
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
                                <Plus data-icon="inline-start" />
                                Add step
                            </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            A previous step carries every outcome forward. Each reference runs that
                            recipe independently, with fresh items.
                        </p>
                        <ol className="flex flex-col gap-3">
                            {draft.steps.map((step, index) => (
                                <li key={step.id}>
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>Step {index + 1}</CardTitle>
                                            <div className="flex items-center gap-3">
                                                <Input
                                                    aria-label={`Step ${index + 1} name`}
                                                    value={step.name}
                                                    maxLength={80}
                                                    onChange={(event) =>
                                                        edit({
                                                            ...draft,
                                                            steps: draft.steps.map((entry) =>
                                                                entry.id === step.id
                                                                    ? {
                                                                          ...entry,
                                                                          name: event.target.value,
                                                                      }
                                                                    : entry,
                                                            ),
                                                        })
                                                    }
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={`Remove step ${index + 1}`}
                                                    disabled={
                                                        inUse(step.id) || draft.steps.length <= 1
                                                    }
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
                                        </CardHeader>
                                        <CardContent>
                                            <FieldGroup className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
                                                {(["left", "right"] as const).map((side) => (
                                                    <Field
                                                        key={side}
                                                        className={cn(
                                                            "min-w-0",
                                                            side === "right" && "col-start-3",
                                                        )}
                                                    >
                                                        <FieldLabel htmlFor={`${step.id}-${side}`}>
                                                            Input {side === "left" ? "A" : "B"}
                                                        </FieldLabel>
                                                        <Select
                                                            value={step[side]}
                                                            onValueChange={(value) =>
                                                                value &&
                                                                edit({
                                                                    ...draft,
                                                                    steps: draft.steps.map(
                                                                        (entry) =>
                                                                            entry.id === step.id
                                                                                ? {
                                                                                      ...entry,
                                                                                      [side]: value,
                                                                                  }
                                                                                : entry,
                                                                    ),
                                                                })
                                                            }
                                                        >
                                                            <SelectTrigger
                                                                id={`${step.id}-${side}`}
                                                                className="w-full min-w-0"
                                                                aria-label={`Step ${index + 1} input ${side === "left" ? "A" : "B"}`}
                                                            >
                                                                <SelectValue>
                                                                    {sourceName(step[side]) ||
                                                                        "Unnamed source"}
                                                                </SelectValue>
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectGroup>
                                                                    <SelectLabel>
                                                                        Starting items
                                                                    </SelectLabel>
                                                                    {draft.items.map((item) => (
                                                                        <SelectItem
                                                                            key={item.id}
                                                                            value={item.id}
                                                                        >
                                                                            {item.name ||
                                                                                "Unnamed item"}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectGroup>
                                                                {index > 0 ? (
                                                                    <SelectGroup>
                                                                        <SelectLabel>
                                                                            Earlier results ·
                                                                            independent run
                                                                        </SelectLabel>
                                                                        {draft.steps
                                                                            .slice(0, index)
                                                                            .map(
                                                                                (
                                                                                    entry,
                                                                                    stepIndex,
                                                                                ) => (
                                                                                    <SelectItem
                                                                                        key={
                                                                                            entry.id
                                                                                        }
                                                                                        value={
                                                                                            entry.id
                                                                                        }
                                                                                    >
                                                                                        Step{" "}
                                                                                        {stepIndex +
                                                                                            1}
                                                                                        :{" "}
                                                                                        {entry.name ||
                                                                                            "Unnamed step"}
                                                                                    </SelectItem>
                                                                                ),
                                                                            )}
                                                                    </SelectGroup>
                                                                ) : null}
                                                            </SelectContent>
                                                        </Select>
                                                    </Field>
                                                ))}
                                                <Plus
                                                    aria-hidden="true"
                                                    className="col-start-2 row-start-1 mb-2 size-4 text-muted-foreground"
                                                />
                                            </FieldGroup>
                                            {catalog ? (
                                                <div className="mt-4 flex flex-col gap-3">
                                                    <div className="grid gap-3 md:grid-cols-2">
                                                        {(["left", "right"] as const).map(
                                                            (side) => {
                                                                const field =
                                                                    side === "left"
                                                                        ? "leftPreparation"
                                                                        : "rightPreparation";
                                                                const keepField =
                                                                    side === "left"
                                                                        ? "leftKeepInputMods"
                                                                        : "rightKeepInputMods";
                                                                return (
                                                                    <PreparationEditor
                                                                        key={`${step.id}-${side}-${step[side]}`}
                                                                        id={`${step.id}-${side}-preparation`}
                                                                        label={`Step ${index + 1} input ${side === "left" ? "A" : "B"} preparation`}
                                                                        value={step[field]}
                                                                        keepInputMods={
                                                                            step[keepField]
                                                                        }
                                                                        bases={
                                                                            sourceBases.get(
                                                                                step[side],
                                                                            ) ?? []
                                                                        }
                                                                        outputBases={
                                                                            sourceBases.get(
                                                                                step.id,
                                                                            ) ?? []
                                                                        }
                                                                        catalog={catalog}
                                                                        onChange={(
                                                                            recipe,
                                                                            keepInputMods,
                                                                        ) =>
                                                                            edit({
                                                                                ...draft,
                                                                                steps: draft.steps.map(
                                                                                    (entry) =>
                                                                                        entry.id ===
                                                                                        step.id
                                                                                            ? {
                                                                                                  ...entry,
                                                                                                  [field]:
                                                                                                      recipe,
                                                                                                  [keepField]:
                                                                                                      keepInputMods,
                                                                                                  removeCrafted:
                                                                                                      recipe &&
                                                                                                      catalog.recipes?.find(
                                                                                                          (
                                                                                                              candidate,
                                                                                                          ) =>
                                                                                                              candidate.id ===
                                                                                                              recipe,
                                                                                                      )
                                                                                                          ?.kind ===
                                                                                                          "bench"
                                                                                                          ? true
                                                                                                          : entry.removeCrafted,
                                                                                              }
                                                                                            : entry,
                                                                                ),
                                                                            })
                                                                        }
                                                                    />
                                                                );
                                                            },
                                                        )}
                                                    </div>
                                                    <Field orientation="horizontal">
                                                        <Checkbox
                                                            id={`${step.id}-remove-crafted`}
                                                            checked={step.removeCrafted ?? false}
                                                            onCheckedChange={(checked) =>
                                                                edit({
                                                                    ...draft,
                                                                    steps: draft.steps.map(
                                                                        (entry) =>
                                                                            entry.id === step.id
                                                                                ? {
                                                                                      ...entry,
                                                                                      removeCrafted:
                                                                                          checked ===
                                                                                          true,
                                                                                  }
                                                                                : entry,
                                                                    ),
                                                                })
                                                            }
                                                        />
                                                        <FieldLabel
                                                            htmlFor={`${step.id}-remove-crafted`}
                                                        >
                                                            Remove crafted mods after this
                                                            recombination
                                                        </FieldLabel>
                                                    </Field>
                                                    {step.leftPreparation ||
                                                    step.rightPreparation ? (
                                                        <p className="text-xs text-muted-foreground">
                                                            Preparation applies before this step.
                                                            Bench crafts must fit every possible
                                                            input outcome. Calculated odds are
                                                            conditional on completing the listed
                                                            preparation.
                                                        </p>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                        </CardContent>
                                        <CardFooter>
                                            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                                                <ArrowDown className="size-3" />
                                                Full outcome distribution →{" "}
                                                {step.name || `Step ${index + 1}`}
                                            </p>
                                        </CardFooter>
                                    </Card>
                                </li>
                            ))}
                        </ol>
                        {error ? (
                            <Alert variant="destructive">
                                <AlertTitle>Check your plan</AlertTitle>
                                <AlertDescription className="whitespace-pre-wrap break-words">
                                    {error}
                                </AlertDescription>
                            </Alert>
                        ) : null}
                        <Button size="lg" className="w-full" disabled={busy} onClick={calculate}>
                            <FlaskConical data-icon="inline-start" />
                            {busy ? "Calculating all outcomes…" : "Calculate plan"}
                            <ArrowRight data-icon="inline-end" />
                        </Button>
                    </section>
                </div>

                <section
                    aria-labelledby="outcomes-heading"
                    className="flex min-w-0 flex-col gap-5 xl:sticky xl:top-20"
                    aria-busy={busy}
                >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 id="outcomes-heading" className="text-lg font-semibold">
                            03 <span className="ml-2">Outcome odds</span>
                        </h2>
                        {calculation ? (
                            <Select
                                value={selectedStep}
                                onValueChange={(value) => {
                                    if (value) setSelectedStep(value);
                                    setPage(0);
                                }}
                            >
                                <SelectTrigger
                                    aria-label="View step results"
                                    className="w-full sm:max-w-64"
                                >
                                    <SelectValue>{sourceName(selectedStep)}</SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        {calculation.plan.steps.map((step, index) => (
                                            <SelectItem key={step.id} value={step.id}>
                                                Step {index + 1}: {step.name}
                                            </SelectItem>
                                        ))}
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        ) : null}
                    </div>
                    {!calculation ? (
                        <Empty role="status">
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <FlaskConical />
                                </EmptyMedia>
                                <EmptyDescription>
                                    {busy
                                        ? "Calculating your crafting plan…"
                                        : "Your plan has changed. Calculate to see updated odds."}
                                </EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    ) : (
                        <>
                            <Card>
                                <CardHeader>
                                    <CardTitle>Target modifiers</CardTitle>
                                    <CardDescription>
                                        Select the mods you want to keep.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <FieldSet>
                                        <FieldLegend className="sr-only">
                                            Target modifiers
                                        </FieldLegend>
                                        <FieldGroup className="gap-2">
                                            {modifiers.map(({ affix, side }) => (
                                                <Field key={affix.id} orientation="horizontal">
                                                    <Checkbox
                                                        id={`target-${affix.id}`}
                                                        aria-label={affix.label ?? affix.id}
                                                        checked={required.includes(affix.id)}
                                                        onCheckedChange={(checked) => {
                                                            setRequired((previous) =>
                                                                checked
                                                                    ? [...previous, affix.id]
                                                                    : previous.filter(
                                                                          (id) => id !== affix.id,
                                                                      ),
                                                            );
                                                            setPage(0);
                                                        }}
                                                    />
                                                    <FieldLabel htmlFor={`target-${affix.id}`}>
                                                        <Badge variant="outline" aria-hidden="true">
                                                            {side === "prefixes" ? "P" : "S"}
                                                        </Badge>
                                                        <ModifierIcons affix={affix} />{" "}
                                                        {affix.label ?? affix.id}
                                                    </FieldLabel>
                                                </Field>
                                            ))}
                                        </FieldGroup>
                                        <Field orientation="horizontal">
                                            <Checkbox
                                                id="exact-match"
                                                checked={exact}
                                                onCheckedChange={(checked) => {
                                                    setExact(checked);
                                                    setPage(0);
                                                }}
                                            />
                                            <FieldLabel htmlFor="exact-match">
                                                Exact match (no additional modifiers)
                                            </FieldLabel>
                                        </Field>
                                        {outputBases.length ? (
                                            <Field>
                                                <FieldLabel htmlFor="target-base">
                                                    Required output base
                                                </FieldLabel>
                                                <Select
                                                    value={requiredBase}
                                                    onValueChange={(value) => {
                                                        setRequiredBase(value ?? "any");
                                                        setPage(0);
                                                    }}
                                                >
                                                    <SelectTrigger id="target-base">
                                                        <SelectValue>
                                                            {outputBases.find(
                                                                (base) => base.id === requiredBase,
                                                            )?.name ?? "Any output base"}
                                                        </SelectValue>
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectGroup>
                                                            <SelectItem value="any">
                                                                Any output base
                                                            </SelectItem>
                                                            {outputBases.map((base) => (
                                                                <SelectItem
                                                                    key={base.id}
                                                                    value={base.id}
                                                                >
                                                                    {base.name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectGroup>
                                                    </SelectContent>
                                                </Select>
                                            </Field>
                                        ) : null}
                                    </FieldSet>
                                </CardContent>
                                <CardFooter className="items-end justify-between gap-3">
                                    <div>
                                        <p className="text-sm text-muted-foreground">
                                            {required.length === 0 && requiredBase === "any"
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
                                </CardFooter>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle>Affix-count distribution</CardTitle>
                                </CardHeader>
                                <CardContent className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                                    {counts.map((count) => (
                                        <Badge
                                            variant="secondary"
                                            key={`${count.prefixes}/${count.suffixes}`}
                                            className="flex h-auto w-full flex-col gap-1 rounded-md py-2"
                                        >
                                            <span>
                                                {count.prefixes}p / {count.suffixes}s
                                            </span>
                                            <span>{percent(count.probability)}</span>
                                        </Badge>
                                    ))}
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle>
                                        {sourceName(selectedStep)} · {outcomes.length} outcomes
                                    </CardTitle>
                                    <Field orientation="horizontal">
                                        <Checkbox
                                            id="matching-only"
                                            checked={matchingOnly}
                                            onCheckedChange={(checked) => {
                                                setMatchingOnly(checked);
                                                setPage(0);
                                            }}
                                        />
                                        <FieldLabel htmlFor="matching-only">
                                            Matching only
                                        </FieldLabel>
                                    </Field>
                                </CardHeader>
                                <CardContent className="max-h-[32rem] overflow-auto">
                                    <Table className="table-fixed">
                                        <TableCaption className="sr-only">
                                            Modifier outcomes and unconditional probabilities for{" "}
                                            {sourceName(selectedStep)}
                                        </TableCaption>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Prefixes</TableHead>
                                                <TableHead>Suffixes</TableHead>
                                                <TableHead className="w-28 text-right">
                                                    Probability
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {visible
                                                .slice(
                                                    displayedPage * pageSize,
                                                    (displayedPage + 1) * pageSize,
                                                )
                                                .map((outcome) => (
                                                    <TableRow
                                                        key={outcomeKey(outcome.item)}
                                                        data-state={
                                                            (required.length > 0 ||
                                                                exact ||
                                                                requiredBase !== "any") &&
                                                            matchesTarget(
                                                                outcome.item,
                                                                required,
                                                                exact,
                                                            ) &&
                                                            (requiredBase === "any" ||
                                                                outcome.item.base?.id ===
                                                                    requiredBase)
                                                                ? "selected"
                                                                : undefined
                                                        }
                                                    >
                                                        <TableCell className="whitespace-normal break-words align-top">
                                                            {outcome.item.base ? (
                                                                <p className="mb-2 text-xs text-muted-foreground">
                                                                    {outcome.item.base.name}
                                                                </p>
                                                            ) : null}
                                                            <AffixList
                                                                affixes={outcome.item.prefixes}
                                                                side="prefix"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="whitespace-normal break-words align-top">
                                                            <AffixList
                                                                affixes={outcome.item.suffixes}
                                                                side="suffix"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="text-right align-top">
                                                            {percent(outcome.probability)}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                        </TableBody>
                                    </Table>
                                    {visible.length === 0 ? (
                                        <Empty>
                                            <EmptyHeader>
                                                <EmptyDescription>
                                                    No outcomes match these target modifiers.
                                                </EmptyDescription>
                                            </EmptyHeader>
                                        </Empty>
                                    ) : null}
                                </CardContent>
                                <CardFooter className="justify-between gap-2">
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
                                </CardFooter>
                            </Card>
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
