import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";

const URL_ITEMS = "https://www.pathofexile.com/api/trade/data/items";
const BASE_ITEMS = new URL("../../../packages/poe-1-data/data/base_items.json", import.meta.url);

const itemsSchema = z.object({
    result: z.array(
        z.object({
            id: z.string(),
            entries: z.array(
                z.object({
                    type: z.string(),
                    text: z.string().optional(),
                    disc: z.string().optional(),
                }),
            ),
        }),
    ),
});
const basesSchema = z.record(
    z.string(),
    z.object({ name: z.string(), item_class: z.string(), tags: z.array(z.string()) }),
);

// The trade site lists a transfigured gem under its base gem's type, with its own text and a
// discriminator: `Kinetic Bolt of Fragmentation`, or `Vaal Arc (Arc of Surging)` for a Vaal gem.
const response = await fetch(URL_ITEMS, {
    headers: { "User-Agent": "poe.boats gem list generator", Accept: "application/json" },
});
if (!response.ok) throw new Error(`${URL_ITEMS}: ${response.status}`);
const gems = itemsSchema.parse(await response.json()).result.find((group) => group.id === "gem");
if (!gems) throw new Error(`${URL_ITEMS}: no gem group`);
const transfigured = Object.fromEntries(
    gems.entries
        .flatMap((entry) => (entry.disc && entry.text ? [[entry.text, entry.type] as const] : []))
        .sort(([a], [b]) => a.localeCompare(b)),
);
if (!Object.keys(transfigured).length) throw new Error(`${URL_ITEMS}: no transfigured gems`);

// Vaal gems carry the `vaal_gem` base item tag; Vaal Sacrifice and Vaal Temptation supports do not.
const bases = basesSchema.parse(JSON.parse(await readFile(BASE_ITEMS, "utf8")));
const vaalBases = new Set(
    Object.values(bases).flatMap((base) =>
        base.item_class.endsWith("Gem") && base.tags.includes("vaal_gem") ? [base.name] : [],
    ),
);
if (!vaalBases.size) throw new Error(`${BASE_ITEMS.pathname}: no Vaal gems`);
const vaal = [
    ...vaalBases,
    ...Object.entries(transfigured).flatMap(([key, base]) => (vaalBases.has(base) ? [key] : [])),
].sort((a, b) => a.localeCompare(b));

console.log(
    `poe1: ${Object.keys(transfigured).length} transfigured gems, ${vaal.length} Vaal gem markets`,
);
await writeFile(
    new URL("../../../packages/poe-market/data/gems-poe1.json", import.meta.url),
    `${JSON.stringify(
        {
            fetchedAt: new Date().toISOString(),
            sources: [URL_ITEMS, "packages/poe-1-data/data/base_items.json"],
            transfigured,
            vaal,
        },
        null,
        4,
    )}\n`,
);
