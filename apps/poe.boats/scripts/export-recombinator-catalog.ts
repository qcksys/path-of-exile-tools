import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command, runCli } from "@poe-tools/cli";
import { z } from "zod";
import { craftingRecipesSchema } from "../../../packages/poe-game-data/src/crafting-recipes";
import { availableCatalogMods } from "../app/lib/recombinator-catalog";
import { recombinatorCatalogSchema } from "../app/schemas/recombinator-catalog";

const equipment = new Set([
    "Amulet",
    "Belt",
    "Ring",
    "Quiver",
    "Body Armour",
    "Boots",
    "Gloves",
    "Helmet",
    "Shield",
    "Bow",
    "Claw",
    "Dagger",
    "Rune Dagger",
    "One Hand Axe",
    "One Hand Mace",
    "One Hand Sword",
    "Thrusting One Hand Sword",
    "Sceptre",
    "Staff",
    "Warstaff",
    "Two Hand Axe",
    "Two Hand Mace",
    "Two Hand Sword",
    "Wand",
]);
const rawBaseSchema = z.object({
    name: z.string(),
    item_class: z.string(),
    tags: z.array(z.string()),
    domain: z.string(),
    release_state: z.string(),
});
const rawWeightSchema = z.object({ tag: z.string(), weight: z.number().nonnegative() });
const rawModSchema = z.object({
    domain: z.string(),
    generation_type: z.string(),
    is_essence_only: z.boolean(),
    name: z.string(),
    text: z.string().nullable(),
    required_level: z.number(),
    maximum_level: z.number(),
    groups: z.array(z.string()),
    adds_tags: z.array(z.string()),
    spawn_weights: z.array(rawWeightSchema),
    generation_weights: z.array(rawWeightSchema),
    implicit_tags: z.array(z.string()).default([]),
});
const manifestSchema = z.object({
    format: z.literal(1),
    game: z.literal("poe1"),
    client_build: z.string(),
    files: z.record(z.string(), z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/) })),
});
const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

export async function exportRecombinatorCatalog(dataPackage: string, output: string) {
    const manifestBytes = await readFile(resolve(dataPackage, "manifest.json"));
    const manifest = manifestSchema.parse(JSON.parse(manifestBytes.toString()));
    async function verifiedJson(path: string): Promise<unknown> {
        const bytes = await readFile(resolve(dataPackage, "data", path));
        if (sha256(bytes) !== manifest.files[path]?.sha256)
            throw new Error(`Package hash mismatch: ${path}`);
        return JSON.parse(bytes.toString());
    }
    const rawBases = z
        .record(z.string(), rawBaseSchema)
        .parse(await verifiedJson("base_items.json"));
    const rawMods = z.record(z.string(), rawModSchema).parse(await verifiedJson("mods.json"));
    const craftingBytes = await readFile(resolve(dataPackage, "crafting.json"));
    const crafting = craftingRecipesSchema.parse(JSON.parse(craftingBytes.toString()));
    if (
        crafting.patch !== manifest.client_build ||
        crafting.source.basesSha256 !== manifest.files["base_items.json"].sha256 ||
        crafting.source.modsSha256 !== manifest.files["mods.json"].sha256
    ) {
        throw new Error(
            "Crafting recipes differ from the data package. Run the crafting exporter.",
        );
    }
    const recipes = crafting.recipes.filter((recipe) => {
        const mod = rawMods[recipe.mod];
        if (!mod) throw new Error(`Unknown recipe mod: ${recipe.mod}`);
        return (
            ["prefix", "suffix"].includes(mod.generation_type) &&
            mod.groups.length > 0 &&
            recipe.itemClasses.some((itemClass) => equipment.has(itemClass)) &&
            (recipe.kind === "essence"
                ? mod.domain === "item" && !mod.is_essence_only
                : mod.domain === "crafted" && mod.implicit_tags.includes("unveiled_mod"))
        );
    });
    const recipeMods = new Set(recipes.map((recipe) => recipe.mod));
    const bases = Object.entries(rawBases)
        .filter(
            ([, base]) =>
                base.domain === "item" &&
                base.release_state === "released" &&
                equipment.has(base.item_class),
        )
        .map(([id, base]) => ({ id, name: base.name, itemClass: base.item_class, tags: base.tags }))
        .sort((a, b) => a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id, "en"));
    const mods = Object.entries(rawMods)
        .filter(
            ([id, mod]) =>
                (mod.domain === "item" || recipeMods.has(id)) &&
                ["prefix", "suffix"].includes(mod.generation_type) &&
                !mod.is_essence_only &&
                mod.groups.length > 0,
        )
        .map(([id, mod]) => ({
            id,
            name: mod.name,
            text: (mod.text || id)
                .replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2")
                .replace(/\[([^\]]+)\]/g, "$1")
                .replace(/\s+/g, " ")
                .trim(),
            side: mod.generation_type === "prefix" ? ("prefixes" as const) : ("suffixes" as const),
            level: mod.required_level,
            maxLevel: mod.maximum_level,
            groups: mod.groups,
            addsTags: mod.adds_tags,
            ...(mod.domain === "crafted" ? { crafted: true, exclusive: true } : {}),
            spawn: mod.spawn_weights.map(({ tag, weight }): [string, number] => [tag, weight]),
            generation: mod.generation_weights.map(({ tag, weight }): [string, number] => [
                tag,
                weight,
            ]),
        }));
    // Include every tier that can roll naturally on a supported base at some item level.
    const reachable = new Set(
        bases.flatMap((base) =>
            mods
                .filter((mod) => availableCatalogMods([mod], base, Math.max(1, mod.level)).length)
                .map((mod) => mod.id),
        ),
    );
    const catalog = recombinatorCatalogSchema.parse({
        format: 1,
        game: "poe1",
        patch: manifest.client_build,
        source: {
            manifestSha256: sha256(manifestBytes),
            basesSha256: manifest.files["base_items.json"].sha256,
            modsSha256: manifest.files["mods.json"].sha256,
            craftingSha256: sha256(craftingBytes),
        },
        bases,
        mods: mods
            .filter((mod) => reachable.has(mod.id) || recipeMods.has(mod.id))
            .sort((a, b) => a.id.localeCompare(b.id, "en")),
        recipes,
    });
    await mkdir(dirname(output), { recursive: true });
    await writeFile(`${output}.tmp`, `${JSON.stringify(catalog)}\n`);
    await rename(`${output}.tmp`, output);
    return catalog;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const program = new Command()
        .name("export-recombinator-catalog")
        .description("Export the PoE 1 recombinator catalog from the generated data package")
        .argument("[data-package]", "package directory; defaults to packages/poe-1-data")
        .action(async (selected?: string) => {
            const catalog = await exportRecombinatorCatalog(
                selected ?? resolve("../../packages/poe-1-data"),
                resolve("public/game-data/recombinator-poe1.json"),
            );
            console.log(
                `PoE 1 ${catalog.patch}: ${catalog.bases.length} bases, ${catalog.mods.length} mods`,
            );
        });
    process.exitCode = await runCli(program);
}
