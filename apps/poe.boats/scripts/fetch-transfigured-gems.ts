import { writeFile } from "node:fs/promises";
import { z } from "zod";

const URL_ITEMS = "https://www.pathofexile.com/api/trade/data/items";

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

// The trade site lists a transfigured gem under its base gem's type, with its own text and a
// discriminator: `Kinetic Bolt of Fragmentation`, or `Vaal Arc (Arc of Surging)` for a Vaal gem.
const response = await fetch(URL_ITEMS, {
    headers: { "User-Agent": "poe.boats transfigured gem generator", Accept: "application/json" },
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
console.log(`poe1: ${Object.keys(transfigured).length} transfigured gems`);
await writeFile(
    new URL("../../../packages/poe-market/data/transfigured-gems-poe1.json", import.meta.url),
    `${JSON.stringify({ fetchedAt: new Date().toISOString(), source: URL_ITEMS, gems: transfigured }, null, 4)}\n`,
);
