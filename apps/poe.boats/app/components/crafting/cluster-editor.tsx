import { useId } from "react";
import { CatalogPicker } from "~/components/recombinator/catalog-item-editor";
import { clusterRule, clusterSkills } from "~/lib/crafting-clusters";
import type { CraftingEngine } from "~/lib/crafting-engine";
import type { CraftingItem } from "~/schemas/crafting";
import { controlClass } from "./method-picker";

export function ClusterEditor({
    engine,
    item,
    onChange,
}: {
    engine: CraftingEngine;
    item: CraftingItem;
    onChange: (item: CraftingItem) => void;
}) {
    const id = useId();
    const rule = clusterRule(engine.catalog, item);
    const skills = clusterSkills(engine.catalog, item);
    if (!rule || !item.cluster) return null;
    const passive = skills.find((skill) => skill.id === item.cluster!.passive)!;
    return (
        <fieldset
            className="space-y-3 border-t pt-3"
            disabled={Boolean(item.destroyed || item.allflameCopies)}
        >
            <legend className="text-xs">Cluster Jewel setup</legend>
            <CatalogPicker
                id={`${id}-passive`}
                label="Cluster passive type"
                options={skills.map((skill) => ({ id: skill.id, label: skill.name }))}
                value={{ id: passive.id, label: passive.name }}
                onSelect={(value) =>
                    onChange({ ...item, cluster: { ...item.cluster!, passive: value } })
                }
            />
            <label className="block space-y-1 text-xs">
                <span>Cluster passive count</span>
                <select
                    className={controlClass}
                    value={item.cluster.nodes ?? ""}
                    onChange={(event) =>
                        onChange({
                            ...item,
                            cluster: {
                                ...item.cluster!,
                                nodes: event.target.value ? Number(event.target.value) : undefined,
                            },
                        })
                    }
                >
                    <option value="">
                        Unknown ({rule.minNodes}–{rule.maxNodes})
                    </option>
                    {Array.from(
                        { length: rule.maxNodes - rule.minNodes + 1 },
                        (_, index) => rule.minNodes + index,
                    ).map((nodes) => (
                        <option key={nodes} value={nodes}>
                            {nodes}
                        </option>
                    ))}
                </select>
            </label>
            <p className="text-xs text-muted-foreground">
                Passive type determines the modifier pool. Count records your starting jewel and is
                retained when crafting. Remove incompatible modifiers before changing type.
            </p>
        </fieldset>
    );
}
