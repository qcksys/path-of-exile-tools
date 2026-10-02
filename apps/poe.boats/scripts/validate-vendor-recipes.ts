import { readFile, writeFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { parseHTML } from "linkedom";
import { z } from "zod";
import { VENDOR_RECIPES } from "../app/data/vendor-recipes";

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
            revision: z.number(),
            source: z.string(),
        }),
    ),
});
const evidenceFile = new URL("../test/fixtures/vendor-recipes-wiki.json", import.meta.url);
const previous = EvidenceSchema.safeParse(JSON.parse(await readFile(evidenceFile, "utf8")));
const results = process.argv.includes("--resume") && previous.success ? previous.data.recipes : [];
const failures: string[] = [];
const pending = VENDOR_RECIPES.filter(
    (recipe) =>
        !results.some(
            (entry) =>
                entry.id === recipe.id &&
                entry.input === recipe.input.name &&
                entry.output === recipe.output.name &&
                entry.quantity === recipe.input.quantity &&
                recipe.output.quantity === 1,
        ),
);

for (const recipe of pending) {
    const host = recipe.game === "1" ? "www.poewiki.net" : "www.poe2wiki.net";
    const url = new URL(`https://${host}/w/api.php`);
    url.search = new URLSearchParams({
        action: "parse",
        page: recipe.output.name,
        prop: "text|revid",
        format: "json",
    }).toString();
    try {
        let response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        for (let attempt = 0; response.status === 429 && attempt < 5; attempt++) {
            const retryAfter = response.headers.get("retry-after");
            const seconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : 60;
            console.log(`Wiki rate limit; waiting ${seconds}s before retrying ${recipe.id}.`);
            await response.body?.cancel();
            for (let remaining = seconds; remaining > 0; remaining -= 60)
                await setTimeout(Math.min(remaining, 60) * 1000);
            response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const { parse: page } = WikiPageSchema.parse(await response.json());
        const { document } = parseHTML(page.text["*"]);
        const match = [...document.querySelectorAll("tr")].find((row) => {
            const cells = [...row.querySelectorAll("td")];
            return (
                cells.length === 4 &&
                cells[0].textContent.trim() === String(recipe.input.quantity) &&
                [...cells[1].querySelectorAll("a[title]")].some(
                    (link) => link.getAttribute("title") === recipe.input.name,
                ) &&
                /^(Vendor recipe|Reforging Bench recipe)$/.test(cells[2].textContent.trim())
            );
        });
        if (!match || page.title !== recipe.output.name || recipe.output.quantity !== 1)
            throw new Error("No matching deterministic recipe row");
        results.push({
            id: recipe.id,
            input: recipe.input.name,
            output: recipe.output.name,
            quantity: recipe.input.quantity,
            revision: page.revid,
            source: `https://${host}/w/index.php?title=${encodeURIComponent(page.title)}&oldid=${page.revid}`,
        });
        results.sort((a, b) => a.id.localeCompare(b.id));
        await writeFile(
            evidenceFile,
            `${JSON.stringify({ checkedAt: new Date().toISOString(), recipes: results }, null, 4)}\n`,
        );
        console.log(
            `Confirmed ${results.length}/${VENDOR_RECIPES.length}: ${recipe.input.name} → ${recipe.output.name}`,
        );
    } catch (error) {
        failures.push(`${recipe.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    await setTimeout(1500);
}

if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
} else {
    console.log(
        `Verified all ${VENDOR_RECIPES.length} recipes against individual wiki recipe tables.`,
    );
}
