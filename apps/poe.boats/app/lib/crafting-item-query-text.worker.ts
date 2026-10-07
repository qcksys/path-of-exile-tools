import { craftingCatalogSchema } from "../schemas/crafting";
import { craftingItemQueryTextInputSchema } from "../schemas/crafting-item-query-text";
import { CraftingEngine } from "./crafting-engine";
import { queriesFromItemText } from "./crafting-item-query-text";
import {
    CRAFTING_RULESET_INDEX_URL,
    craftingCatalogUrl,
    resolveRuleset,
    validateRulesetIndex,
    verifyCraftingArtifact,
} from "./crafting-rulesets";

self.onmessage = async ({ data }: MessageEvent<unknown>) => {
    try {
        const input = craftingItemQueryTextInputSchema.parse(data);
        const response = await fetch(CRAFTING_RULESET_INDEX_URL, { cache: "no-cache" });
        if (!response.ok) throw new Error("Crafting revisions are unavailable.");
        const ruleset = resolveRuleset(
            validateRulesetIndex(await response.json()),
            input.game,
            input.ruleset,
        );
        const source = await fetch(craftingCatalogUrl(ruleset), { cache: "force-cache" });
        if (!source.ok) throw new Error("The retained item catalog is unavailable.");
        const bytes = new Uint8Array(await source.arrayBuffer());
        await verifyCraftingArtifact(bytes, ruleset.catalog);
        const catalog = craftingCatalogSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
        if (
            catalog.game !== input.game ||
            catalog.manifestSha256 !== ruleset.manifestSha256 ||
            catalog.craftingSha256 !== ruleset.craftingSha256
        )
            throw new Error("The item catalog does not match the selected revision.");
        self.postMessage({
            result: queriesFromItemText(new CraftingEngine(catalog), input.text, input.selection),
        });
    } catch (error) {
        self.postMessage({
            error: error instanceof Error ? error.message : "Cannot resolve this item text.",
        });
    }
};
