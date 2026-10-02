import { Star, Unplug } from "lucide-react";
import { draftAffixes } from "~/lib/recombinator-tree";
import type { RecombinatorAffix } from "~/schemas/recombinator";

const exclusiveDescription =
    "Exclusive modifier: at most one across each recombination pair in this model.";
const nonNativeDescription =
    "NNN (non-native natural): requires a compatible base. Base-transfer restrictions are not calculated.";

export function ModifierIcons({
    affix,
}: {
    affix: Pick<RecombinatorAffix, "exclusive" | "nonNative">;
}) {
    return (
        <>
            {affix.exclusive ? (
                <span
                    role="img"
                    aria-label="Exclusive modifier"
                    title={exclusiveDescription}
                    className="inline-flex align-middle text-warning"
                >
                    <Star className="size-3.5 fill-current" aria-hidden="true" />
                </span>
            ) : null}
            {affix.nonNative ? (
                <span
                    role="img"
                    aria-label="NNN modifier"
                    title={nonNativeDescription}
                    className="inline-flex align-middle text-mod-implicit"
                >
                    <Unplug className="size-3.5" aria-hidden="true" />
                </span>
            ) : null}
        </>
    );
}

export function ModifierLegend() {
    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5" title={exclusiveDescription}>
                <Star className="size-3.5 fill-current text-warning" />
                Exclusive
            </span>
            <span className="inline-flex items-center gap-1.5" title={nonNativeDescription}>
                <Unplug className="size-3.5 text-mod-implicit" />
                NNN · base-restricted
            </span>
        </div>
    );
}

export function ModifierFlags({
    text,
    onToggle,
}: {
    text: string;
    onToggle: (id: string, flag: "exclusive" | "nonNative", enabled: boolean) => void;
}) {
    const affixes = [...new Map(draftAffixes(text).map((affix) => [affix.id, affix])).values()];
    return affixes.length ? (
        <ul className="space-y-1 text-xs">
            {affixes.map((affix) => (
                <li key={affix.id} className="flex min-w-0 items-center gap-2">
                    <span
                        className="min-w-0 flex-1 truncate text-muted-foreground"
                        title={affix.id}
                    >
                        {affix.id}
                    </span>
                    <button
                        type="button"
                        aria-label={`Exclusive: ${affix.id}`}
                        aria-pressed={affix.exclusive}
                        title={exclusiveDescription}
                        onClick={() => onToggle(affix.id, "exclusive", !affix.exclusive)}
                        className={`rounded p-1.5 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring ${affix.exclusive ? "bg-warning/10 text-warning" : "text-muted-foreground"}`}
                    >
                        <Star className={`size-3.5 ${affix.exclusive ? "fill-current" : ""}`} />
                    </button>
                    <button
                        type="button"
                        aria-label={`NNN: ${affix.id}`}
                        aria-pressed={affix.nonNative}
                        title={nonNativeDescription}
                        onClick={() => onToggle(affix.id, "nonNative", !affix.nonNative)}
                        className={`rounded p-1.5 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring ${affix.nonNative ? "bg-mod-implicit/10 text-mod-implicit" : "text-muted-foreground"}`}
                    >
                        <Unplug className="size-3.5" />
                    </button>
                </li>
            ))}
        </ul>
    ) : null;
}
