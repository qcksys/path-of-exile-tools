import { writeFile } from "node:fs/promises";
import { z } from "zod";

/** GGG's passive tree export; Forbidden Flame and Flesh roll one of its ascendancy notables. */
const SOURCE = "https://raw.githubusercontent.com/grindinggear/skilltree-export/master/data.json";

const treeSchema = z.object({
    classes: z.array(
        z.object({
            name: z.string(),
            ascendancies: z.array(z.object({ id: z.string(), name: z.string() })),
        }),
    ),
    nodes: z.record(
        z.string(),
        z.object({
            name: z.string().optional(),
            ascendancyName: z.string().optional(),
            isNotable: z.boolean().optional(),
            isAscendancyStart: z.boolean().optional(),
            isMultipleChoiceOption: z.boolean().optional(),
        }),
    ),
});

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`${SOURCE}: HTTP ${response.status}`);
const tree = treeSchema.parse(await response.json());
// Alternate (event league) ascendancies are left out: they belong to no class.
const ascendancies = new Map(
    tree.classes.flatMap((entry) => entry.ascendancies.map(({ id, name }) => [id, name] as const)),
);
const notables: Record<string, string> = {};
for (const node of Object.values(tree.nodes)) {
    const ascendancy = node.ascendancyName && ascendancies.get(node.ascendancyName);
    // The Ascendant's options are named after the other ascendancies, and taken like notables.
    if (!ascendancy || !node.name || node.isAscendancyStart) continue;
    if (!node.isNotable && !node.isMultipleChoiceOption) continue;
    const existing = notables[node.name];
    if (existing && existing !== ascendancy)
        throw new Error(`${node.name} belongs to ${existing} and ${ascendancy}`);
    notables[node.name] = ascendancy;
}
const classes = Object.fromEntries(
    tree.classes.map((entry) => [entry.name, entry.ascendancies.map(({ name }) => name)]),
);
console.log(`poe1: ${Object.keys(notables).length} notables in ${ascendancies.size} ascendancies`);
await writeFile(
    new URL("../app/data/ascendancy-notables-poe1.json", import.meta.url),
    `${JSON.stringify(
        {
            fetchedAt: new Date().toISOString(),
            source: SOURCE,
            classes,
            notables: Object.fromEntries(
                Object.entries(notables).sort(([a], [b]) => a.localeCompare(b)),
            ),
        },
        null,
        4,
    )}\n`,
);
