import { useMemo, useState } from "react";
import { ModifierFlags } from "~/components/recombinator/modifier-icons";
import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
} from "~/components/ui/combobox";
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { availableCatalogMods, catalogModAffix, catalogModLabel } from "~/lib/recombinator-catalog";
import type { RecombinatorDraftItem } from "~/lib/recombinator-plan";
import { draftAffixes } from "~/lib/recombinator-tree";
import { type RecombinatorAffix, sharesAffixGroup } from "~/schemas/recombinator";
import type { RecombinatorCatalog } from "~/schemas/recombinator-catalog";

type Option = { id: string; label: string };

function CatalogPicker({
    id,
    label,
    options,
    value,
    disabled,
    onSelect,
}: {
    id: string;
    label: string;
    options: Option[];
    value?: Option;
    disabled?: boolean;
    onSelect: (id: string) => void;
}) {
    const [query, setQuery] = useState<string | null>(null);
    const [open, setOpen] = useState(false);
    const matches = useMemo(() => {
        const words = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
        return options.filter((option) =>
            words.every((word) => option.label.toLowerCase().includes(word)),
        );
    }, [options, query]);
    return (
        <Field>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <Combobox
                items={options}
                filteredItems={matches.slice(0, 60)}
                filter={null}
                value={value ?? null}
                inputValue={query ?? value?.label ?? ""}
                onInputValueChange={setQuery}
                itemToStringLabel={(option: Option) => option.label}
                isItemEqualToValue={(a, b) => a.id === b.id}
                open={open}
                onOpenChange={(next) => {
                    setOpen(next);
                    if (!next) setQuery(null);
                }}
                onValueChange={(option) => {
                    if (option) onSelect(option.id);
                    setQuery(null);
                    setOpen(false);
                }}
                disabled={disabled}
            >
                <ComboboxInput
                    id={id}
                    aria-label={label}
                    placeholder="Search…"
                    onBlur={() => setQuery(null)}
                />
                <ComboboxContent>
                    <ComboboxEmpty>No eligible matches.</ComboboxEmpty>
                    <ComboboxList>
                        {(option: Option) => (
                            <ComboboxItem
                                key={option.id}
                                value={option}
                                className="items-start py-2"
                            >
                                <span className="whitespace-normal break-words">
                                    {option.label}
                                </span>
                            </ComboboxItem>
                        )}
                    </ComboboxList>
                    {matches.length > 60 ? (
                        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                            Showing 60 of {matches.length}. Type to narrow the list.
                        </p>
                    ) : null}
                </ComboboxContent>
            </Combobox>
        </Field>
    );
}

export function CatalogItemEditor({
    entry,
    index,
    catalog,
    knownAffixes,
    onChange,
    onToggle,
}: {
    entry: RecombinatorDraftItem;
    index: number;
    catalog: RecombinatorCatalog;
    knownAffixes: RecombinatorAffix[];
    onChange: (item: RecombinatorDraftItem) => void;
    onToggle: (id: string, flag: "exclusive" | "nonNative", enabled: boolean) => void;
}) {
    const selection = entry.catalog;
    const bases = useMemo(
        () =>
            catalog.bases.map((base) => ({
                id: base.id,
                label: `${base.name} · ${base.itemClass}`,
            })),
        [catalog],
    );
    const modsById = useMemo(
        () => new Map(catalog.mods.map((mod) => [`poe1:${mod.id}`, mod])),
        [catalog],
    );
    const selected = [...(selection?.prefixes ?? []), ...(selection?.suffixes ?? [])];
    const pool = selection
        ? availableCatalogMods(
              catalog.mods,
              selection.base,
              selection.level,
              selected.flatMap((affix) => modsById.get(affix.id) ?? []),
          )
        : [];
    const manual = [...draftAffixes(entry.prefixes), ...draftAffixes(entry.suffixes)];
    return (
        <FieldGroup className="mb-4 gap-3">
            <CatalogPicker
                id={`${entry.id}-base`}
                label={`Item ${index + 1} base`}
                options={bases}
                value={bases.find((base) => base.id === selection?.base.id)}
                onSelect={(id) => {
                    if (id === selection?.base.id) return;
                    onChange({
                        ...entry,
                        catalog: {
                            base: catalog.bases.find((base) => base.id === id)!,
                            level: selection?.level ?? 86,
                            prefixes: [],
                            suffixes: [],
                        },
                    });
                }}
            />
            {selection ? (
                <>
                    <Field>
                        <FieldLabel htmlFor={`${entry.id}-level`}>Item level</FieldLabel>
                        <Input
                            id={`${entry.id}-level`}
                            aria-label={`Item ${index + 1} level`}
                            type="number"
                            min={1}
                            max={100}
                            step={1}
                            value={selection.level || ""}
                            aria-invalid={
                                !Number.isInteger(selection.level) ||
                                selection.level < 1 ||
                                selection.level > 100
                            }
                            onChange={(event) =>
                                onChange({
                                    ...entry,
                                    catalog: {
                                        ...selection,
                                        level: Number(event.target.value),
                                        prefixes: [],
                                        suffixes: [],
                                    },
                                })
                            }
                        />
                    </Field>
                    <p className="text-xs text-muted-foreground">
                        Changing the base or level clears selected catalog mods.
                    </p>
                    {(["prefixes", "suffixes"] as const).map((side) => {
                        const count = selection[side].length + draftAffixes(entry[side]).length;
                        const options = pool
                            .filter(
                                (mod) =>
                                    mod.side === side &&
                                    !manual.some((affix) =>
                                        sharesAffixGroup(affix, catalogModAffix(mod)),
                                    ),
                            )
                            .map((mod) => ({ id: mod.id, label: catalogModLabel(mod) }));
                        return (
                            <div
                                key={side}
                                className={`flex flex-col gap-2 ${side === "prefixes" ? "text-mod-prefix" : "text-mod-suffix"}`}
                            >
                                <CatalogPicker
                                    id={`${entry.id}-${side}-catalog`}
                                    label={`Item ${index + 1} add ${side === "prefixes" ? "prefix" : "suffix"} (${count}/3)`}
                                    options={options}
                                    disabled={count >= 3}
                                    onSelect={(id) => {
                                        const mod = catalog.mods.find(
                                            (candidate) => candidate.id === id,
                                        )!;
                                        const affix = catalogModAffix(mod);
                                        const known = knownAffixes.find(
                                            (candidate) => candidate.id === affix.id,
                                        );
                                        onChange({
                                            ...entry,
                                            catalog: {
                                                ...selection,
                                                [side]: [
                                                    ...selection[side],
                                                    {
                                                        ...affix,
                                                        exclusive: known?.exclusive ?? false,
                                                        nonNative: known?.nonNative ?? false,
                                                    },
                                                ],
                                            },
                                        });
                                    }}
                                />
                                <ModifierFlags
                                    selected={selection[side]}
                                    onToggle={onToggle}
                                    onRemove={(id) =>
                                        onChange({
                                            ...entry,
                                            catalog: {
                                                ...selection,
                                                [side]: selection[side].filter(
                                                    (affix) => affix.id !== id,
                                                ),
                                            },
                                        })
                                    }
                                />
                            </div>
                        );
                    })}
                </>
            ) : null}
        </FieldGroup>
    );
}
