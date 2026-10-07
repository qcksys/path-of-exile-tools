import type { CraftingRuleset } from "../schemas/crafting-rulesets";
import { craftingCatalogUrl, verifyCraftingArtifact } from "./crafting-rulesets";
import type { HistoricalCraftingRuntime } from "./crafting-runtime";

export interface LoadedCraftingRevision {
    catalog: unknown;
    runtime: HistoricalCraftingRuntime;
}

export async function loadCraftingRevision(
    ruleset: CraftingRuleset,
    read: (path: string) => Promise<Uint8Array<ArrayBuffer>>,
    implementation: (ruleset: CraftingRuleset) => Promise<HistoricalCraftingRuntime>,
): Promise<LoadedCraftingRevision> {
    const bytes = await read(craftingCatalogUrl(ruleset));
    await verifyCraftingArtifact(bytes, ruleset.catalog);
    const runtime = await implementation(ruleset);
    if (runtime.revision !== ruleset.engine)
        throw new Error("The retained crafting implementation does not match this revision.");
    return { catalog: JSON.parse(new TextDecoder().decode(bytes)), runtime };
}
