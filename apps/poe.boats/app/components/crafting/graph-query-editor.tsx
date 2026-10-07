import type { ItemCondition, ItemQuery, NumericRange } from "@poe-tools/item-query";
import { useId, useMemo } from "react";
import { CatalogPicker } from "~/components/recombinator/catalog-item-editor";
import { Button } from "~/components/ui/button";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { CraftingCatalog } from "~/schemas/crafting";
import type { CraftingRulesetRef } from "~/schemas/crafting-rulesets";
import { QueryFromItemText } from "./query-from-item-text";

export const graphControl = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export function RangeFields({
    value,
    onChange,
    label,
}: {
    value: NumericRange;
    onChange: (range: NumericRange) => void;
    label: string;
}) {
    return (
        <div className="flex gap-2">
            {(["min", "max"] as const).map((bound) => (
                <Label key={bound} className="block min-w-0 flex-1 text-xs text-muted-foreground">
                    {bound === "min" ? "Minimum" : "Maximum"}
                    <Input
                        className={graphControl}
                        aria-label={`${label} ${bound}`}
                        type="number"
                        value={value[bound] ?? ""}
                        onChange={(event) =>
                            onChange({
                                ...value,
                                [bound]:
                                    event.target.value === ""
                                        ? undefined
                                        : Number(event.target.value),
                            })
                        }
                    />
                </Label>
            ))}
        </div>
    );
}

export function GraphQueryEditor({
    value,
    onChange,
    catalog,
    label,
    ruleset,
}: {
    value: ItemQuery;
    onChange: (query: ItemQuery) => void;
    catalog: CraftingCatalog;
    label: string;
    ruleset: CraftingRulesetRef;
}) {
    const uid = useId();
    const mods = useMemo(
        () =>
            Object.entries(catalog.mods).map(([id, mod]) => ({
                id,
                label: `${mod.name} · ${mod.text ?? id}`,
            })),
        [catalog],
    );
    const bases = useMemo(
        () => Object.entries(catalog.bases).map(([id, base]) => ({ id, label: base.name })),
        [catalog],
    );
    const groupChange = (index: number, group: ItemQuery["groups"][number]) =>
        onChange({
            ...value,
            groups: value.groups.map((entry, i) => (i === index ? group : entry)),
        });
    const conditionEditor = (
        condition: ItemCondition,
        update: (next: ItemCondition) => void,
        key: string,
    ) => {
        if (condition.kind === "mod")
            return (
                <div className="space-y-2">
                    <CatalogPicker
                        id={`${uid}-${key}`}
                        label="Required modifier"
                        options={mods}
                        value={mods.find((entry) => entry.id === condition.ids?.[0])}
                        onSelect={(id) => update({ ...condition, ids: [id] })}
                    />
                    <p className="text-xs text-muted-foreground">
                        Exact modifier identity; leave unspecified to match any modifier with the
                        tier or flags below.
                    </p>
                    <p className="text-xs">Modifier tier</p>
                    <RangeFields
                        label="Modifier tier"
                        value={condition.tier ?? {}}
                        onChange={(tier) => update({ ...condition, tier })}
                    />
                    <Label className="block text-xs">
                        Affix side
                        <FormSelect
                            className={graphControl}
                            value={condition.side ?? "any"}
                            onValueChange={(selectedValue) =>
                                update({
                                    ...condition,
                                    side:
                                        selectedValue === "any"
                                            ? undefined
                                            : (selectedValue as "prefix" | "suffix" | "implicit"),
                                })
                            }
                        >
                            <FormSelectItem value="any">Any</FormSelectItem>
                            <FormSelectItem value="prefix">Prefix</FormSelectItem>
                            <FormSelectItem value="suffix">Suffix</FormSelectItem>
                            <FormSelectItem value="implicit">Implicit</FormSelectItem>
                        </FormSelect>
                    </Label>
                    <Label className="block text-xs">
                        Fractured
                        <FormSelect
                            className={graphControl}
                            value={
                                condition.fractured === undefined
                                    ? "any"
                                    : String(condition.fractured)
                            }
                            onValueChange={(selectedValue) =>
                                update({
                                    ...condition,
                                    fractured:
                                        selectedValue === "any"
                                            ? undefined
                                            : selectedValue === "true",
                                })
                            }
                        >
                            <FormSelectItem value="any">Any</FormSelectItem>
                            <FormSelectItem value="true">Required</FormSelectItem>
                            <FormSelectItem value="false">Excluded</FormSelectItem>
                        </FormSelect>
                    </Label>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => update({ ...condition, ids: undefined, names: undefined })}
                    >
                        Any modifier identity
                    </Button>
                    <Label className="block text-xs">
                        Crafted modifier
                        <FormSelect
                            className={graphControl}
                            value={
                                condition.crafted === undefined ? "any" : String(condition.crafted)
                            }
                            onValueChange={(selectedValue) =>
                                update({
                                    ...condition,
                                    crafted:
                                        selectedValue === "any"
                                            ? undefined
                                            : selectedValue === "true",
                                })
                            }
                        >
                            <FormSelectItem value="any">Any</FormSelectItem>
                            <FormSelectItem value="true">Required</FormSelectItem>
                            <FormSelectItem value="false">Excluded</FormSelectItem>
                        </FormSelect>
                    </Label>
                    <p className="text-xs">Number of matching modifiers</p>
                    <RangeFields
                        label="Matching modifiers"
                        value={condition.count}
                        onChange={(count) => update({ ...condition, count })}
                    />
                </div>
            );
        if (condition.kind === "range")
            return (
                <>
                    <FormSelect
                        aria-label="Item property"
                        className={graphControl}
                        value={condition.field}
                        onValueChange={(selectedValue) =>
                            update({
                                ...condition,
                                field: selectedValue as typeof condition.field,
                            })
                        }
                    >
                        {[
                            "ilvl",
                            "sockets",
                            "links",
                            "prefixes",
                            "suffixes",
                            "openPrefixes",
                            "openSuffixes",
                        ].map((field) => (
                            <FormSelectItem key={field} value={field}>
                                {(
                                    {
                                        ilvl: "Item level",
                                        openPrefixes: "Empty prefixes",
                                        openSuffixes: "Empty suffixes",
                                    } as Record<string, string>
                                )[field] ?? field}
                            </FormSelectItem>
                        ))}
                    </FormSelect>
                    <RangeFields
                        label={condition.field}
                        value={condition.value}
                        onChange={(range) => update({ ...condition, value: range })}
                    />
                </>
            );
        if (condition.kind === "flag")
            return (
                <div className="flex gap-2">
                    <FormSelect
                        aria-label="Item flag"
                        className={graphControl}
                        value={condition.field}
                        onValueChange={(selectedValue) =>
                            update({
                                ...condition,
                                field: selectedValue as typeof condition.field,
                            })
                        }
                    >
                        {[
                            "identified",
                            "corrupted",
                            "mirrored",
                            "fractured",
                            "split",
                            "synthesised",
                            "sanctified",
                            "influenced",
                            "destroyed",
                        ].map((flag) => (
                            <FormSelectItem key={flag} value={flag}>
                                {flag}
                            </FormSelectItem>
                        ))}
                    </FormSelect>
                    <FormSelect
                        aria-label="Flag requirement"
                        className={graphControl}
                        value={String(condition.value)}
                        onValueChange={(selectedValue) =>
                            update({ ...condition, value: selectedValue === "true" })
                        }
                    >
                        <FormSelectItem value="true">Required</FormSelectItem>
                        <FormSelectItem value="false">Excluded</FormSelectItem>
                    </FormSelect>
                </div>
            );
        if (condition.kind === "rarity")
            return (
                <FormSelect
                    aria-label="Required rarity"
                    className={graphControl}
                    value={condition.values[0]}
                    onValueChange={(selectedValue) =>
                        update({
                            ...condition,
                            values: [selectedValue as (typeof condition.values)[number]],
                        })
                    }
                >
                    {["Normal", "Magic", "Rare", "Unique"].map((rarity) => (
                        <FormSelectItem key={rarity} value={rarity}>
                            {rarity}
                        </FormSelectItem>
                    ))}
                </FormSelect>
            );
        if (condition.kind === "base" && condition.field === "baseId")
            return (
                <CatalogPicker
                    id={`${uid}-${key}`}
                    label="Required base"
                    options={bases}
                    value={bases.find((entry) => entry.id === condition.values[0])}
                    onSelect={(id) => update({ ...condition, values: [id] })}
                />
            );
        if (condition.kind === "stat")
            return (
                <div className="space-y-2">
                    <p className="text-xs">
                        {condition.id} · {condition.scope} stats
                    </p>
                    <RangeFields
                        label="Stat value"
                        value={condition.value}
                        onChange={(range) => update({ ...condition, value: range })}
                    />
                </div>
            );
        if (condition.kind === "base" || condition.kind === "influence")
            return (
                <Label className="block text-xs">
                    {condition.kind === "influence"
                        ? "Any of these influences"
                        : condition.field === "itemClass"
                          ? "Any of these item classes"
                          : "Any of these base names"}
                    <Input
                        key={condition.values.join(",")}
                        className={graphControl}
                        defaultValue={condition.values.join(", ")}
                        onBlur={(event) => {
                            const values = event.target.value
                                .split(",")
                                .map((value) => value.trim())
                                .filter(Boolean);
                            if (values.length) update({ ...condition, values });
                        }}
                    />
                    <span className="text-muted-foreground">
                        Separate alternatives with commas.
                    </span>
                </Label>
            );
        return null;
    };
    return (
        <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-medium">{label}</legend>
            <QueryFromItemText game={value.game} ruleset={ruleset} onApply={onChange} />
            {!value.groups.length && (
                <p className="text-xs text-muted-foreground">
                    Any item. Add only the properties that matter.
                </p>
            )}
            {value.groups.map((group, groupIndex) => (
                <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: Query groups have no persisted identity; their controls are controlled by the query.
                    key={`${uid}-${groupIndex}`}
                    className="space-y-3 rounded-md border border-border p-3"
                >
                    <div className="flex items-center gap-2">
                        <FormSelect
                            aria-label={`${label} group ${groupIndex + 1}`}
                            className={graphControl}
                            value={group.type}
                            onValueChange={(selectedValue) =>
                                groupChange(groupIndex, {
                                    ...group,
                                    type: selectedValue as typeof group.type,
                                    value: selectedValue === "count" ? { min: 1 } : undefined,
                                })
                            }
                        >
                            <FormSelectItem value="and">All conditions</FormSelectItem>
                            <FormSelectItem value="or">Any condition</FormSelectItem>
                            <FormSelectItem value="not">None of these</FormSelectItem>
                            <FormSelectItem value="count">Count matching conditions</FormSelectItem>
                        </FormSelect>
                        <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Remove ${label} group ${groupIndex + 1}`}
                            onClick={() =>
                                onChange({
                                    ...value,
                                    groups: value.groups.filter((_, i) => i !== groupIndex),
                                })
                            }
                        >
                            Remove
                        </Button>
                    </div>
                    {group.type === "count" && (
                        <RangeFields
                            label="Matching conditions"
                            value={group.value ?? { min: 1 }}
                            onChange={(range) =>
                                groupChange(groupIndex, { ...group, value: range })
                            }
                        />
                    )}
                    {group.filters.map((condition, index) => {
                        const update = (next: ItemCondition) =>
                            groupChange(groupIndex, {
                                ...group,
                                filters: group.filters.map((entry, i) =>
                                    i === index ? next : entry,
                                ),
                            });
                        return (
                            <div
                                // biome-ignore lint/suspicious/noArrayIndexKey: Conditions have no persisted identity; edits are controlled by the query.
                                key={`${uid}-${groupIndex}-${index}`}
                                className="space-y-2 border-t border-border pt-3"
                            >
                                <div className="flex gap-2">
                                    <FormSelect
                                        aria-label="Condition type"
                                        className={graphControl}
                                        value={condition.kind}
                                        onValueChange={(selectedValue) => {
                                            const kind = selectedValue;
                                            if (kind === "mod") update({ kind, count: { min: 1 } });
                                            if (kind === "range")
                                                update({
                                                    kind,
                                                    field: "openPrefixes",
                                                    value: { min: 1 },
                                                });
                                            if (kind === "flag")
                                                update({ kind, field: "corrupted", value: false });
                                            if (kind === "rarity")
                                                update({ kind, values: ["Rare"] });
                                            if (kind === "base")
                                                update({
                                                    kind,
                                                    field: "baseId",
                                                    values: [bases[0]!.id],
                                                });
                                        }}
                                    >
                                        <FormSelectItem value="mod">Modifier</FormSelectItem>
                                        <FormSelectItem value="range">Item property</FormSelectItem>
                                        <FormSelectItem value="flag">Flag</FormSelectItem>
                                        <FormSelectItem value="rarity">Rarity</FormSelectItem>
                                        <FormSelectItem value="base">Base</FormSelectItem>
                                        {!["mod", "range", "flag", "rarity", "base"].includes(
                                            condition.kind,
                                        ) && (
                                            <FormSelectItem value={condition.kind}>
                                                {condition.kind}
                                            </FormSelectItem>
                                        )}
                                    </FormSelect>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        aria-label={`Remove condition ${index + 1}`}
                                        onClick={() =>
                                            group.filters.length === 1
                                                ? onChange({
                                                      ...value,
                                                      groups: value.groups.filter(
                                                          (_, i) => i !== groupIndex,
                                                      ),
                                                  })
                                                : groupChange(groupIndex, {
                                                      ...group,
                                                      filters: group.filters.filter(
                                                          (_, i) => i !== index,
                                                      ),
                                                  })
                                        }
                                    >
                                        ×
                                    </Button>
                                </div>
                                {conditionEditor(condition, update, `${groupIndex}-${index}`)}
                            </div>
                        );
                    })}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                            groupChange(groupIndex, {
                                ...group,
                                filters: [...group.filters, { kind: "mod", count: { min: 1 } }],
                            })
                        }
                    >
                        Add condition
                    </Button>
                </div>
            ))}
            <Button
                variant="outline"
                size="sm"
                onClick={() =>
                    onChange({
                        ...value,
                        groups: [
                            ...value.groups,
                            { type: "and", filters: [{ kind: "mod", count: { min: 1 } }] },
                        ],
                    })
                }
            >
                Add condition group
            </Button>
        </fieldset>
    );
}
