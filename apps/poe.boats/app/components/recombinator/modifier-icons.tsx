import { Star, Unplug, X } from "lucide-react";
import { Button } from "~/components/ui/button";
import { draftAffixes } from "~/lib/recombinator-tree";
import { cn } from "~/lib/utils";
import type { RecombinatorAffix } from "~/schemas/recombinator";

const exclusiveDescription =
    "Exclusive modifier: at most one survives. Opposite-side crafts use estimated odds; multiple exclusives on the same side are unsupported.";
const nonNativeDescription =
    "NNN (non-native natural): counts toward the pool, then is excluded. This manual flag excludes the mod on every base; catalog base restrictions are automatic.";

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
    selected = [],
    onToggle,
    onRemove,
}: {
    text?: string;
    selected?: RecombinatorAffix[];
    onToggle: (id: string, flag: "exclusive" | "nonNative", enabled: boolean) => void;
    onRemove?: (id: string) => void;
}) {
    const affixes = [
        ...new Map(
            [...draftAffixes(text ?? ""), ...selected].map((affix) => [affix.id, affix]),
        ).values(),
    ];
    return affixes.length ? (
        <ul className="flex flex-col gap-1 text-xs">
            {affixes.map((affix) => (
                <li key={affix.id} className="flex min-w-0 items-center gap-2">
                    <span
                        className={cn(
                            "min-w-0 flex-1",
                            !onRemove && "truncate text-muted-foreground",
                        )}
                        title={affix.label ?? affix.id}
                    >
                        {affix.label ?? affix.id}
                    </span>
                    <Button
                        variant={affix.exclusive ? "secondary" : "ghost"}
                        size="icon-xs"
                        type="button"
                        aria-label={`Exclusive: ${affix.label ?? affix.id}`}
                        aria-pressed={affix.exclusive}
                        title={exclusiveDescription}
                        onClick={() => onToggle(affix.id, "exclusive", !affix.exclusive)}
                    >
                        <Star
                            data-icon="inline-start"
                            className={cn(affix.exclusive && "fill-current")}
                        />
                    </Button>
                    <Button
                        variant={affix.nonNative ? "secondary" : "ghost"}
                        size="icon-xs"
                        type="button"
                        aria-label={`NNN: ${affix.label ?? affix.id}`}
                        aria-pressed={affix.nonNative}
                        title={nonNativeDescription}
                        onClick={() => onToggle(affix.id, "nonNative", !affix.nonNative)}
                    >
                        <Unplug data-icon="inline-start" />
                    </Button>
                    {onRemove ? (
                        <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Remove ${affix.label ?? affix.id}`}
                            onClick={() => onRemove(affix.id)}
                        >
                            <X />
                        </Button>
                    ) : null}
                </li>
            ))}
        </ul>
    ) : null;
}
