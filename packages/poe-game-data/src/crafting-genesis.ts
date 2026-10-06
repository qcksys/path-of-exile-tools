import type { CraftingData } from "./crafting-data-model.ts";
import type { StatValue } from "./model.ts";
import { passiveGraphNodes } from "./passive-graph.ts";
import type { AssetSource } from "./source.ts";
import type { Tables } from "./tables.ts";

export function genesisEffect(stat: StatValue) {
    if (stat.id === "brequel_equipment_fruit_mod_tier_rating_+")
        return { kind: "tier" as const, value: stat.min };
    const match = /^brequel_equipment_fruit_(\w+)_modifier_chance_\+%$/.exec(stat.id);
    if (match)
        return {
            kind: "weight" as const,
            tag: match[1] === "defence" ? "defences" : match[1]!,
            value: stat.min,
        };
}

export function genesisItemClasses(passives: { stats: StatValue[] }[], classes: string[]) {
    const categories = new Set(
        passives.flatMap((passive) =>
            passive.stats.flatMap((stat) => {
                const match = /^brequel_equipment_fruit_(\w+)_chance_\+%$/.exec(stat.id);
                return match ? [match[1]!.replace(/s$/, "")] : [];
            }),
        ),
    );
    return classes
        .filter((id) => categories.has(id.toLowerCase().replaceAll(" ", "_").replace(/s$/, "")))
        .sort();
}

export async function extractGenesis(
    tables: Tables,
    source: AssetSource,
): Promise<CraftingData["genesis"]> {
    if (tables.game !== "poe1") return null;
    const tree = tables.rows("PassiveSkillTrees").find((row) => row.id() === "BrequelTree");
    const equipment = tables.rows("BrequelPassiveSubTrees").find((row) => row.id() === "Equipment");
    const fruit = equipment?.ref("Wombgift")?.id();
    const name = tree?.ref("Name")?.string("Text");
    if (!tree || !equipment || !fruit || !name)
        throw new Error("Missing Genesis equipment tree records.");
    const asset = `${tree.string("PassiveSkillGraph")}.psg`;
    const active = passiveGraphNodes(await source.get(asset));
    const passives = Object.fromEntries(
        tables
            .rows("PassiveSkills")
            .filter(
                (row) =>
                    row.ref("BrequelSubTree")?.id() === equipment.id() &&
                    row.string("Name") &&
                    active.has(row.number("PassiveSkillGraphId")),
            )
            .map((row) => [
                row.id(),
                {
                    name: row.string("Name"),
                    hash: row.number("PassiveSkillGraphId"),
                    notable: row.boolean("IsNotable"),
                    stats: row.refs("Stats").map((stat, index) => ({
                        id: stat.id(),
                        min: row.number(`Stat${index + 1}Value`),
                        max: row.number(`Stat${index + 1}Value`),
                    })),
                    text: null,
                },
            ]),
    );
    return {
        name,
        fruit,
        asset,
        passives,
        itemClasses: genesisItemClasses(
            Object.values(passives),
            tables.rows("ItemClasses").map((row) => row.id()),
        ),
    };
}
