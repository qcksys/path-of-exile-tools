import { useMemo } from "react";
import { type ModifierChange, modifierChanges } from "~/lib/crafting-changes";
import { eldritchLabel } from "~/lib/crafting-eldritch";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { modifierLevelText, modifierTiers } from "~/lib/crafting-modifier-details";
import { grantedPassive } from "~/lib/crafting-passives";
import { cleanModText, rolledModText } from "~/lib/crafting-text";
import type { CraftingItem, RolledMod } from "~/schemas/crafting";

export function LastChanges({
    engine,
    before,
    after,
}: {
    engine: CraftingEngine;
    before: CraftingItem;
    after: CraftingItem;
}) {
    const changes = useMemo(() => modifierChanges(engine, before, after), [engine, before, after]);
    const ranks = useMemo(() => {
        if (!changes.length) return [];
        return [before, after].map((item) => ({
            ordinary: modifierTiers(engine, item.baseId, "ordinary", item.cluster),
            essence: modifierTiers(engine, item.baseId, "essence", item.cluster),
        }));
    }, [engine, before, after, changes]);
    function description(rolled: RolledMod, kind: ModifierChange["kind"], previous: boolean) {
        const item = previous ? before : after;
        const mod = engine.mod(rolled.id);
        const source = rolled.attributeSource ?? rolled.conversion?.source ?? rolled.id;
        const essence = rolled.essence || engine.mod(source).is_essence_only;
        const tier = ranks[previous ? 0 : 1]![essence ? "essence" : "ordinary"].get(source);
        const text = rolledModText(engine.catalog, rolled, item);
        return (
            <div className="space-y-1">
                <p className="whitespace-pre-line text-sm">
                    {mod.domain === "veiled"
                        ? `Unrevealed ${mod.generation_type}`
                        : cleanModText(text ?? mod.text ?? mod.name) || "No displayed stats"}
                </p>
                <p className="text-xs text-muted-foreground">
                    {kind === "enchantments"
                        ? "Enchantment"
                        : kind === "implicits"
                          ? (eldritchLabel(mod) ?? "Implicit")
                          : mod.generation_type}
                    {` · ${mod.name} · ${modifierLevelText(engine, rolled.id)}`}
                    {tier === undefined ? "" : ` · Tier ${tier}`}
                    {essence ? " · essence" : ""}
                    {mod.implicit_tags.length ? ` · Tags: ${mod.implicit_tags.join(", ")}` : ""}
                    {rolled.crafted ? " · crafted" : ""}
                    {rolled.fractured ? " · fractured" : ""}
                    {engine.isDesecrated(rolled) ? " · desecrated" : ""}
                    {rolled.sanctification === undefined
                        ? ""
                        : ` · Sanctification ${rolled.sanctification}%`}
                    {rolled.corruptionScale === undefined
                        ? ""
                        : ` · Corruption value roll ${rolled.corruptionScale}%`}
                    {rolled.origin
                        ? ` · ${rolled.origin.kind === "beast" ? "beast" : "donor"} level ${rolled.origin.level}`
                        : ""}
                    {rolled.attributeSource ? " · Genteel attribute conversion" : ""}
                </p>
                {rolled.grantedPassive ? (
                    <p className="whitespace-pre-line text-xs text-muted-foreground">
                        {cleanModText(
                            grantedPassive(engine.catalog, rolled.grantedPassive).text ??
                                "No translated passive description in this build.",
                        )}
                    </p>
                ) : null}
            </div>
        );
    }
    return (
        <section aria-label="Last changes" className="rounded-lg border border-border p-4">
            <h2 className="text-sm font-medium">Last changes</h2>
            <p className="mt-1 text-xs text-muted-foreground">
                Modifier differences from the preceding item state.
            </p>
            {after.destroyed && !before.destroyed ? (
                <p className="mt-3 text-sm">Item destroyed.</p>
            ) : null}
            {changes.length ? (
                <ul className="mt-3 space-y-4">
                    {changes.map((change) => (
                        <li key={change.key} className="space-y-2">
                            <p className="text-xs font-medium">
                                {change.before ? (change.after ? "Changed" : "Removed") : "Added"}
                            </p>
                            {change.before ? (
                                <div>
                                    {change.after ? (
                                        <p className="mb-1 text-xs text-muted-foreground">Before</p>
                                    ) : null}
                                    {description(change.before, change.kind, true)}
                                </div>
                            ) : null}
                            {change.after ? (
                                <div>
                                    {change.before ? (
                                        <p className="mb-1 text-xs text-muted-foreground">After</p>
                                    ) : null}
                                    {description(change.after, change.kind, false)}
                                </div>
                            ) : null}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="mt-3 text-sm text-muted-foreground">No modifier changes.</p>
            )}
        </section>
    );
}
