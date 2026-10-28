import { readFile, writeFile } from "node:fs/promises";
import type { Poe2ExchangeCategory } from "../app/lib/market-categories";
import { basesSchema, readTradeStatic, tradeEntryBaseId, tradeStaticUrl } from "./trade-static";

/** The PoE 2 category of each trade site bulk exchange group. */
const GROUPS: Record<string, Poe2ExchangeCategory> = {
    Currency: "currency",
    Fragments: "fragments",
    Essences: "essences",
    Runes: "runes",
    Abyss: "abyssal-bones",
    Vaal: "vaal",
    Verisium: "verisium",
    UncutGems: "uncut-gems",
    LineageSupportGems: "lineage-gems",
    Ritual: "ritual",
    Delirium: "delirium",
    Breach: "breach",
    Expedition: "expedition",
};
/** Groups whose items the currency exchange does not trade. */
const IGNORED = new Set(["Waystones", "Misc"]);

const url = tradeStaticUrl("poe2");
const groups = await readTradeStatic(url, "poe.boats exchange category generator");
const unknown = groups.filter(
    (group) => !Object.hasOwn(GROUPS, group.id) && !IGNORED.has(group.id) && group.entries.length,
);
if (unknown.length)
    throw new Error(`${url}: unmapped groups ${unknown.map((group) => group.id).join(", ")}`);
const bases = Object.entries(
    basesSchema.parse(
        JSON.parse(
            await readFile(
                new URL("../../../packages/poe-2-data/data/base_items.json", import.meta.url),
                "utf8",
            ),
        ),
    ),
);
const items: Record<string, Poe2ExchangeCategory> = {};
const unresolved: string[] = [];
for (const group of groups) {
    const category = GROUPS[group.id];
    if (!category) continue;
    for (const entry of group.entries) {
        if (entry.id === "sep" || !entry.text) continue;
        const id = tradeEntryBaseId(entry, bases);
        // Bases sharing a name and art (e.g. Kulemak's Invitation) are the same item to a trader.
        const ids = id
            ? [id]
            : bases.flatMap(([base, { name }]) => (name === entry.text ? base : []));
        for (const base of ids) items[base] = category;
        // Group headings such as "Uncut Support Gems" name no base item.
        if (!ids.length) unresolved.push(entry.text);
    }
}
console.log(
    `poe2: ${Object.keys(items).length} exchange items in ${Object.keys(GROUPS).length} categories`,
);
if (unresolved.length) console.log(`poe2: no single base item for ${unresolved.join(", ")}`);
await writeFile(
    new URL("../app/data/exchange-categories-poe2.json", import.meta.url),
    `${JSON.stringify({ fetchedAt: new Date().toISOString(), source: url, items }, null, 4)}\n`,
);
