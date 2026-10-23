import { createHash } from "node:crypto";
import { type ItemCondition, itemQuerySchema } from "@poe-tools/item-query";
import type { MarketCohort } from "@poe-tools/market";
import type { CraftingEngine } from "../app/lib/crafting-engine";
import { createCraftingItemQuery } from "../app/lib/crafting-item-query";
import { craftingPresets, projectFromPreset } from "../app/lib/crafting-presets";
import type { CraftingRuleset } from "../app/schemas/crafting-rulesets";

export function craftingPresetCohorts(engine: CraftingEngine, ruleset: CraftingRuleset) {
    const cohorts = new Map<string, MarketCohort>();
    const queries = createCraftingItemQuery(engine);
    const influences = ["shaper", "elder", "crusader", "redeemer", "hunter", "warlord"];
    for (const preset of craftingPresets.filter((entry) => entry.game === engine.catalog.game)) {
        const graph = projectFromPreset(engine, ruleset, preset.id);
        for (const node of graph.nodes) {
            if (node.kind !== "acquire") continue;
            for (const alternative of node.alternatives) {
                if (alternative.kind !== "purchase") continue;
                const { item } = alternative;
                const record = queries.record(item);
                const base = engine.base(item);
                const filters: ItemCondition[] = [
                    { kind: "base", field: "baseType", values: [base.name] },
                    ...(record.facts.baseTypeAmbiguous
                        ? [
                              {
                                  kind: "base" as const,
                                  field: "baseId" as const,
                                  values: [item.baseId],
                              },
                          ]
                        : []),
                    { kind: "rarity", values: [record.item.rarity!] },
                    { kind: "range", field: "ilvl", value: { min: item.level, max: item.level } },
                    ...(["prefixes", "suffixes"] as const).map((field) => ({
                        kind: "range" as const,
                        field,
                        value: { min: record.facts[field]!, max: record.facts[field]! },
                    })),
                    { kind: "flag", field: "identified", value: true },
                    ...(["corrupted", "mirrored", "fractured", "synthesised"] as const).map(
                        (field) => ({ kind: "flag" as const, field, value: false }),
                    ),
                    ...influences
                        .filter((name) => record.item.influences?.[name])
                        .map((name) => ({ kind: "influence" as const, values: [name] })),
                    ...item.mods.map((mod): ItemCondition => {
                        const side = engine.mod(mod.id).generation_type;
                        return {
                            kind: "mod" as const,
                            ids: [mod.id],
                            ...(side === "prefix" || side === "suffix" ? { side } : {}),
                            fractured: mod.fractured,
                            crafted: mod.crafted,
                            count: { min: 1 },
                        };
                    }),
                ];
                const absent = influences.filter((name) => !record.item.influences?.[name]);
                const query = itemQuerySchema.parse({
                    game: graph.game,
                    groups: [
                        { type: "and", filters },
                        ...(absent.length
                            ? [{ type: "not", filters: [{ kind: "influence", values: absent }] }]
                            : []),
                    ],
                });
                const id = `preset:${createHash("sha256").update(JSON.stringify(query)).digest("hex")}`;
                if (cohorts.has(id)) continue;
                cohorts.set(id, {
                    id,
                    name: `${base.name}, ilvl ${item.level}, ${alternative.name}`,
                    purpose: item.mods.length ? "isolated-modifier" : "base",
                    query,
                });
            }
        }
    }
    return [...cohorts.values()];
}
