import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";

const staticSchema = z.object({
    result: z.array(
        z.object({
            id: z.string(),
            entries: z.array(
                z.object({ id: z.string(), text: z.string(), image: z.string().optional() }),
            ),
        }),
    ),
});
const basesSchema = z.record(
    z.string(),
    z.object({
        name: z.string(),
        visual_identity: z.object({ dds_file: z.string() }).optional(),
    }),
);

async function read(url: string) {
    const response = await fetch(url, {
        headers: {
            "User-Agent": "poe.boats listing currency generator",
            Accept: "application/json",
        },
    });
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return response.json();
}

// Trade images encode the item art path, which separates base items that share a name.
function imageArt(image: string | undefined) {
    const encoded = image?.match(/\/gen\/image\/([^/]+)\//)?.[1];
    if (!encoded) return undefined;
    const [, , options] = JSON.parse(Buffer.from(encoded, "base64url").toString()) as [
        unknown,
        unknown,
        { f?: string },
    ];
    return options.f;
}

const output: Record<string, unknown> = { fetchedAt: new Date().toISOString(), sources: [] };
for (const game of ["poe1", "poe2"] as const) {
    const url = `https://www.pathofexile.com/api/${game === "poe1" ? "trade" : "trade2"}/data/static`;
    const currency = staticSchema
        .parse(await read(url))
        .result.find((group) => group.id === "Currency");
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
        const named = bases.filter(([, base]) => base.name === entry.text);
        const art = imageArt(entry.image);
        const drawn = named.filter(
            ([, base]) => base.visual_identity?.dds_file.replace(/^Art\/|\.dds$/g, "") === art,
        );
        const match = named.length === 1 ? named : drawn;
        if (match.length === 1) ids[entry.id] = match[0]![0];
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
