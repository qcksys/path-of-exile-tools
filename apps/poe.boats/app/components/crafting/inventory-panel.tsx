import { useState } from "react";
import { ItemArt } from "~/components/item-art";
import { Button } from "~/components/ui/button";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useItemPresentations } from "~/hooks/use-item-presentations";
import type { CraftingEngine } from "~/lib/crafting-engine";
import type { CraftingItem, CraftingProject } from "~/schemas/crafting";
import { controlClass } from "./method-picker";

export function InventoryPanel({
    engine,
    item,
    entries,
    tabs,
    shared = false,
    onChange,
    onLoad,
}: {
    engine: CraftingEngine;
    item: CraftingItem;
    entries: CraftingProject["inventory"];
    tabs: string[];
    shared?: boolean;
    onChange: (entries: CraftingProject["inventory"], tabs: string[]) => unknown;
    onLoad: (item: CraftingItem, name: string) => void;
}) {
    const [name, setName] = useState("");
    const presentations = useItemPresentations(engine.catalog.game);
    const [selectedTab, setSelectedTab] = useState("");
    const [tabName, setTabName] = useState("");
    const tab = tabs.includes(selectedTab) ? selectedTab : "";
    const visible = entries.filter((entry) => (entry.tab ?? "") === tab);
    const nextName = tabName.trim();
    const availableName = !!nextName && nextName !== "Unfiled" && !tabs.includes(nextName);
    return (
        <details className="space-y-3 rounded-lg border border-border bg-card p-4">
            <summary className="cursor-pointer font-semibold">
                Item inventory ({entries.length})
            </summary>
            <p className="text-xs text-muted-foreground">
                {shared
                    ? "Store item snapshots for any project in this game and build. The shared library is saved in this browser and exported separately."
                    : "Store item snapshots to compare crafting attempts. Inventory is included when saving or exporting this project."}
            </p>
            <Label className="block space-y-1 text-xs">
                Inventory tab
                <FormSelect
                    className={controlClass}
                    value={tab}
                    onValueChange={(selectedValue) => {
                        setSelectedTab(selectedValue);
                        setTabName(selectedValue);
                    }}
                >
                    <FormSelectItem value="">
                        Unfiled ({entries.filter((entry) => !entry.tab).length})
                    </FormSelectItem>
                    {tabs.map((name) => (
                        <FormSelectItem key={name} value={name}>
                            {name} ({entries.filter((entry) => entry.tab === name).length})
                        </FormSelectItem>
                    ))}
                </FormSelect>
            </Label>
            <details className="space-y-2">
                <summary className="cursor-pointer text-xs">Manage inventory tabs</summary>
                <Label className="block space-y-1 text-xs">
                    Tab name
                    <Input
                        className={controlClass}
                        maxLength={60}
                        value={tabName}
                        onChange={(event) => setTabName(event.target.value)}
                    />
                </Label>
                <div className="flex flex-wrap gap-2">
                    <Button
                        size="xs"
                        variant="outline"
                        disabled={!availableName || tabs.length >= 20}
                        onClick={() => {
                            if (onChange(entries, [...tabs, nextName]) === false) return;
                            setSelectedTab(nextName);
                            setTabName(nextName);
                        }}
                    >
                        Add tab
                    </Button>
                    <Button
                        size="xs"
                        variant="outline"
                        disabled={!tab || !availableName}
                        onClick={() => {
                            if (
                                onChange(
                                    entries.map((entry) =>
                                        entry.tab === tab ? { ...entry, tab: nextName } : entry,
                                    ),
                                    tabs.map((name) => (name === tab ? nextName : name)),
                                ) === false
                            )
                                return;
                            setSelectedTab(nextName);
                            setTabName(nextName);
                        }}
                    >
                        Rename tab
                    </Button>
                    <Button
                        size="xs"
                        variant="ghost"
                        disabled={!tab}
                        onClick={() => {
                            if (
                                onChange(
                                    entries.map((entry) =>
                                        entry.tab === tab ? { ...entry, tab: undefined } : entry,
                                    ),
                                    tabs.filter((name) => name !== tab),
                                ) === false
                            )
                                return;
                            setSelectedTab("");
                            setTabName("");
                        }}
                    >
                        Remove tab
                    </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                    Removing a tab moves its items to Unfiled. All tabs remain available when
                    choosing crafting donors or socketed Jewels.
                </p>
            </details>
            <Label className="block space-y-1 text-xs">
                Inventory item name
                <Input
                    className={controlClass}
                    maxLength={100}
                    value={name}
                    placeholder={engine.base(item).name}
                    onChange={(event) => setName(event.target.value)}
                />
            </Label>
            <Button
                variant="outline"
                disabled={entries.length >= 100}
                onClick={() => {
                    const saved = onChange(
                        [
                            ...entries,
                            {
                                id: crypto.randomUUID(),
                                name: name.trim() || engine.base(item).name,
                                item: structuredClone(item),
                                ...(tab ? { tab } : {}),
                            },
                        ],
                        tabs,
                    );
                    if (saved !== false) setName("");
                }}
            >
                Store current item
            </Button>
            {item.socketedJewel ? (
                <Button
                    variant="outline"
                    disabled={entries.length >= 100}
                    onClick={() =>
                        onChange(
                            [
                                ...entries,
                                {
                                    id: crypto.randomUUID(),
                                    name: engine.base(item.socketedJewel!).name,
                                    item: structuredClone(item.socketedJewel!),
                                    ...(tab ? { tab } : {}),
                                },
                            ],
                            tabs,
                        )
                    }
                >
                    Store socketed Jewel
                </Button>
            ) : null}
            <ul className="space-y-3">
                {visible.map((entry) => (
                    <li key={entry.id} className="space-y-2 border-t border-border pt-3">
                        <ItemArt
                            src={presentations[entry.item.baseId]?.art ?? ""}
                            name={engine.base(entry.item).name}
                        />
                        <p className="break-words text-sm font-medium">{entry.name}</p>
                        <p className="text-xs text-muted-foreground">
                            {engine.base(entry.item).name} · {entry.item.rarity} ·{" "}
                            {entry.item.mods.length} modifiers · ilvl {entry.item.level}
                        </p>
                        {tabs.length ? (
                            <Label className="block space-y-1 text-xs">
                                Move {entry.name} to tab
                                <FormSelect
                                    className={controlClass}
                                    value={entry.tab ?? ""}
                                    onValueChange={(selectedValue) =>
                                        onChange(
                                            entries.map((value) =>
                                                value.id === entry.id
                                                    ? {
                                                          ...value,
                                                          tab: selectedValue || undefined,
                                                      }
                                                    : value,
                                            ),
                                            tabs,
                                        )
                                    }
                                >
                                    <FormSelectItem value="">Unfiled</FormSelectItem>
                                    {tabs.map((name) => (
                                        <FormSelectItem key={name} value={name}>
                                            {name}
                                        </FormSelectItem>
                                    ))}
                                </FormSelect>
                            </Label>
                        ) : null}
                        <div className="flex gap-2">
                            <Button
                                size="xs"
                                variant="outline"
                                aria-label={`Load ${entry.name}`}
                                onClick={() => onLoad(structuredClone(entry.item), entry.name)}
                            >
                                Load item
                            </Button>
                            <Button
                                size="xs"
                                variant="ghost"
                                aria-label={`Delete ${entry.name}`}
                                onClick={() =>
                                    onChange(
                                        entries.filter((value) => value.id !== entry.id),
                                        tabs,
                                    )
                                }
                            >
                                Delete
                            </Button>
                        </div>
                    </li>
                ))}
            </ul>
        </details>
    );
}
