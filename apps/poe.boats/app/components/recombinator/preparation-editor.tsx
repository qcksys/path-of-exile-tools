import { CatalogPicker } from "~/components/recombinator/catalog-item-editor";
import { Badge } from "~/components/ui/badge";
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import { nativeWeight } from "~/lib/recombinator";
import { catalogModAffix } from "~/lib/recombinator-catalog";
import { availablePreparationRecipes } from "~/lib/recombinator-plan";
import type { CatalogBase, RecombinatorCatalog } from "~/schemas/recombinator-catalog";

export function PreparationEditor({
    id,
    label,
    value,
    bases,
    outputBases,
    catalog,
    onChange,
}: {
    id: string;
    label: string;
    value?: string;
    bases: CatalogBase[];
    outputBases: CatalogBase[];
    catalog: RecombinatorCatalog;
    onChange: (recipe: string | undefined) => void;
}) {
    const selected = catalog.recipes?.find((recipe) => recipe.id === value);
    const kind = selected?.kind ?? (value?.startsWith("pending:") ? value.slice(8) : "none");
    const recipes =
        kind === "none"
            ? []
            : availablePreparationRecipes(catalog, bases, kind === "essence" ? "essence" : "bench");
    const options = recipes.map((recipe) => {
        const mod = catalog.mods.find((entry) => entry.id === recipe.mod)!;
        return {
            id: recipe.id,
            label: `${recipe.name} · ${mod.side === "prefixes" ? "Prefix" : "Suffix"}: ${mod.text}`,
        };
    });
    const mod = catalog.mods.find((entry) => entry.id === selected?.mod);
    const excluded = mod
        ? outputBases.filter((base) => nativeWeight(catalogModAffix(mod), base) === 0)
        : [];
    return (
        <FieldGroup className="min-w-0 gap-3 rounded-lg bg-muted/40 p-3">
            <Field>
                <FieldLabel htmlFor={`${id}-kind`}>{label}</FieldLabel>
                <Select
                    value={kind}
                    onValueChange={(next) =>
                        onChange(!next || next === "none" ? undefined : `pending:${next}`)
                    }
                    disabled={!bases.length}
                >
                    <SelectTrigger id={`${id}-kind`} className="w-full">
                        <SelectValue>
                            {kind === "essence"
                                ? "Prepare an essence NNN donor"
                                : kind === "bench"
                                  ? "Add an exclusive bench craft"
                                  : "Use input as is"}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            <SelectItem value="none">Use input as is</SelectItem>
                            <SelectItem value="essence">Prepare an essence NNN donor</SelectItem>
                            <SelectItem value="bench">Add an exclusive bench craft</SelectItem>
                        </SelectGroup>
                    </SelectContent>
                </Select>
            </Field>
            {!bases.length ? (
                <p className="text-xs text-muted-foreground">
                    Choose a base for this input to see recipes.
                </p>
            ) : null}
            {kind !== "none" ? (
                <>
                    <CatalogPicker
                        id={`${id}-recipe`}
                        label={`${label} recipe`}
                        options={options}
                        value={options.find((option) => option.id === value)}
                        onSelect={onChange}
                    />
                    <p className="text-xs text-muted-foreground">
                        {kind === "essence"
                            ? "Scour the input, use the essence on its base, then annul the other modifiers until only the forced mod remains. This replaces every existing mod, including an earlier step’s result. Odds start after successful isolation; essence rolls and annuls are not simulated."
                            : "For a one-mod magic item, craft on the empty affix side. Prepare both inputs: one natural prefix + crafted suffix, and one crafted prefix + natural suffix. The bench recipe must be unlocked. Select remove crafted mods below to clean the result."}
                    </p>
                </>
            ) : null}
            {selected && mod ? (
                <>
                    <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary">
                            {mod.side === "prefixes" ? "Prefix" : "Suffix"}
                        </Badge>
                        <Badge variant="outline">
                            {selected.kind === "essence"
                                ? "Essence + annul preparation"
                                : "Exclusive craft"}
                        </Badge>
                    </div>
                    <p className="break-words text-sm">{mod.text}</p>
                    <p className="text-xs text-muted-foreground">
                        Recipe cost:{" "}
                        {selected.cost.map((entry) => `${entry.amount} × ${entry.name}`).join(", ")}{" "}
                        per application.
                    </p>
                    {selected.kind === "essence" ? (
                        <p className="text-xs text-muted-foreground">
                            Excluded on:{" "}
                            {excluded.map((base) => base.name).join(", ") ||
                                "none of these output bases"}
                            .
                            {excluded.length < outputBases.length
                                ? " It can survive on the other base."
                                : " It contributes to the mod count but cannot be selected on either base."}
                        </p>
                    ) : null}
                </>
            ) : null}
        </FieldGroup>
    );
}
