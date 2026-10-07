import { useId, useMemo } from "react";
import { CatalogPicker } from "~/components/recombinator/catalog-item-editor";
import { Button } from "~/components/ui/button";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { cleanModText } from "~/lib/crafting-text";
import type { CraftingItem, CraftingTarget } from "~/schemas/crafting";
import { matchesCondition } from "../../../../../packages/poe-game-data/src/translation-formats";
import { controlClass } from "./method-picker";

export function StatTargetEditor({
    engine,
    item,
    target,
    onChange,
}: {
    engine: CraftingEngine;
    item: CraftingItem;
    target: CraftingTarget;
    onChange: (target: CraftingTarget) => void;
}) {
    const pickerId = useId();
    const options = useMemo(() => {
        const labels = new Map(
            Object.values(engine.catalog.mods).flatMap((mod) =>
                mod.stats.map((stat) => [stat.id, stat.id] as const),
            ),
        );
        for (const recipe of engine.catalog.crafting.mapQuality)
            for (const stat of recipe.stats)
                if (!labels.has(stat)) labels.set(stat, `${recipe.description} · ${stat}`);
        for (const entry of engine.catalog.crafting.augments) {
            labels.set(entry.type.socketedStat, entry.type.socketedStat);
            for (const rule of entry.rules)
                for (const stat of rule.stats)
                    if (!labels.has(stat.id)) labels.set(stat.id, stat.id);
        }
        for (const description of engine.catalog.crafting.statDescriptions) {
            const id = description.ids[0]!;
            if (description.ids.length !== 1 || labels.get(id) !== id) continue;
            const text = description.rules.find((rule) =>
                rule.conditions.every((condition) => matchesCondition(condition, 1)),
            )?.text;
            if (text) labels.set(id, `${cleanModText(text).replace(/\{[^}]*\}/g, "#")} · ${id}`);
        }
        return [...labels]
            .map(([id, label]) => ({ id, label }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [engine]);
    const stats = target.stats ?? [];
    return (
        <details className="rounded border border-border p-3">
            <summary className="cursor-pointer text-xs font-medium">Stat value conditions</summary>
            <div className="mt-3 space-y-3">
                <p className="text-xs text-muted-foreground">
                    All stat requirements must pass. Totals add the chosen stat across modifiers,
                    including catalyst and modifier effects. The all-modifiers scope also includes
                    map quality, Blight map properties and oil effects, flask enchantments and
                    socketed augment stats. Missing stats count as zero. Values use extracted stat
                    units before display conversions; base defences, DPS and other derived
                    properties are not included.
                </p>
                <CatalogPicker
                    id={pickerId}
                    label="Add stat requirement"
                    options={options.filter(
                        (option) => !stats.some((stat) => stat.id === option.id),
                    )}
                    disabled={stats.length >= 12}
                    onSelect={(id) =>
                        onChange({ ...target, stats: [...stats, { id, scope: "all", min: 1 }] })
                    }
                />
                {stats.map((stat) => (
                    <fieldset
                        key={stat.id}
                        className="min-w-0 space-y-2 rounded border border-border p-3"
                    >
                        <legend className="max-w-full break-words px-1 text-xs">
                            {options.find((option) => option.id === stat.id)?.label ?? stat.id}
                        </legend>
                        <Label className="block space-y-1 text-xs">
                            Count values from
                            <FormSelect
                                className={controlClass}
                                value={stat.scope}
                                onValueChange={(selectedValue) =>
                                    onChange({
                                        ...target,
                                        stats: stats.map((entry) =>
                                            entry.id === stat.id
                                                ? {
                                                      ...entry,
                                                      scope: selectedValue as typeof stat.scope,
                                                  }
                                                : entry,
                                        ),
                                    })
                                }
                            >
                                <FormSelectItem value="all">
                                    Explicit and implicit modifiers
                                </FormSelectItem>
                                <FormSelectItem value="explicit">Explicit modifiers</FormSelectItem>
                                <FormSelectItem value="implicit">Implicit modifiers</FormSelectItem>
                            </FormSelect>
                        </Label>
                        <div className="grid grid-cols-2 gap-2">
                            {(["min", "max"] as const).map((bound) => (
                                <Label key={bound} className="block space-y-1 text-xs">
                                    {bound === "min" ? "Minimum stat value" : "Maximum stat value"}
                                    <Input
                                        className={controlClass}
                                        type="number"
                                        step={1}
                                        placeholder="No limit"
                                        value={stat[bound] ?? ""}
                                        onChange={(event) =>
                                            onChange({
                                                ...target,
                                                stats: stats.map((entry) =>
                                                    entry.id === stat.id
                                                        ? {
                                                              ...entry,
                                                              [bound]:
                                                                  event.target.value === ""
                                                                      ? undefined
                                                                      : Number(event.target.value),
                                                          }
                                                        : entry,
                                                ),
                                            })
                                        }
                                    />
                                </Label>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Current item total:{" "}
                            {engine.statTotals(item, stat.scope).get(stat.id) ?? 0}
                        </p>
                        <Button
                            size="xs"
                            variant="ghost"
                            onClick={() =>
                                onChange({
                                    ...target,
                                    stats: stats.filter((entry) => entry.id !== stat.id),
                                })
                            }
                        >
                            Remove stat requirement
                        </Button>
                    </fieldset>
                ))}
            </div>
        </details>
    );
}
