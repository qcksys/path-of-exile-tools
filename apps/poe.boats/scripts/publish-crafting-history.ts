import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { craftingAvailabilitySchema } from "../app/schemas/crafting-rulesets";
import {
    buildCraftingRuntime,
    materializeCraftingHistory,
    materializeCraftingWorker,
    publishCraftingRevision,
} from "./crafting-history";

const configuration = z
    .array(
        z.strictObject({
            game: z.enum(["poe1", "poe2"]),
            era: z.string(),
            revision: z.string(),
            patchPrefix: z.string(),
            label: z.string(),
            notes: z.string(),
            availability: craftingAvailabilitySchema,
        }),
    )
    .parse(JSON.parse(await readFile("crafting-history/releases.json", "utf8")));
const archive = resolve("crafting-history");
const implementation = await buildCraftingRuntime(resolve("."));
for (const { game, patchPrefix, ...metadata } of configuration) {
    const bytes = await readFile(`public/game-data/crafting-${game}.json`);
    const source = z
        .object({ patch: z.string(), game: z.string() })
        .parse(JSON.parse(bytes.toString()));
    if (source.game !== game || !source.patch.startsWith(`${patchPrefix}.`))
        throw new Error(
            "Review the crafting era configuration before publishing a different client era.",
        );
    const published = await publishCraftingRevision(archive, bytes, implementation, metadata);
    console.log(
        `${published.game} ${published.era}/${published.revision}: ${published.catalog.sha256}`,
    );
}
await materializeCraftingHistory(
    archive,
    resolve("public/game-data/history"),
    resolve("app/lib/crafting-runtimes.generated.ts"),
);
await materializeCraftingWorker(resolve("."), resolve("public/game-data/history/worker.mjs"));
