import { readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { digest, writeJson } from "./io.ts";
import { dataPackageManifestSchema } from "./model.ts";
import { packageDirectory, schemaUrl } from "./pipeline.ts";
import { Source } from "./source.ts";
import { Tables } from "./tables.ts";

const shaSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const craftingRecipeSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    kind: z.enum(["essence", "bench"]),
    mod: z.string().min(1),
    itemClasses: z.array(z.string()).min(1),
    cost: z.array(z.object({ name: z.string(), amount: z.number().int().positive() })),
});
export const craftingRecipesSchema = z.object({
    format: z.literal(1),
    game: z.literal("poe1"),
    patch: z.string(),
    source: z.object({
        basesSha256: shaSchema,
        modsSha256: shaSchema,
        schemaSha256: shaSchema,
        tables: z.record(z.string(), shaSchema),
    }),
    recipes: z.array(craftingRecipeSchema).min(1),
});

const essenceClasses: Record<string, string[]> = {
    Helmet: ["Helmet"],
    BodyArmour: ["Body Armour"],
    Boots: ["Boots"],
    Gloves: ["Gloves"],
    Bow: ["Bow"],
    Wand: ["Wand"],
    Staff: ["Staff", "Warstaff"],
    TwoHandSword: ["Two Hand Sword"],
    TwoHandAxe: ["Two Hand Axe"],
    TwoHandMace: ["Two Hand Mace"],
    Claw: ["Claw"],
    Dagger: ["Dagger", "Rune Dagger"],
    OneHandSword: ["One Hand Sword"],
    OneHandThrustingSword: ["Thrusting One Hand Sword"],
    OneHandAxe: ["One Hand Axe"],
    OneHandMace: ["One Hand Mace"],
    Sceptre: ["Sceptre"],
    Belt: ["Belt"],
    Amulet: ["Amulet"],
    Ring: ["Ring"],
    Shield: ["Shield"],
};

export function normalizeCraftingRecipes(tables: Tables) {
    const recipes: z.infer<typeof craftingRecipeSchema>[] = [];
    for (const row of tables.rows("Essences")) {
        const base = row.ref("BaseItemTypesKey");
        if (!base) continue;
        for (const [column, itemClasses] of Object.entries(essenceClasses)) {
            const mod = row.ref(`${column}_ModsKey`);
            if (!mod) continue;
            recipes.push({
                id: `${base.id()}:${column}`,
                name: base.string("Name"),
                kind: "essence",
                mod: mod.id(),
                itemClasses,
                cost: [{ name: base.string("Name"), amount: 1 }],
            });
        }
    }
    for (const row of tables.rows("CraftingBenchOptions")) {
        const mod = row.ref("AddMod");
        if (!mod || row.boolean("IsDisabled") || row.boolean("IsAreaOption")) continue;
        const itemClasses = [
            ...new Set(
                [
                    ...row.refs("ItemClasses"),
                    ...row
                        .refs("CraftingItemClassCategories")
                        .flatMap((category) => category.refs("ItemClasses")),
                ].map((entry) => entry.id()),
            ),
        ];
        if (!itemClasses.length) continue;
        const amounts = row.numbers("Cost_Values");
        const currency = row.refs("Cost_BaseItemTypes");
        if (currency.length !== amounts.length) throw new Error("Bench cost arrays differ");
        recipes.push({
            id: `bench:${row.index}`,
            name: `Crafting bench rank ${row.number("Tier")}`,
            kind: "bench",
            mod: mod.id(),
            itemClasses,
            cost: currency.map((base, index) => ({
                name: base.string("Name"),
                amount: amounts[index]!,
            })),
        });
    }
    return recipes;
}

export async function exportCraftingRecipes(directory: string) {
    const manifest = dataPackageManifestSchema.parse(
        JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")),
    );
    if (manifest.game !== "poe1") throw new Error("Crafting recipes currently support PoE 1");
    for (const file of ["base_items.json", "mods.json"]) {
        if (digest(await readFile(join(directory, "data", file))) !== manifest.files[file]?.sha256)
            throw new Error(`Package hash mismatch: ${file}`);
    }
    const response = await fetch(schemaUrl, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Schema download failed: ${response.status}`);
    const schemaBytes = Buffer.from(await response.arrayBuffer());
    const source = await Source.open(
        "poe1",
        { patch: manifest.client_build },
        join(packageDirectory, ".cache/crafting", manifest.client_build),
        join(packageDirectory, ".cache/bundles"),
    );
    try {
        const tables = new Tables("poe1", source, JSON.parse(schemaBytes.toString("utf8")));
        await tables.load([
            "Essences",
            "CraftingBenchOptions",
            "CraftingItemClassCategories",
            "BaseItemTypes",
            "Mods",
            "ItemClasses",
        ]);
        const result = craftingRecipesSchema.parse({
            format: 1,
            game: "poe1",
            patch: manifest.client_build,
            source: {
                basesSha256: manifest.files["base_items.json"]!.sha256,
                modsSha256: manifest.files["mods.json"]!.sha256,
                schemaSha256: digest(schemaBytes),
                tables: Object.fromEntries(
                    Object.entries(source.inputs).map(([path, evidence]) => [
                        path,
                        evidence.sha256,
                    ]),
                ),
            },
            recipes: normalizeCraftingRecipes(tables),
        });
        const mods = JSON.parse(await readFile(join(directory, "data/mods.json"), "utf8"));
        for (const recipe of result.recipes)
            if (!Object.hasOwn(mods, recipe.mod))
                throw new Error(`Unresolved recipe modifier: ${recipe.mod}`);
        const output = join(directory, "crafting.json");
        await writeJson(`${output}.tmp`, result);
        await rename(`${output}.tmp`, output);
        return { patch: result.patch, recipes: result.recipes.length };
    } finally {
        await source.close();
    }
}
