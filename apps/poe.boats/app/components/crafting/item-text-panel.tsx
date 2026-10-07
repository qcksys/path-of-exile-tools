import { useId, useState } from "react";
import { CatalogItemArt } from "~/components/item-art";
import { Button } from "~/components/ui/button";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import type { CraftingEngine } from "~/lib/crafting-engine";
import {
    exportCraftingItemText,
    type ItemTextMatch,
    importCraftingItemText,
} from "~/lib/crafting-item-text";
import type { CraftingItem } from "~/schemas/crafting";
import { ItemCard } from "./item-card";
import { controlClass } from "./method-picker";

export function ItemTextPanel({
    engine,
    item,
    onImport,
}: {
    engine: CraftingEngine;
    item?: CraftingItem;
    onImport: (item: CraftingItem) => void;
}) {
    const id = useId();
    const [text, setText] = useState("");
    const [matches, setMatches] = useState<ItemTextMatch[]>([]);
    const [selected, setSelected] = useState(0);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const match = matches[selected];
    function safely(action: () => void) {
        try {
            action();
            setError("");
        } catch (error) {
            setError(error instanceof Error ? error.message : String(error));
        }
    }
    return (
        <details className="min-w-0 rounded-lg border border-border bg-card p-4">
            <summary className="cursor-pointer font-medium">Import or export item text</summary>
            <div className="mt-4 space-y-4">
                <p id={`${id}-help`} className="text-sm text-muted-foreground">
                    Paste an English game copy or Path of Building item. PoB ranges need an explicit
                    {" {range:...} "}fraction from 0 to 1 on each ranged line. Advanced copy
                    (Ctrl+Alt+C) includes modifier names and helps distinguish overlapping tiers.
                    Every selected roll must match this game's extracted build. PoB Prefix/Suffix
                    blueprints are also supported when their IDs exist in the build; any
                    accompanying modifier summary must agree with the selected rolls.
                </p>
                <Label className="block space-y-1 text-sm">
                    Item text
                    <Textarea
                        className={`${controlClass} min-h-48 font-mono text-xs`}
                        aria-describedby={`${id}-help`}
                        value={text}
                        maxLength={50_000}
                        onChange={(event) => {
                            setText(event.target.value);
                            setMatches([]);
                            setError("");
                            setNotice("");
                        }}
                    />
                </Label>
                <div className="flex flex-wrap gap-2">
                    <Button
                        disabled={!text.trim()}
                        onClick={() =>
                            safely(() => {
                                setMatches([]);
                                setNotice("");
                                const imported = importCraftingItemText(engine, text);
                                setMatches(imported);
                                setSelected(0);
                            })
                        }
                    >
                        Preview import
                    </Button>
                    <Button
                        variant="outline"
                        disabled={!item}
                        onClick={() =>
                            safely(() => {
                                if (!item) return;
                                setText(exportCraftingItemText(engine, item));
                                setMatches([]);
                                setNotice("Current item exported as Path of Building text.");
                            })
                        }
                    >
                        Export current item text
                    </Button>
                    <Button
                        variant="outline"
                        disabled={!text.trim()}
                        onClick={async () => {
                            try {
                                await navigator.clipboard.writeText(text);
                                setNotice("Item text copied.");
                                setError("");
                            } catch {
                                setError(
                                    "Clipboard access is unavailable. Select and copy the text above.",
                                );
                            }
                        }}
                    >
                        Copy item text
                    </Button>
                </div>
                {error ? (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                ) : null}
                {notice ? (
                    <p role="status" className="text-sm">
                        {notice}
                    </p>
                ) : null}
                {match ? (
                    <div className="space-y-3">
                        {matches.length > 1 ? (
                            <div className="space-y-1 text-sm">
                                <Label htmlFor={`${id}-match`}>Matching item</Label>
                                <FormSelect
                                    id={`${id}-match`}
                                    aria-describedby={`${id}-matches-help`}
                                    className={controlClass}
                                    value={selected}
                                    onValueChange={(selectedValue) =>
                                        setSelected(Number(selectedValue))
                                    }
                                >
                                    {matches.map(({ item }, index) => (
                                        <FormSelectItem key={JSON.stringify(item)} value={index}>
                                            <CatalogItemArt
                                                id={item.baseId}
                                                game={engine.catalog.game}
                                            />
                                            {index + 1}. {engine.base(item).name} ·{" "}
                                            {item.baseId.split("/").at(-1)} ·{" "}
                                            {item.mods
                                                .map(
                                                    (mod) =>
                                                        `${engine.mod(mod.id).name} (ilvl ${engine.mod(mod.id).required_level})`,
                                                )
                                                .join(" / ")}
                                        </FormSelectItem>
                                    ))}
                                </FormSelect>
                                <p
                                    id={`${id}-matches-help`}
                                    className="text-xs text-muted-foreground"
                                >
                                    {matches.length} valid matches. Review the base and modifier
                                    tiers before importing, or use advanced copy to narrow them
                                    down.
                                </p>
                            </div>
                        ) : null}
                        {match.warnings.map((warning) => (
                            <p key={warning} className="text-sm text-amber-700 dark:text-amber-400">
                                {warning}
                            </p>
                        ))}
                        <section aria-label="Item import preview">
                            <ItemCard engine={engine} item={match.item} />
                        </section>
                        <Button
                            onClick={() => {
                                onImport(match.item);
                                setMatches([]);
                                setNotice(
                                    item
                                        ? "Item imported. Undo restores the previous item."
                                        : "Item imported.",
                                );
                            }}
                        >
                            Import selected item
                        </Button>
                    </div>
                ) : null}
                <p className="text-xs text-muted-foreground">
                    Item text stores crafting modifiers, quality, influences and corruption. Other
                    properties, such as gem socket colours/links and base defence rolls, are not
                    stored. PoE 1 text exports use a Socket Count header. PoE 2 augment socket
                    counts, named contents and converted Jewel sockets are retained. Use project
                    JSON to retain imprints, pending reveal choices, modifier origins and process
                    settings.
                </p>
            </div>
        </details>
    );
}
