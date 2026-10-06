import { Button } from "~/components/ui/button";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { availableOmens } from "~/lib/crafting-omens";
import type { CraftingItem } from "~/schemas/crafting";
import { modText } from "./item-card";

export function RevealPanel({
    engine,
    item,
    onReveal,
    onReroll,
    onChoose,
    onSelect,
}: {
    engine: CraftingEngine;
    item: CraftingItem;
    onReveal: (omens: string[]) => void;
    onReroll: () => void;
    onChoose: (id: string) => void;
    onSelect: (index: number) => void;
}) {
    if (!item.reveal) return null;
    const selectable = new Set(
        item.reveal.choices.length ? engine.selectableRevealChoices(item) : [],
    );
    const omens = availableOmens(engine.catalog, { kind: "reveal", preferred: [] });
    const appliedOmens = engine.catalog.crafting.currencies.filter((entry) =>
        item.reveal?.omens?.includes(entry.id),
    );
    return (
        <section
            aria-label="Reveal modifier"
            className="space-y-3 rounded-lg border border-violet-500/30 bg-violet-500/5 p-4"
        >
            <h2 className="font-semibold">
                {engine.catalog.game === "poe1" ? "Unveil modifier" : "Reveal desecrated modifier"}
            </h2>
            {item.putrefied ? (
                <>
                    <p className="text-xs text-muted-foreground">
                        {engine.unrevealedCount(item)} unrevealed modifiers remain. Putrefaction
                        ignores the bone's tier floor and special pool.
                    </p>
                    <fieldset className="flex flex-wrap gap-2">
                        <legend className="sr-only">Unrevealed affixes</legend>
                        {item.mods.map((entry, index) =>
                            engine.mod(entry.id).domain === "veiled" ? (
                                <Button
                                    // biome-ignore lint/suspicious/noArrayIndexKey: Affix slots stay fixed while revealing.
                                    key={`${entry.id}:${index}`}
                                    variant={item.reveal?.index === index ? "default" : "outline"}
                                    size="xs"
                                    disabled={Boolean(item.reveal?.choices.length)}
                                    aria-pressed={item.reveal?.index === index}
                                    onClick={() => onSelect(index)}
                                >
                                    Affix {index + 1} · {engine.mod(entry.id).generation_type}
                                </Button>
                            ) : null,
                        )}
                    </fieldset>
                </>
            ) : null}
            {engine.catalog.game === "poe2" ? (
                <p className="text-xs text-muted-foreground">
                    The reference model requests 1, 2 or 3 Abyss-exclusive choices with 80%, 15% or
                    5% probability, then fills up to three with ordinary modifiers. Altered bones
                    include Breach outcomes in that fill pool. Each pool uses client weights;
                    insufficient eligible groups can shorten the offer. A Lich guarantee counts
                    within the exclusive choices when its tag has an eligible modifier. Otherwise,
                    choices come from the remaining pools. These source probabilities are modeled,
                    not extracted or verified server values.
                </p>
            ) : null}
            {item.reveal.mark ? (
                <p
                    role="note"
                    className="text-xs text-muted-foreground"
                    aria-label="Abyssal Mark reveal"
                >
                    Replaced the Mark of the Abyssal Lord. Minimum modifier level:{" "}
                    {engine.revealMinimumLevel(item)}. The reference model uses the higher of the
                    bone's minimum and floor(item level × 0.4). This restriction also applies to
                    rerolled choices.
                </p>
            ) : null}
            {appliedOmens.length ? (
                <p className="text-xs text-muted-foreground">
                    Applied during desecration: {appliedOmens.map((entry) => entry.name).join(", ")}
                    . These effects also apply when rerolling the choices.
                </p>
            ) : null}
            {item.reveal.choices.length ? (
                <>
                    <p className="text-sm text-muted-foreground">
                        Choose one of these modifiers to keep. Other crafts retain these offers
                        while the veiled modifier survives. Choices blocked by the current item are
                        disabled.
                    </p>
                    {item.reveal.choices.map((id, index) => (
                        <Button
                            key={id}
                            variant="outline"
                            className="h-auto w-full justify-start whitespace-pre-line py-3 text-left"
                            disabled={!selectable.has(id)}
                            title={
                                selectable.has(id)
                                    ? undefined
                                    : "This choice conflicts with the current item."
                            }
                            onClick={() => onChoose(id)}
                        >
                            {index + 1}. {modText(engine.mod(id))}
                        </Button>
                    ))}
                    {item.reveal.echoes ? (
                        <>
                            <Button
                                variant="outline"
                                onClick={onReroll}
                                disabled={!item.reveal.echoes.remaining}
                            >
                                Reroll reveal choices
                            </Button>
                            <p className="text-xs text-muted-foreground">
                                {item.reveal.echoes.remaining
                                    ? "One reroll is available. It replaces all current choices."
                                    : "The reveal reroll has been used. Choose a modifier to keep."}
                            </p>
                        </>
                    ) : null}
                </>
            ) : !engine.revealPool(item).length ? (
                <p role="status" className="text-sm text-muted-foreground">
                    No eligible reveal choices for this affix at the current item level and modifier
                    groups. The hidden modifier remains on the item. Completed crafting and spending
                    are retained; use Undo to return to an earlier state.
                </p>
            ) : (
                <>
                    <p className="text-sm text-muted-foreground">
                        Reveal up to three eligible choices. Existing modifier groups block matching
                        outcomes.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={() => onReveal([])}>Reveal choices</Button>
                        {omens.map((omen) => (
                            <Button
                                key={omen.id}
                                variant="outline"
                                className="h-auto whitespace-normal text-left"
                                onClick={() => onReveal([omen.id])}
                            >
                                Reveal with {omen.name}
                            </Button>
                        ))}
                    </div>
                    {omens.length ? (
                        <p className="text-xs text-muted-foreground">
                            Using an omen consumes it when choices are first revealed, even if you
                            keep a choice without rerolling.
                        </p>
                    ) : null}
                </>
            )}
        </section>
    );
}
