import { type CraftingStep, craftingTargetSchema } from "../schemas/crafting";
import type { CraftingEngine } from "./crafting-engine";

export function craftingSequences(engine: CraftingEngine) {
    const currencies = engine.catalog.crafting.currencies;
    const augment = currencies.find((entry) => entry.action === "add_mod_to_magic");
    const regal = currencies.find((entry) => entry.action === "upgrade_magic_to_rare");
    if (!augment || !regal) return [];
    return currencies
        .filter((entry) => ["transmute_to_magic", "reroll_magic"].includes(entry.action))
        .map((first) => {
            const always = craftingTargetSchema.parse({ groups: [] });
            const steps: CraftingStep[] = [
                {
                    id: "prepare-magic",
                    method: { kind: "currency", id: first.id },
                    condition: always,
                    onSuccess: "check-space",
                    onFailure: "failure",
                },
                {
                    id: "check-space",
                    condition: craftingTargetSchema.parse({
                        groups: [],
                        rarity: "magic",
                        openAffixes: 1,
                    }),
                    onSuccess: "fill-magic",
                    onFailure: "make-rare",
                },
                {
                    id: "fill-magic",
                    method: { kind: "currency", id: augment.id },
                    condition: always,
                    onSuccess: "check-space",
                    onFailure: "failure",
                },
                {
                    id: "make-rare",
                    method: { kind: "currency", id: regal.id },
                    condition: always,
                    onSuccess: "success",
                    onFailure: "failure",
                },
            ];
            return {
                id: first.id,
                name: `${first.name} → ${augment.name} → ${regal.name}`,
                rarity: first.action === "transmute_to_magic" ? "normal" : "magic",
                steps,
            };
        });
}
