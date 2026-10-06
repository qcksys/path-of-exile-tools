import type { CraftingItem } from "../schemas/crafting";
import type { CraftingEngine } from "./crafting-engine";
import { modifierFamily } from "./crafting-memory";
import { modifierTiers } from "./crafting-modifier-details";

export type AffixDistribution = {
    key: string;
    modId: string;
    side: "prefix" | "suffix";
    essence: boolean;
    count: number;
    items: number;
    tierTotal: number;
    ranked: number;
};

export class CraftingAffixDistribution {
    private rows = new Map<string, AffixDistribution>();
    private tiers = new Map<string, Map<string, number>>();

    constructor(private engine: CraftingEngine) {}

    add(item: CraftingItem) {
        if (item.destroyed) return;
        const seen = new Set<string>();
        for (const rolled of item.mods) {
            const mod = this.engine.mod(rolled.id);
            const side = mod.generation_type;
            if ((side !== "prefix" && side !== "suffix") || mod.domain === "veiled") continue;
            const source = rolled.attributeSource ?? rolled.conversion?.source ?? rolled.id;
            const essence = Boolean(rolled.essence || this.engine.mod(source).is_essence_only);
            const key = JSON.stringify([
                modifierFamily(mod),
                this.engine.catalog.crafting.modRules[rolled.id]?.influence ?? null,
                mod.stats.map((stat) => stat.id),
                essence,
            ]);
            const tierKey = JSON.stringify([item.baseId, item.cluster?.passive, essence]);
            let tiers = this.tiers.get(tierKey);
            if (!tiers) {
                tiers = modifierTiers(
                    this.engine,
                    item.baseId,
                    essence ? "essence" : "ordinary",
                    item.cluster,
                );
                this.tiers.set(tierKey, tiers);
            }
            const tier = tiers.get(source);
            const row = this.rows.get(key) ?? {
                key,
                modId: rolled.id,
                side,
                essence,
                count: 0,
                items: 0,
                tierTotal: 0,
                ranked: 0,
            };
            row.count++;
            if (!seen.has(key)) row.items++;
            if (tier !== undefined) {
                row.tierTotal += tier;
                row.ranked++;
            }
            seen.add(key);
            this.rows.set(key, row);
        }
    }

    result() {
        return [...this.rows.values()].map((row) => ({ ...row }));
    }
}
