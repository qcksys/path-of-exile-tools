import { readFile, writeFile } from "node:fs/promises";
import { isHiddenMapModLine, mapModLineTemplate } from "@poe-tools/market";
import { z } from "zod";

const MODS = new URL("../../../packages/poe-1-data/data/mods.json", import.meta.url);

const modsSchema = z.record(
    z.string(),
    z.object({ domain: z.string(), generation_type: z.string(), text: z.string().nullish() }),
);

// Map prefixes and suffixes whose text shows more than one line on the item, once the quantity,
// rarity, pack size and more-items lines (shown as item properties) are left out.
const mods = modsSchema.parse(JSON.parse(await readFile(MODS, "utf8")));
const templates = new Map<string, string[]>();
for (const mod of Object.values(mods)) {
    if (mod.domain !== "area" || !["prefix", "suffix"].includes(mod.generation_type)) continue;
    const lines = (mod.text ?? "")
        .split("\n")
        .filter((line) => line && !isHiddenMapModLine(line))
        .map(mapModLineTemplate)
        .sort();
    if (lines.length > 1) templates.set(lines.join("\n"), lines);
}
if (!templates.size) throw new Error(`${MODS.pathname}: no multi-line map mods`);
const multiLineMods = [...templates.values()].sort((a, b) =>
    a.join("\n").localeCompare(b.join("\n")),
);

console.log(`poe1: ${multiLineMods.length} multi-line map mods`);
await writeFile(
    new URL("../../../packages/poe-market/data/maps-poe1.json", import.meta.url),
    `${JSON.stringify({ sources: ["packages/poe-1-data/data/mods.json"], multiLineMods }, null, 4)}\n`,
);
