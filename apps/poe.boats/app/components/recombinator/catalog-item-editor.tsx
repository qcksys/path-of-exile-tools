import { useMemo, useState } from "react";
import { ItemArt } from "~/components/item-art";
import { ModifierFlags } from "~/components/recombinator/modifier-icons";
import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxGroup,
    ComboboxInput,
    ComboboxItem,
    ComboboxLabel,
    ComboboxList,
} from "~/components/ui/combobox";
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { InputGroupAddon } from "~/components/ui/input-group";
import { Separator } from "~/components/ui/separator";
import { useItemPresentations } from "~/hooks/use-item-presentations";
import {
    compareItemPresentations,
    type ItemPresentation,
    itemSubtitle,
} from "~/lib/item-presentation";
import {
    availableCatalogMods,
    catalogBaseOptions,
    catalogModAffix,
    catalogModLabel,
} from "~/lib/recombinator-catalog";
import type { RecombinatorDraftItem } from "~/lib/recombinator-plan";
import { draftAffixes } from "~/lib/recombinator-tree";
import { cn } from "~/lib/utils";
import { type RecombinatorAffix, sharesAffixGroup } from "~/schemas/recombinator";
import type { RecombinatorCatalog } from "~/schemas/recombinator-catalog";

type Option = { id: string; label: string; itemId?: string; item?: ItemPresentation };

export function CatalogPicker({
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
    const items = useItemPresentations();
    const presented = useMemo(
        () =>
            options
                .map((option) => ({
                    ...option,
                    item: items[option.itemId ?? option.id.replace(/^poe[12]:/, "")] ?? option.item,
                }))
                .sort((a, b) =>
                    a.item && b.item
                        ? compareItemPresentations(a.item, b.item)
                        : a.item
                          ? -1
                          : b.item
                            ? 1
                            : 0,
                ),
        [options, items],
    );
    const selected = presented.find((option) => option.id === value?.id) ?? value;
    const matches = useMemo(() => {
        const words = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
        return presented.filter((option) =>
            words.every((word) =>
                `${option.label} ${option.item ? itemSubtitle(option.item) : ""}`
                    .toLowerCase()
                    .includes(word),
            ),
        );
    }, [presented, query]);
    const visible = matches.filter(
        (option, index) => index < 60 || (query === null && option.id === selected?.id),
    );
    const groups = Map.groupBy(visible, (option) => option.item?.itemClass ?? "");
    const renderOption = (option: Option) => (
        <ComboboxItem
            key={option.id}
            value={option}
            data-value={option.id}
            aria-label={option.label}
            className="items-center gap-3 py-2"
        >
            {option.item && <ItemArt src={option.item.art} name={option.item.name} />}
            <span className="min-w-0 whitespace-normal break-words">
                <span className="block">{option.label}</span>
                {option.item && (
                    <>
                        <span className="block text-xs text-muted-foreground">
                            {itemSubtitle(option.item)}
                        </span>
                        {option.item.implicits.length > 0 && (
                            <span className="mt-1 block whitespace-pre-line text-xs text-muted-foreground">
                                {option.item.implicits.join("\n")}
                            </span>
                        )}
                    </>
                )}
            </span>
        </ComboboxItem>
    );
    return (
        <Field>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <Combobox
                items={presented}
                filteredItems={visible}
                filter={null}
                value={selected ?? null}
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
                    placeholder={`Select ${label.toLowerCase()}…`}
                    onBlur={() => setQuery(null)}
                >
                    {selected?.item && (
                        <InputGroupAddon align="inline-start">
                            <ItemArt
                                src={selected.item.art}
                                name={selected.item.name}
                                className="size-7"
                            />
                        </InputGroupAddon>
                    )}
                </ComboboxInput>
                {selected?.item && (
                    <div
                        role="note"
                        className="text-xs text-muted-foreground"
                        aria-label={`${label} details`}
                    >
                        <p>{itemSubtitle(selected.item)}</p>
                        {selected.item.implicits.length > 0 && (
                            <p className="mt-1 whitespace-pre-line">
                                {selected.item.implicits.join("\n")}
                            </p>
                        )}
                    </div>
                )}
                <ComboboxContent>
                    <ComboboxEmpty>No eligible matches.</ComboboxEmpty>
                    <ComboboxList>
                        {[...groups].map(([group, entries]) =>
                            group ? (
                                <ComboboxGroup key={group} items={entries}>
                                    <ComboboxLabel>{group}</ComboboxLabel>
                                    {entries.map(renderOption)}
                                </ComboboxGroup>
                            ) : (
                                entries.map(renderOption)
                            ),
                        )}
                    </ComboboxList>
                    {matches.length > visible.length ? (
                        <>
                            <Separator />
                            <p className="px-3 py-2 text-xs text-muted-foreground">
                                Showing {visible.length} of {matches.length}. Type to narrow the
                                list.
                            </p>
                        </>
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
    const baseOptions = useMemo(() => catalogBaseOptions(catalog.bases), [catalog]);
    const bases = useMemo(
        () =>
            baseOptions.map((base) => ({
                id: base.id,
                label: base.id.startsWith("generic:")
                    ? `${base.name} · generic`
                    : `${base.name} · ${base.itemClass}`,
            })),
        [baseOptions],
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
                            base: baseOptions.find((base) => base.id === id)!,
                            level: selection?.level ?? 86,
                            prefixes: [],
                            suffixes: [],
                        },
                    });
                }}
            />
            {selection ? (
                <>
                    <Field
                        data-invalid={
                            !Number.isInteger(selection.level) ||
                            selection.level < 1 ||
                            selection.level > 100
                        }
                    >
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
                                className={cn(
                                    "flex flex-col gap-2",
                                    side === "prefixes" ? "text-mod-prefix" : "text-mod-suffix",
                                )}
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
