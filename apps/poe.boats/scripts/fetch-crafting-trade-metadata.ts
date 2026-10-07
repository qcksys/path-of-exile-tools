import { writeFile } from "node:fs/promises";
import { z } from "zod";

const filtersSchema = z.object({
    result: z.array(
        z.object({
            id: z.string(),
            filters: z.array(
                z.object({
                    id: z.string(),
                    option: z
                        .object({
                            options: z
                                .array(z.object({ id: z.string().nullable(), text: z.string() }))
                                .optional(),
                        })
                        .optional(),
                }),
            ),
        }),
    ),
});
const statsSchema = z.object({
    result: z.array(
        z.object({
            entries: z.array(
                z.object({ id: z.string(), text: z.string(), option: z.unknown().optional() }),
            ),
        }),
    ),
});

async function read(url: string) {
    const response = await fetch(url, {
        headers: { "User-Agent": "poe.boats trade metadata generator", Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return response.json();
}

for (const game of ["poe1", "poe2"] as const) {
    const root = `https://www.pathofexile.com/api/${game === "poe1" ? "trade" : "trade2"}/data`;
    const filters = filtersSchema.parse(await read(`${root}/filters`));
    const stats = statsSchema.parse(await read(`${root}/stats`));
    const metadata = {
        game,
        fetchedAt: new Date().toISOString(),
        sources: [`${root}/filters`, `${root}/stats`],
        filters: Object.fromEntries(
            filters.result.flatMap((group) =>
                group.filters.map((filter) => [
                    filter.id,
                    {
                        group: group.id,
                        options: filter.option?.options?.filter((entry) => entry.id !== null),
                    },
                ]),
            ),
        ),
        stats: Object.fromEntries(
            stats.result.flatMap((group) =>
                group.entries
                    .filter((entry) => !entry.option)
                    .map((entry) => [entry.id, entry.text]),
            ),
        ),
    };
    await writeFile(
        new URL(`../app/data/crafting-trade-${game}.json`, import.meta.url),
        `${JSON.stringify(metadata)}\n`,
    );
    console.log(
        `${game}: ${Object.keys(metadata.filters).length} filters, ${Object.keys(metadata.stats).length} numeric stats`,
    );
}
