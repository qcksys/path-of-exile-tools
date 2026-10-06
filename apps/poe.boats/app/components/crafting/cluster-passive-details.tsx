import { clusterModPassives } from "~/lib/crafting-clusters";
import { cleanModText } from "~/lib/crafting-text";
import type { CraftingCatalog, CraftingMod } from "~/schemas/crafting";

export function ClusterPassiveDetails({
    catalog,
    mod,
    values,
}: {
    catalog: CraftingCatalog;
    mod: CraftingMod;
    values?: number[];
}) {
    return clusterModPassives(catalog, mod, values).map((passive) => (
        <details key={passive.id} className="mt-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer">{passive.name} passive effects</summary>
            <p className="mt-2 whitespace-pre-line">{cleanModText(passive.text!)}</p>
            <p className="mt-2">Applies when allocated on the passive tree.</p>
        </details>
    ));
}
