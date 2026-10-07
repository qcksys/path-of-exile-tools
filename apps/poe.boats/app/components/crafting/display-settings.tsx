import { createContext, useEffect, useId, useState } from "react";
import { z } from "zod";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import { useStorageState } from "~/hooks/use-storage-state";

const preferencesSchema = z.object({
    itemOrder: z.enum(["name", "dropLevel"]).default("dropLevel"),
    itemOutput: z.enum(["advanced", "classic"]).default("advanced"),
    modifierLayout: z.enum(["columns", "tabs"]).default("columns"),
    filterEffect: z.enum(["cross", "hide"]).default("cross"),
    showTagFilter: z.boolean().default(true),
    showWeightPercentages: z.boolean().default(true),
    compact: z.boolean().default(false),
});
type Preferences = z.infer<typeof preferencesSchema>;
export type ModifierLayout = Preferences["modifierLayout"];
export type FilterEffect = Preferences["filterEffect"];
const defaults = preferencesSchema.parse({});
const storageKey = "poe-boats:crafting:display";

export const CraftingDisplay = createContext({ advanced: true, compact: false });

function loadPreferences() {
    try {
        return preferencesSchema.parse(JSON.parse(localStorage.getItem(storageKey) ?? "{}"));
    } catch {
        return defaults;
    }
}

export function useDisplayPreferences() {
    const [storageError, setStorageError] = useState(false);
    const [preferences, setPreferences] = useStorageState(
        loadPreferences,
        (value) => {
            try {
                localStorage.setItem(storageKey, JSON.stringify(value));
                setStorageError(false);
            } catch {
                setStorageError(true);
            }
        },
        defaults,
    );
    const [alt, setAlt] = useState(false);
    useEffect(() => {
        function press(event: KeyboardEvent) {
            if (event.key !== "Alt" || event.ctrlKey || event.metaKey || event.repeat) return;
            if (
                event.target instanceof HTMLElement &&
                event.target.closest("input, textarea, [contenteditable='true'], [role='combobox']")
            )
                return;
            event.preventDefault();
            setAlt(true);
        }
        function release(event: KeyboardEvent) {
            if (event.key === "Alt") setAlt(false);
        }
        const reset = () => setAlt(false);
        window.addEventListener("keydown", press);
        window.addEventListener("keyup", release);
        window.addEventListener("blur", reset);
        document.addEventListener("visibilitychange", reset);
        return () => {
            window.removeEventListener("keydown", press);
            window.removeEventListener("keyup", release);
            window.removeEventListener("blur", reset);
            document.removeEventListener("visibilitychange", reset);
        };
    }, []);
    return {
        preferences,
        setPreferences,
        storageError,
        display: {
            advanced: (preferences.itemOutput === "advanced") !== alt,
            compact: preferences.compact,
        },
    };
}

export function DisplaySettings({
    value,
    onChange,
    storageError,
}: {
    value: Preferences;
    onChange: (value: Preferences) => void;
    storageError: boolean;
}) {
    const id = useId();
    const [open, setOpen] = useState(false);
    const outputs = { advanced: "Advanced", classic: "Classic" };
    const layouts = { columns: "Prefix and suffix columns", tabs: "Separate affix tabs" };
    const filters = { cross: "Cross out mismatches", hide: "Hide mismatches" };
    return (
        <div className="flex flex-col gap-3">
            <Button
                variant="outline"
                className="self-start"
                aria-expanded={open}
                aria-controls={`${id}-settings`}
                onClick={() => setOpen((current) => !current)}
            >
                Display settings
            </Button>
            <section
                id={`${id}-settings`}
                aria-label="Crafting display settings"
                hidden={!open}
                className="rounded-lg border border-border bg-card p-4"
            >
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <Field>
                        <FieldLabel htmlFor={`${id}-output`}>Item output</FieldLabel>
                        <Select
                            value={value.itemOutput}
                            items={outputs}
                            onValueChange={(itemOutput) =>
                                itemOutput &&
                                onChange({
                                    ...value,
                                    itemOutput:
                                        preferencesSchema.shape.itemOutput.parse(itemOutput),
                                })
                            }
                        >
                            <SelectTrigger id={`${id}-output`} className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(outputs).map(([key, label]) => (
                                    <SelectItem key={key} value={key}>
                                        {label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FieldDescription>
                            Classic combines matching explicit stats. Hold Alt outside text fields
                            to temporarily switch views.
                        </FieldDescription>
                    </Field>
                    <Field>
                        <FieldLabel htmlFor={`${id}-modifiers`}>Modifier layout</FieldLabel>
                        <Select
                            value={value.modifierLayout}
                            items={layouts}
                            onValueChange={(modifierLayout) =>
                                modifierLayout &&
                                onChange({
                                    ...value,
                                    modifierLayout:
                                        preferencesSchema.shape.modifierLayout.parse(
                                            modifierLayout,
                                        ),
                                })
                            }
                        >
                            <SelectTrigger id={`${id}-modifiers`} className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(layouts).map(([key, label]) => (
                                    <SelectItem key={key} value={key}>
                                        {label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FieldDescription>
                            Columns stack when space is limited. Each side has its own pages.
                        </FieldDescription>
                    </Field>
                    <Field>
                        <FieldLabel htmlFor={`${id}-filter`}>Tag filter behavior</FieldLabel>
                        <Select
                            value={value.filterEffect}
                            items={filters}
                            onValueChange={(filterEffect) =>
                                filterEffect &&
                                onChange({
                                    ...value,
                                    filterEffect:
                                        preferencesSchema.shape.filterEffect.parse(filterEffect),
                                })
                            }
                        >
                            <SelectTrigger id={`${id}-filter`} className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(filters).map(([key, label]) => (
                                    <SelectItem key={key} value={key}>
                                        {label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FieldDescription>Selected targets remain visible.</FieldDescription>
                    </Field>
                    <Field orientation="horizontal">
                        <Checkbox
                            id={`${id}-compact`}
                            checked={value.compact}
                            onCheckedChange={(compact) => onChange({ ...value, compact })}
                        />
                        <FieldLabel htmlFor={`${id}-compact`}>Compact layout</FieldLabel>
                    </Field>
                    <Field orientation="horizontal">
                        <Checkbox
                            id={`${id}-tags`}
                            checked={value.showTagFilter}
                            onCheckedChange={(showTagFilter) =>
                                onChange({ ...value, showTagFilter })
                            }
                        />
                        <FieldLabel htmlFor={`${id}-tags`}>Show tag filter</FieldLabel>
                    </Field>
                    <Field orientation="horizontal">
                        <Checkbox
                            id={`${id}-weights`}
                            checked={value.showWeightPercentages}
                            onCheckedChange={(showWeightPercentages) =>
                                onChange({ ...value, showWeightPercentages })
                            }
                        />
                        <FieldLabel htmlFor={`${id}-weights`}>Show weight percentages</FieldLabel>
                    </Field>
                </div>
            </section>
            {storageError && (
                <Alert variant="destructive">
                    <AlertDescription>
                        Display preferences could not be saved in this browser. The current view
                        still works.
                    </AlertDescription>
                </Alert>
            )}
        </div>
    );
}
