import { readFile, writeFile } from "node:fs/promises";
import { basesSchema, readTradeStatic, tradeEntryBaseId, tradeStaticUrl } from "./trade-static";

const output: Record<string, unknown> = { fetchedAt: new Date().toISOString(), sources: [] };
for (const game of ["poe1", "poe2"] as const) {
    const url = tradeStaticUrl(game);
    const currency = (await readTradeStatic(url, "poe.boats listing currency generator")).find(
        (group) => group.id === "Currency",
    );
    if (!currency) throw new Error(`${url}: no Currency group`);
    const bases = Object.entries(
        basesSchema.parse(
            JSON.parse(
                await readFile(
                    new URL(
                        `../../../packages/poe-${game.slice(3)}-data/data/base_items/StackableCurrency.json`,
                        import.meta.url,
                    ),
                    "utf8",
                ),
            ),
        ),
    );
    const ids: Record<string, string> = {};
    const unresolved: string[] = [];
    for (const entry of currency.entries) {
        if (entry.id === "sep") continue;
        const id = tradeEntryBaseId(entry, bases);
        if (id) ids[entry.id] = id;
        else unresolved.push(entry.id);
    }
    if (unresolved.length) throw new Error(`${game}: unresolved ${unresolved.join(", ")}`);
    (output.sources as string[]).push(url);
    output[game] = ids;
    console.log(`${game}: ${Object.keys(ids).length} listing currencies`);
}
await writeFile(
    new URL("../../../packages/poe-market/data/listing-currencies.json", import.meta.url),
    `${JSON.stringify(output, null, 4)}\n`,
);
