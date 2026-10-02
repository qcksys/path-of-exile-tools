import { readFile, writeFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { z } from "zod";
import { MANUAL_VENDOR_RECIPES } from "../app/data/manual-vendor-recipes";
import { VENDOR_RECIPES } from "../app/data/vendor-recipes";
import { readWikiRecipeRows } from "./wiki-recipe-tables";

const WikiPageSchema = z.object({
    parse: z.object({ title: z.string(), revid: z.number(), text: z.object({ "*": z.string() }) }),
});
const EvidenceSchema = z.object({
    checkedAt: z.string(),
    recipes: z.array(
        z.object({
            id: z.string(),
            input: z.string(),
            output: z.string(),
            quantity: z.number(),
            outputQuantity: z.number().optional(),
            revision: z.number(),
            source: z.string(),
            wikiRow: z.array(z.string()).optional(),
        }),
    ),
});
const recipes = [
    ...VENDOR_RECIPES,
    ...MANUAL_VENDOR_RECIPES.map((recipe) => ({ ...recipe, game: "1" as const })),
];
const evidenceFile = new URL("../test/fixtures/vendor-recipes-wiki.json", import.meta.url);
const previous = EvidenceSchema.parse(JSON.parse(await readFile(evidenceFile, "utf8")));
const matches = (
    entry: z.infer<typeof EvidenceSchema>["recipes"][number],
    recipe: (typeof recipes)[number],
) =>
    entry.id === recipe.id &&
    entry.input === recipe.input.name &&
    entry.output === recipe.output.name &&
    entry.quantity === recipe.input.quantity &&
    (entry.outputQuantity ?? 1) === recipe.output.quantity;
const results = process.argv.includes("--resume")
    ? previous.recipes.filter((entry) => recipes.some((recipe) => matches(entry, recipe)))
    : [];
const pending = recipes.filter((recipe) => !results.some((entry) => matches(entry, recipe)));
const failures: string[] = [];
const pages = new Map<string, { title: string; revision: number; rows: string[][] }>();

async function readPage(host: string, title: string) {
    const key = `${host}:${title}`;
    const cached = pages.get(key);
    if (cached) return cached;
    const url = new URL(`https://${host}/w/api.php`);
    url.search = new URLSearchParams({
        action: "parse",
        page: title,
        prop: "text|revid",
        format: "json",
    }).toString();
    let response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    for (let attempt = 0; response.status === 429 && attempt < 5; attempt++) {
        const retryAfter = response.headers.get("retry-after");
        const seconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : 60;
        console.log(`Wiki rate limit; waiting ${seconds}s before retrying ${title}.`);
        await response.body?.cancel();
        for (let remaining = seconds; remaining > 0; remaining -= 60)
            await setTimeout(Math.min(remaining, 60) * 1000);
        response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { parse: page } = WikiPageSchema.parse(await response.json());
    const value = {
        title: page.title,
        revision: page.revid,
        rows: readWikiRecipeRows(page.text["*"]),
    };
    pages.set(key, value);
    await setTimeout(1500);
    return value;
}

for (const recipe of pending) {
    const host = recipe.game === "1" ? "www.poewiki.net" : "www.poe2wiki.net";
    const currency = "category" in recipe && recipe.category === "currency";
    const manual = "conditions" in recipe;
    const purchase = "method" in recipe && recipe.method === "purchase";
    const title = purchase
        ? "Vendor"
        : currency || manual
          ? "Vendor recipe system"
          : recipe.output.name;
    try {
        const page = await readPage(host, title);
        const row = page.rows.find((cells) => {
            if (currency)
                return (
                    (!purchase || recipe.output.quantity === 1) &&
                    cells[0] ===
                        (purchase
                            ? recipe.output.name
                            : `${recipe.output.quantity}x ${recipe.output.name}`) &&
                    cells[1] === `${recipe.input.quantity}x ${recipe.input.name}`
                );
            if (manual)
                return (
                    cells[0]?.replace(/^1x /, "") === recipe.output.name &&
                    cells[1] === `${recipe.input.quantity}x ${recipe.input.name}` &&
                    recipe.output.quantity === 1
                );
            return (
                cells.length === 4 &&
                cells[0] === String(recipe.input.quantity) &&
                cells[1] === recipe.input.name &&
                /^(Vendor recipe|Reforging Bench recipe)$/.test(cells[2]) &&
                recipe.output.quantity === 1
            );
        });
        if (!row || page.title !== title)
            throw new Error("No matching wiki recipe or purchase row");
        results.push({
            id: recipe.id,
            input: recipe.input.name,
            output: recipe.output.name,
            quantity: recipe.input.quantity,
            outputQuantity: recipe.output.quantity,
            revision: page.revision,
            source: `https://${host}/w/index.php?title=${encodeURIComponent(page.title)}&oldid=${page.revision}`,
            wikiRow: row,
        });
        results.sort((a, b) => a.id.localeCompare(b.id));
        await writeFile(
            evidenceFile,
            `${JSON.stringify({ checkedAt: new Date().toISOString(), recipes: results }, null, 4)}\n`,
        );
        console.log(`Confirmed ${results.length}/${recipes.length}: ${recipe.id}`);
    } catch (error) {
        failures.push(`${recipe.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
} else {
    console.log(
        `Verified all ${recipes.length} recipes against wiki recipe and vendor purchase tables.`,
    );
}
