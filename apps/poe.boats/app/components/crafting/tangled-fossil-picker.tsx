import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Label } from "~/components/ui/label";
import { tangledFossilOutcomes } from "~/lib/crafting-fossils";
import type { CraftingCatalog } from "~/schemas/crafting";
import { controlClass } from "./method-picker";

export function TangledFossilPicker({
    catalog,
    value,
    onChange,
}: {
    catalog: CraftingCatalog;
    value?: string;
    onChange: (id: string) => void;
}) {
    const outcomes = tangledFossilOutcomes(catalog);
    const selected = outcomes.find((entry) => entry.id === value);
    return (
        <fieldset className="space-y-2 text-sm">
            <legend className="font-medium">Tangled Fossil revealed effects</legend>
            <div className="grid gap-2 sm:grid-cols-2">
                {(["positive", "negative"] as const).map((side) => {
                    const other = side === "positive" ? "negative" : "positive";
                    const tags = [...new Set(outcomes.map((entry) => entry[side][0]!.tag))].sort();
                    return (
                        <Label key={side} className="block space-y-1">
                            <span>
                                {side === "positive"
                                    ? "Greatly more modifiers"
                                    : "Blocked modifiers"}
                            </span>
                            <FormSelect
                                className={controlClass}
                                value={selected?.[side][0]?.tag ?? ""}
                                onValueChange={(selectedValue) => {
                                    const choice =
                                        outcomes.find(
                                            (entry) =>
                                                entry[side][0]!.tag === selectedValue &&
                                                entry[other][0]!.tag === selected?.[other][0]?.tag,
                                        ) ??
                                        outcomes.find(
                                            (entry) => entry[side][0]!.tag === selectedValue,
                                        );
                                    if (choice) onChange(choice.id);
                                }}
                            >
                                <FormSelectItem value="" disabled>
                                    Choose a modifier type
                                </FormSelectItem>
                                {tags.map((tag) => (
                                    <FormSelectItem
                                        key={tag}
                                        value={tag}
                                        disabled={tag === selected?.[other][0]?.tag}
                                    >
                                        {tag}
                                    </FormSelectItem>
                                ))}
                            </FormSelect>
                        </Label>
                    );
                })}
            </div>
            <p className="text-xs text-muted-foreground">
                Enter the effects revealed when the resonator was fully socketed. Calculations and
                repeated crafts use this pair; the chance of finding the pair is not included.{" "}
                {selected
                    ? `${selected.positive[0]!.weight / 100}× ${selected.positive[0]!.tag} weight; no ${selected.negative[0]!.tag} modifiers.`
                    : ""}
            </p>
        </fieldset>
    );
}
