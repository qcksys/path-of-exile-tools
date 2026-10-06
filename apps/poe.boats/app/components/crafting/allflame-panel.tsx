import { useId } from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { allflameDucatActions, allflameQuote, usesAllflame } from "~/lib/crafting-allflame";
import type { CraftingEngine } from "~/lib/crafting-engine";
import type { CraftingItem, CraftingMethod, CraftingTarget } from "~/schemas/crafting";
import { ItemCard } from "./item-card";

export function AllflameOptions({
    engine,
    item,
    value,
    onChange,
}: {
    engine: CraftingEngine;
    item: CraftingItem;
    value: CraftingMethod;
    onChange: (value: CraftingMethod) => void;
}) {
    const id = useId();
    const quote = allflameQuote(engine.catalog, item, value);
    if (value.kind !== "currency" && value.kind !== "essence" && value.kind !== "fossils")
        return null;
    if (!quote && !usesAllflame(value)) return null;
    const action =
        value.kind === "currency"
            ? engine.catalog.crafting.currencies.find((entry) => entry.id === value.id)?.action
            : undefined;
    const ducat = Boolean(action && allflameDucatActions.has(action));
    return (
        <FieldGroup>
            <Field orientation="horizontal">
                <Checkbox
                    id={id}
                    checked={usesAllflame(value)}
                    disabled={ducat}
                    onCheckedChange={(checked) =>
                        onChange({ ...value, allflame: checked ? true : undefined })
                    }
                />
                <FieldLabel htmlFor={id}>Use Allflame crafting</FieldLabel>
            </Field>
            {usesAllflame(value) ? (
                <FieldDescription role="note" aria-label="Allflame crafting model">
                    {quote ? (
                        <>
                            {quote.amount.toLocaleString()} {engine.costName(quote.sulphur)} per
                            craft. Offers {quote.bracket.outcomes.max}{" "}
                            {quote.bracket.outcomes.max === 1 ? "outcome" : "copies"}.
                            {quote.bracket.outcomes.max > 1
                                ? ` ${item.intangibility ?? 0}% chance of only one.`
                                : ""}{" "}
                            Adds {quote.bracket.intangibility.min}–{quote.bracket.intangibility.max}
                            % intangibility per copy.
                        </>
                    ) : (
                        "This item has no available Allflame cost rule."
                    )}{" "}
                    Uses the highest extracted bracket. Calculations prefer the first copy meeting
                    the target. Processes prefer the earliest matching route that does not fail or
                    restart; otherwise they keep the first copy. Manual crafts let you choose.
                    Existing imprints are lost. The current Craft of Exile model adds intangibility
                    even when only one copy appears.
                </FieldDescription>
            ) : null}
            {ducat ? (
                <FieldDescription role="note" aria-label="Ducat crafting model">
                    This Ducat always uses Allflame.{" "}
                    {action === "reset_ghostliness_or_delete"
                        ? "The reference model has a 50% chance to reset intangibility to zero and a 50% chance to destroy the item. Destruction still spends the Ducat and sulphur and cannot satisfy a target."
                        : action === "add_eldritch_implicit_amulet"
                          ? "Replaces one uniformly chosen implicit on an amulet without an Eldritch implicit. New rolls use the build's weighted Eldritch pool and item-level requirements. An empty pool removes the old implicit without adding another in the reference model; the Ducat and sulphur are still spent. Other implicits remain. Ordinary Eldritch currencies still require armour."
                          : action === "add_mod_and_corrupt_rare_abyss_jewel"
                            ? "Adds one weighted modifier to a rare Abyss Jewel, then corrupts it. A full jewel can gain a fifth modifier on either side. A jewel with room uses its ordinary affix limits. Existing rolls and fractures are preserved; later crafts keep their ordinary limits."
                            : action === "reroll_single_attribute_modifier"
                              ? "Each copy chooses one eligible single-attribute modifier and one of its two build equivalents uniformly, then rolls new values. Fractures and metamod locks do not protect the chosen modifier, and its fracture is removed. A conflicting replacement removes the modifier without adding another in the reference model."
                              : action === "split_to_single_explicit"
                                ? "Each copy retains one uniformly chosen explicit modifier with its values and flags, removes the other explicit modifiers and becomes rare. Fractures and metamod locks do not protect other modifiers in this reference model."
                                : action === "reroll_rare_infamous"
                                  ? "Reforges a rare item, preserving fractures and metamod locks. The first new modifier comes from the build's eligible Infamous pool; remaining modifiers use the ordinary pool. Fully preserved outcomes add nothing."
                                  : action === "add_deepwater_hazard_belt_mod"
                                    ? "Adds one weighted Trap or Mine modifier to a rare belt with an open affix. Existing modifiers, item level and metamod blockers restrict the extracted pool."
                                    : "Adds one weighted Pantheon Aspect to a magic or rare item with an open suffix. The extracted class capability, item level and existing granted-skill modifier group restrict eligibility."}
                </FieldDescription>
            ) : null}
        </FieldGroup>
    );
}

export function AllflameEditor({
    engine,
    item,
    onChange,
}: {
    engine: CraftingEngine;
    item: CraftingItem;
    onChange: (item: CraftingItem) => void;
}) {
    const id = useId();
    if (
        !engine.catalog.crafting.allflame?.classes.some(
            (entry) => entry.itemClass === engine.base(item).item_class,
        )
    )
        return null;
    return (
        <Field>
            <FieldLabel htmlFor={id}>Intangibility (%)</FieldLabel>
            <Input
                id={id}
                type="number"
                min={0}
                max={100}
                step={1}
                value={item.intangibility ?? 0}
                disabled={Boolean(item.allflameCopies)}
                onChange={(event) =>
                    onChange({ ...item, intangibility: Number(event.target.value) })
                }
            />
            <FieldDescription>Chance that an Allflame craft offers only one copy.</FieldDescription>
        </Field>
    );
}

export function AllflameCopies({
    engine,
    item,
    onChoose,
}: {
    engine: CraftingEngine;
    item: CraftingItem;
    onChoose: (index: number) => void;
}) {
    if (!item.allflameCopies) return null;
    return (
        <section
            className="space-y-3 rounded-lg border border-border bg-card p-4"
            aria-label="Allflame copies"
        >
            <h2 className="text-lg font-semibold">Choose a ghostly copy</h2>
            <p className="text-sm text-muted-foreground">
                Choose one result to continue and record the craft's cost. The other copies
                disappear.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
                {item.allflameCopies.map((copy, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: Stable offer positions distinguish identical copies.
                    <div key={index} className="min-w-0 space-y-2">
                        <ItemCard engine={engine} item={copy} label={`Ghostly copy ${index + 1}`} />
                        <Button className="w-full" onClick={() => onChoose(index)}>
                            {copy.destroyed ? "Accept destroyed outcome" : `Keep copy ${index + 1}`}
                        </Button>
                    </div>
                ))}
            </div>
        </section>
    );
}

export function IntangibilityTarget({
    value,
    onChange,
}: {
    value: CraftingTarget;
    onChange: (value: CraftingTarget) => void;
}) {
    const id = useId();
    return (
        <details className="space-y-2 text-sm">
            <summary className="cursor-pointer">Intangibility requirement</summary>
            {value.intangibility ? (
                <FieldGroup className="mt-3">
                    {(["min", "max"] as const).map((bound) => (
                        <Field key={bound}>
                            <FieldLabel htmlFor={`${id}-${bound}`}>
                                {bound === "min" ? "Minimum" : "Maximum"} intangibility
                            </FieldLabel>
                            <Input
                                id={`${id}-${bound}`}
                                type="number"
                                min={0}
                                max={100}
                                step={1}
                                value={value.intangibility![bound]}
                                onChange={(event) =>
                                    onChange({
                                        ...value,
                                        intangibility: {
                                            ...value.intangibility!,
                                            [bound]: Number(event.target.value),
                                        },
                                    })
                                }
                            />
                        </Field>
                    ))}
                    <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => onChange({ ...value, intangibility: undefined })}
                    >
                        Clear intangibility requirement
                    </Button>
                </FieldGroup>
            ) : (
                <Button
                    size="xs"
                    variant="outline"
                    onClick={() => onChange({ ...value, intangibility: { min: 0, max: 100 } })}
                >
                    Add intangibility requirement
                </Button>
            )}
        </details>
    );
}
