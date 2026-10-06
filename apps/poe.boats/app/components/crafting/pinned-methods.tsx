import { useId, useState, useSyncExternalStore } from "react";
import { z } from "zod";
import { CatalogPicker } from "~/components/recombinator/catalog-item-editor";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import type { CraftingCatalog, CraftingMethod } from "~/schemas/crafting";

const pinsSchema = z.array(z.string().min(1));
const changed = "poe-boats:crafting-pins-changed";

export function methodPinKey(method: CraftingMethod) {
    return "id" in method ? `${method.kind}:${method.id}` : method.kind;
}

function subscribe(notify: () => void) {
    window.addEventListener("storage", notify);
    window.addEventListener(changed, notify);
    return () => {
        window.removeEventListener("storage", notify);
        window.removeEventListener(changed, notify);
    };
}

function snapshot(key: string) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function readPins(raw: string | null) {
    try {
        return [...new Set(pinsSchema.parse(JSON.parse(raw ?? "[]")))];
    } catch {
        return [];
    }
}

export function PinnedMethods({
    game,
    options,
    current,
    onSelect,
}: {
    game: CraftingCatalog["game"];
    options: { id: string; label: string; pin: string }[];
    current: string;
    onSelect: (id: string) => void;
}) {
    const id = useId();
    const key = `poe-boats:crafting:pinned-methods:${game}`;
    const raw = useSyncExternalStore(
        subscribe,
        () => snapshot(key),
        () => null,
    );
    const pins = readPins(raw);
    const [error, setError] = useState(false);
    const selected = options.find((option) => option.pin === current);
    const pinned = pins.includes(current);
    const available = pins.flatMap((pin) => options.filter((option) => option.pin === pin));
    return (
        <section aria-label="Pinned methods" className="flex min-w-0 flex-col gap-2">
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                aria-label="Pin current crafting method"
                aria-pressed={pinned}
                disabled={!selected}
                onClick={() => {
                    const latest = readPins(snapshot(key));
                    const next = latest.includes(current)
                        ? latest.filter((pin) => pin !== current)
                        : [...latest, current];
                    try {
                        localStorage.setItem(key, JSON.stringify(next));
                        setError(false);
                        window.dispatchEvent(new Event(changed));
                    } catch {
                        setError(true);
                    }
                }}
            >
                {pinned ? "Unpin method" : "Pin method"}
            </Button>
            {available.length > 0 && (
                <CatalogPicker
                    id={`${id}-pinned-method`}
                    label="Pinned crafting methods"
                    options={available}
                    value={pinned ? selected : undefined}
                    onSelect={onSelect}
                />
            )}
            {error && (
                <Alert variant="destructive">
                    <AlertDescription>
                        Could not save pinned methods in this browser.
                    </AlertDescription>
                </Alert>
            )}
        </section>
    );
}
