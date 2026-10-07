import type { ItemCondition, ItemQuery, NumericRange } from "@poe-tools/item-query";
import { useId, useMemo } from "react";
import { CatalogPicker } from "~/components/recombinator/catalog-item-editor";
import { Button } from "~/components/ui/button";
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
                <label key={bound} className="min-w-0 flex-1 text-xs text-muted-foreground">
                    {bound === "min" ? "Minimum" : "Maximum"}
                    <input
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
                </label>
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
                    <label className="block text-xs">
                        Affix side
                        <select
                            className={graphControl}
                            value={condition.side ?? "any"}
                            onChange={(event) =>
                                update({
                                    ...condition,
                                    side:
                                        event.target.value === "any"
                                            ? undefined
                                            : (event.target.value as
                                                  | "prefix"
                                                  | "suffix"
                                                  | "implicit"),
                                })
                            }
                        >
                            <option value="any">Any</option>
                            <option value="prefix">Prefix</option>
                            <option value="suffix">Suffix</option>
                            <option value="implicit">Implicit</option>
                        </select>
                    </label>
                    <label className="block text-xs">
                        Fractured
                        <select
                            className={graphControl}
                            value={
                                condition.fractured === undefined
                                    ? "any"
                                    : String(condition.fractured)
                            }
                            onChange={(event) =>
                                update({
                                    ...condition,
                                    fractured:
                                        event.target.value === "any"
                                            ? undefined
                                            : event.target.value === "true",
                                })
                            }
                        >
                            <option value="any">Any</option>
                            <option value="true">Required</option>
                            <option value="false">Excluded</option>
                        </select>
                    </label>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => update({ ...condition, ids: undefined, names: undefined })}
                    >
                        Any modifier identity
                    </Button>
                    <label className="block text-xs">
                        Crafted modifier
                        <select
                            className={graphControl}
                            value={
                                condition.crafted === undefined ? "any" : String(condition.crafted)
                            }
                            onChange={(event) =>
                                update({
                                    ...condition,
                                    crafted:
                                        event.target.value === "any"
                                            ? undefined
                                            : event.target.value === "true",
                                })
                            }
                        >
                            <option value="any">Any</option>
                            <option value="true">Required</option>
                            <option value="false">Excluded</option>
                        </select>
                    </label>
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
                    <select
                        aria-label="Item property"
                        className={graphControl}
                        value={condition.field}
                        onChange={(event) =>
                            update({
                                ...condition,
                                field: event.target.value as typeof condition.field,
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
                            <option key={field} value={field}>
                                {(
                                    {
                                        ilvl: "Item level",
                                        openPrefixes: "Empty prefixes",
                                        openSuffixes: "Empty suffixes",
                                    } as Record<string, string>
                                )[field] ?? field}
                            </option>
                        ))}
                    </select>
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
                    <select
                        aria-label="Item flag"
                        className={graphControl}
                        value={condition.field}
                        onChange={(event) =>
                            update({
                                ...condition,
                                field: event.target.value as typeof condition.field,
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
                            <option key={flag}>{flag}</option>
                        ))}
                    </select>
                    <select
                        aria-label="Flag requirement"
                        className={graphControl}
                        value={String(condition.value)}
                        onChange={(event) =>
                            update({ ...condition, value: event.target.value === "true" })
                        }
                    >
                        <option value="true">Required</option>
                        <option value="false">Excluded</option>
                    </select>
                </div>
            );
        if (condition.kind === "rarity")
            return (
                <select
                    aria-label="Required rarity"
                    className={graphControl}
                    value={condition.values[0]}
                    onChange={(event) =>
                        update({
                            ...condition,
                            values: [event.target.value as (typeof condition.values)[number]],
                        })
                    }
                >
                    {["Normal", "Magic", "Rare", "Unique"].map((rarity) => (
                        <option key={rarity}>{rarity}</option>
                    ))}
                </select>
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
                <label className="block text-xs">
                    {condition.kind === "influence"
                        ? "Any of these influences"
                        : condition.field === "itemClass"
                          ? "Any of these item classes"
                          : "Any of these base names"}
                    <input
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
                </label>
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
                        <select
                            aria-label={`${label} group ${groupIndex + 1}`}
                            className={graphControl}
                            value={group.type}
                            onChange={(event) =>
                                groupChange(groupIndex, {
                                    ...group,
                                    type: event.target.value as typeof group.type,
                                    value: event.target.value === "count" ? { min: 1 } : undefined,
                                })
                            }
                        >
                            <option value="and">All conditions</option>
                            <option value="or">Any condition</option>
                            <option value="not">None of these</option>
                            <option value="count">Count matching conditions</option>
                        </select>
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
                                    <select
                                        aria-label="Condition type"
                                        className={graphControl}
                                        value={condition.kind}
                                        onChange={(event) => {
                                            const kind = event.target.value;
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
                                        <option value="mod">Modifier</option>
                                        <option value="range">Item property</option>
                                        <option value="flag">Flag</option>
                                        <option value="rarity">Rarity</option>
                                        <option value="base">Base</option>
                                        {!["mod", "range", "flag", "rarity", "base"].includes(
                                            condition.kind,
                                        ) && (
                                            <option value={condition.kind}>{condition.kind}</option>
                                        )}
                                    </select>
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
