import {
    type ItemCondition,
    type ItemQuery,
    type ItemQuerySelection,
    type ItemRecord,
    itemQuerySelectionSchema,
} from "@poe-tools/item-query";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import {
    type CraftingItemQueryTextResult,
    craftingItemQueryTextResultSchema,
} from "~/schemas/crafting-item-query-text";
import type { CraftingRulesetRef } from "~/schemas/crafting-rulesets";

const selectionLabels: Record<keyof ItemQuerySelection, string> = {
    minimumLevel: "Minimum item level",
    rarity: "Rarity",
    flags: "Item flags and influences",
    modifiers: "Explicit modifier identities and tiers",
    implicitModifiers: "Implicit modifiers",
    openAffixes: "Minimum empty prefixes and suffixes",
    sockets: "Minimum sockets and links",
};
const control = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function conditionLabel(condition: ItemCondition, record: ItemRecord) {
    if (condition.kind === "base") return `Base: ${record.item.baseType}`;
    if (condition.kind === "rarity") return `Rarity: ${condition.values.join(" or ")}`;
    if (condition.kind === "influence") return `Influence: ${condition.values.join(" or ")}`;
    if (condition.kind === "flag") return `${condition.field}: ${condition.value ? "yes" : "no"}`;
    if (condition.kind === "range") {
        const labels = {
            ilvl: "Item level",
            sockets: "Sockets",
            links: "Links",
            prefixes: "Prefixes",
            suffixes: "Suffixes",
            openPrefixes: "Empty prefixes",
            openSuffixes: "Empty suffixes",
        };
        return `${labels[condition.field]}: at least ${condition.value.min}`;
    }
    if (condition.kind === "mod") {
        const mod = record.facts.modifiers.find((entry) => entry.id === condition.ids?.[0]);
        return `${mod?.side ?? "Modifier"}: ${mod?.name ?? condition.ids?.[0]}${mod?.tier === undefined ? "" : ` · tier ${mod.tier}`}${mod?.fractured ? " · fractured" : ""}${mod?.crafted ? " · crafted" : ""}`;
    }
    return condition.id;
}

export function QueryFromItemText({
    game,
    ruleset,
    onApply,
}: {
    game: ItemQuery["game"];
    ruleset: CraftingRulesetRef;
    onApply: (query: ItemQuery) => void;
}) {
    const textId = useId();
    const [text, setText] = useState("");
    const [selection, setSelection] = useState(() => itemQuerySelectionSchema.parse({}));
    const [result, setResult] = useState<CraftingItemQueryTextResult>();
    const [chosen, setChosen] = useState<number | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState("");
    const worker = useRef<Worker | null>(null);
    const pin = JSON.stringify(ruleset);
    // biome-ignore lint/correctness/useExhaustiveDependencies: Any change to the source text, options or catalog invalidates the pending preview.
    useEffect(() => {
        worker.current?.terminate();
        worker.current = null;
        setResult(undefined);
        setChosen(null);
        setError("");
        setNotice("");
        setBusy(false);
        return () => {
            worker.current?.terminate();
            worker.current = null;
        };
    }, [text, selection, game, pin]);

    function preview() {
        worker.current?.terminate();
        setResult(undefined);
        setChosen(null);
        setError("");
        setNotice("");
        setBusy(true);
        const next = new Worker(
            new URL("../../lib/crafting-item-query-text.worker.ts", import.meta.url),
            { type: "module" },
        );
        worker.current = next;
        next.onmessage = ({
            data,
        }: MessageEvent<{ result?: CraftingItemQueryTextResult; error?: string }>) => {
            if (worker.current !== next) return;
            next.terminate();
            worker.current = null;
            setBusy(false);
            const parsed = craftingItemQueryTextResultSchema.safeParse(data.result);
            if (!parsed.success) {
                setError(data.error ?? "Invalid item query response.");
                return;
            }
            setResult(parsed.data);
            if (parsed.data.matches.length === 1) setChosen(0);
        };
        next.onerror = () => {
            if (worker.current !== next) return;
            next.terminate();
            worker.current = null;
            setBusy(false);
            setError("Item parsing failed. Retry after checking the catalog is available.");
        };
        next.postMessage({ game, ruleset, text, selection });
    }
    const match = chosen === null ? undefined : result?.matches[chosen];
    return (
        <details className="rounded-md border border-border p-3">
            <summary className="cursor-pointer text-xs font-medium">
                Create requirements from item text
            </summary>
            <div className="mt-3 space-y-3">
                <p className="text-xs text-muted-foreground">
                    Paste an English game copy or PoB item. Advanced copy (Ctrl+Alt+C) helps
                    distinguish overlapping modifiers. Choose the properties that matter; the base
                    is always included.
                </p>
                <div className="space-y-1">
                    <Label className="block text-xs" htmlFor={textId}>
                        Copied item text
                    </Label>
                    <Textarea
                        id={textId}
                        className={`${control} min-h-36 font-mono text-xs`}
                        maxLength={50_000}
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                    />
                </div>
                <div className="space-y-1">
                    {Object.entries(selectionLabels).map(([key, label]) => (
                        <Label className="flex items-center gap-2 text-xs" key={key}>
                            <Checkbox
                                checked={selection[key as keyof ItemQuerySelection]}
                                onCheckedChange={(checked) =>
                                    setSelection({ ...selection, [key]: checked })
                                }
                            />
                            {label}
                        </Label>
                    ))}
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={busy || !text.trim()}
                    onClick={preview}
                >
                    {busy ? "Parsing item…" : "Preview item requirements"}
                </Button>
                {error && (
                    <p role="alert" className="text-xs text-destructive">
                        {error}
                    </p>
                )}
                {result && result.matches.length > 1 && (
                    <Label className="block space-y-1 text-xs">
                        Item interpretation
                        <span className="block text-muted-foreground">
                            {result.matches.length} matches. Select the base and modifiers you
                            intended before applying.
                        </span>
                        <FormSelect
                            className={control}
                            value={chosen ?? ""}
                            onValueChange={(selectedValue) =>
                                setChosen(selectedValue === "" ? null : Number(selectedValue))
                            }
                        >
                            <FormSelectItem value="">Choose an interpretation</FormSelectItem>
                            {result.matches.map((entry, index) => (
                                <FormSelectItem key={JSON.stringify(entry.item)} value={index}>
                                    {index + 1}. {entry.record.item.baseType} ·{" "}
                                    {entry.item.baseId.split("/").at(-1)} ·{" "}
                                    {entry.record.facts.modifiers
                                        .map(
                                            (mod) =>
                                                `${mod.name ?? mod.id}${mod.tier === undefined ? "" : ` T${mod.tier}`}`,
                                        )
                                        .join(" / ")}
                                </FormSelectItem>
                            ))}
                        </FormSelect>
                    </Label>
                )}
                {match && (
                    <section aria-label="Item requirements preview" className="space-y-2">
                        <p className="text-xs font-medium">
                            {match.record.item.baseType} · item level {match.item.level} ·{" "}
                            {match.item.rarity}
                        </p>
                        {match.warnings.map((warning) => (
                            <p key={warning} className="text-xs text-amber-600">
                                {warning}
                            </p>
                        ))}
                        <details>
                            <summary className="cursor-pointer text-xs">
                                Review generated conditions (
                                {match.query.groups.reduce(
                                    (count, group) => count + group.filters.length,
                                    0,
                                )}
                                )
                            </summary>
                            <ul className="mt-2 max-h-60 list-disc space-y-1 overflow-auto pl-4 text-xs">
                                {match.query.groups
                                    .flatMap((group) => group.filters)
                                    .map((condition, index) => (
                                        // biome-ignore lint/suspicious/noArrayIndexKey: The generated preview is immutable and these list items have no component state.
                                        <li key={`${index}:${JSON.stringify(condition)}`}>
                                            {conditionLabel(condition, match.record)}
                                        </li>
                                    ))}
                            </ul>
                        </details>
                        <Button
                            size="sm"
                            onClick={() => {
                                onApply(match.query);
                                setResult(undefined);
                                setChosen(null);
                                setNotice(
                                    "Requirements replaced. Edit or remove any conditions that do not matter.",
                                );
                            }}
                        >
                            Replace requirements with selected item
                        </Button>
                    </section>
                )}
                {notice && (
                    <p role="status" className="text-xs">
                        {notice}
                    </p>
                )}
            </div>
        </details>
    );
}
