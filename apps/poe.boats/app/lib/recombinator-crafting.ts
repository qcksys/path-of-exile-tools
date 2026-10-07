import type { z } from "zod";
import type { CraftingItem } from "../schemas/crafting";
import type { RecombinatorCatalog } from "../schemas/recombinator-catalog";
import type { recombinatorCraftingInputSchema } from "../schemas/recombinator-crafting";
import type { CraftingEngine, CraftingRandom } from "./crafting-engine";
import { catalogBaseOptions } from "./recombinator-catalog";
import { parseRecombinatorDraft } from "./recombinator-plan";

export function materializeRecombinatorInput(
    engine: CraftingEngine,
    catalog: RecombinatorCatalog,
    input: z.infer<typeof recombinatorCraftingInputSchema>,
): CraftingItem {
    if (
        engine.catalog.game !== "poe1" ||
        input.source.patch !== catalog.patch ||
        input.source.patch !== engine.catalog.patch ||
        input.source.manifestSha256 !== catalog.source.manifestSha256 ||
        input.source.manifestSha256 !== engine.catalog.manifestSha256 ||
        input.source.craftingSha256 !== catalog.source.craftingDataSha256 ||
        input.source.craftingSha256 !== engine.catalog.craftingSha256
    )
        throw new Error(
            "Reload matching recombinator and crafting catalogs before transferring this input.",
        );
    const selection = input.selection;
    if (!selection.catalog || selection.prefixes.trim() || selection.suffixes.trim())
        throw new Error(
            "Choose catalog modifiers and resolve custom modifier text before transferring this input.",
        );
    const chosen = catalogBaseOptions(catalog.bases).find(
        (base) => base.id === selection.catalog!.base.id,
    );
    const concrete = catalog.bases.find((base) => base.id === input.baseId);
    if (
        !chosen ||
        !concrete ||
        (chosen.id.startsWith("generic:")
            ? chosen.itemClass !== concrete.itemClass ||
              !chosen.tags.every((tag) => concrete.tags.includes(tag))
            : chosen.id !== concrete.id)
    )
        throw new Error("Choose a concrete base in the selected recombinator category.");
    const modifiers = [...selection.catalog.prefixes, ...selection.catalog.suffixes];
    for (const affix of modifiers) {
        const mod = catalog.mods.find((entry) => `poe1:${entry.id}` === affix.id);
        if (
            !mod ||
            affix.nonNative ||
            affix.exclusive !== Boolean(mod.exclusive) ||
            Boolean(affix.crafted) !== Boolean(mod.crafted)
        )
            throw new Error(
                "Manual exclusivity or non-native flags are probability assumptions, not item properties. Restore catalog flags before transferring.",
            );
    }
    parseRecombinatorDraft(
        {
            items: [
                { ...selection, id: "left" },
                { ...selection, id: "right" },
            ],
            steps: [{ id: "check", name: "Validate input", left: "left", right: "right" }],
        },
        catalog,
    );
    if (input.rarity === "normal" && modifiers.length)
        throw new Error("Normal items cannot have explicit modifiers; choose Magic or Rare.");
    const random: CraftingRandom = {
        integer: (min, max) => (input.rolls === "minimum" ? min : max),
        pick: (choices) => {
            const selected = choices.find((choice) => choice.weight > 0);
            if (!selected) throw new Error("No valid roll is available.");
            return selected.value;
        },
    };
    let item: CraftingItem = {
        ...engine.createItem(concrete.id, selection.catalog.level),
        rarity: input.rarity,
    };
    item.implicits = item.implicits.map((mod) => engine.rollMod(mod.id, random));
    for (const affix of modifiers)
        item = engine.addStartingMod(item, affix.id.slice("poe1:".length), random);
    return engine.validateItem(item);
}
