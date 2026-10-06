/** biome-ignore-all lint/style/useNamingConvention: Fixtures use the RePoE wire format. */
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { exportRecombinatorCatalog } from "../scripts/export-recombinator-catalog";

const temporary: string[] = [];
const sha256 = (data: string) => createHash("sha256").update(data).digest("hex");
afterEach(async () => {
    await Promise.all(
        temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
});

async function dataPackage(game = "poe1", recombinableClasses = ["Body Armour"]) {
    const directory = await mkdtemp(join(tmpdir(), "recombinator-export-"));
    temporary.push(directory);
    await mkdir(join(directory, "data"));
    const base = {
        domain: "item",
        release_state: "released",
        name: "Vaal Regalia",
        item_class: "Body Armour",
        tags: ["body_armour", "default"],
    };
    const mod = {
        domain: "item",
        generation_type: "prefix",
        is_essence_only: false,
        name: "Healthy",
        text: "+10 to maximum [Life]",
        required_level: 1,
        maximum_level: 100,
        groups: ["Life"],
        adds_tags: [],
        spawn_weights: [{ tag: "default", weight: 1000 }],
        generation_weights: [],
    };
    const tables = {
        "base_items.json": {
            base,
            unreleased: { ...base, release_state: "unreleased" },
            currency: { ...base, item_class: "Currency" },
            rod: {
                ...base,
                item_class: "FishingRod",
                name: "Fishing Rod",
                tags: ["fishing_rod", "default"],
            },
        },
        "mods.json": {
            life: mod,
            essence: { ...mod, is_essence_only: true },
            unique: { ...mod, generation_type: "unique" },
            blocked: {
                ...mod,
                spawn_weights: [
                    { tag: "body_armour", weight: 0 },
                    { tag: "fishing_rod", weight: 0 },
                    { tag: "default", weight: 1000 },
                ],
            },
        },
        "item_classes.json": {
            "Body Armour": { name: "Body Armours" },
            FishingRod: { name: "Fishing Rods" },
            Currency: { name: "Currency" },
        },
    };
    const files: Record<string, { sha256: string; bytes: number; schema: string }> = {};
    for (const [path, data] of Object.entries(tables)) {
        const bytes = JSON.stringify(data);
        files[path] = {
            sha256: sha256(bytes),
            bytes: Buffer.byteLength(bytes),
            schema: `json-schema/${path.replace(".json", ".schema.json")}`,
        };
        await writeFile(join(directory, "data", path), bytes);
    }
    const source = {
        basesSha256: files["base_items.json"].sha256,
        modsSha256: files["mods.json"].sha256,
        schemaSha256: "a".repeat(64),
        tables: { "Data/RecombinableClasses.datc64": "b".repeat(64) },
    };
    const supplement = JSON.stringify({
        format: 1,
        game,
        patch: "3.29.3.3",
        source,
        recombinableClasses,
    });
    await writeFile(join(directory, "crafting-data.json"), supplement);
    await writeFile(
        join(directory, "manifest.json"),
        JSON.stringify({
            format: 1,
            game,
            client_build: "3.29.3.3",
            version: "3.29.3-build.3",
            source_manifest_sha256: "a".repeat(64),
            dat_schema_sha256: source.schemaSha256,
            extractor_sha256: "a".repeat(64),
            zod_schema_sha256: "a".repeat(64),
            crafting_data_sha256: sha256(supplement),
            weight_provenance:
                "client-extracted; PoE 2 values are not Craft of Exile empirical weights",
            files,
        }),
    );
    await writeFile(
        join(directory, "crafting.json"),
        JSON.stringify({
            format: 1,
            game: "poe1",
            patch: "3.29.3.3",
            source,
            recipes: [
                {
                    id: "essence-life",
                    name: "Life essence",
                    kind: "essence",
                    mod: "life",
                    itemClasses: ["Body Armour"],
                    cost: [{ name: "Life essence", amount: 1 }],
                },
            ],
        }),
    );
    return directory;
}

describe("catalog package export", () => {
    it("exports a deterministic equipment subset with source hashes and plain text", async () => {
        const directory = await dataPackage();
        const output = join(directory, "public", "catalog.json");
        const catalog = await exportRecombinatorCatalog(directory, output);
        expect(catalog.bases.map((base) => base.id)).toEqual(["base"]);
        expect(catalog.mods.map((mod) => mod.id)).toEqual(["life"]);
        expect(catalog.mods[0].text).toBe("+10 to maximum Life");
        expect(catalog.source.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
        expect(catalog.source.craftingDataSha256).toBe(
            sha256(await readFile(join(directory, "crafting-data.json"), "utf8")),
        );
        expect(catalog.recipes?.[0].mod).toBe("life");
        const first = await readFile(output, "utf8");
        await exportRecombinatorCatalog(directory, output);
        expect(await readFile(output, "utf8")).toBe(first);
    });

    it("preserves the last published catalog on corruption and rejects PoE 2 inputs", async () => {
        const directory = await dataPackage();
        const output = join(directory, "catalog.json");
        await exportRecombinatorCatalog(directory, output);
        const before = await readFile(output, "utf8");
        await writeFile(join(directory, "data/mods.json"), "{}");
        await expect(exportRecombinatorCatalog(directory, output)).rejects.toThrow(
            "Package hash mismatch",
        );
        expect(await readFile(output, "utf8")).toBe(before);
        await expect(
            exportRecombinatorCatalog(await dataPackage("poe2"), output),
        ).rejects.toThrow();
        expect(await readFile(output, "utf8")).toBe(before);
    });

    it("rejects recipes generated for another data package", async () => {
        const directory = await dataPackage();
        const file = join(directory, "crafting.json");
        const recipes = JSON.parse(await readFile(file, "utf8"));
        recipes.source.modsSha256 = "0".repeat(64);
        await writeFile(file, JSON.stringify(recipes));
        await expect(
            exportRecombinatorCatalog(directory, join(directory, "catalog.json")),
        ).rejects.toThrow("Crafting recipes differ");
    });

    it("takes eligible item classes from the extracted supplement", async () => {
        const directory = await dataPackage("poe1", ["FishingRod"]);
        const catalog = await exportRecombinatorCatalog(directory, join(directory, "catalog.json"));
        expect(catalog.bases.map((base) => base.id)).toEqual(["rod"]);
        expect(catalog.mods.map((mod) => mod.id)).toEqual(["life"]);
        expect(catalog.recipes).toEqual([]);
    });

    it("preserves the published catalog if the supplement is corrupted", async () => {
        const directory = await dataPackage();
        const output = join(directory, "catalog.json");
        await exportRecombinatorCatalog(directory, output);
        const before = await readFile(output, "utf8");
        await writeFile(join(directory, "crafting-data.json"), "{}");
        await expect(exportRecombinatorCatalog(directory, output)).rejects.toThrow(
            "Package hash mismatch: crafting-data.json",
        );
        expect(await readFile(output, "utf8")).toBe(before);
    });

    it.each([
        "patch",
        "basesSha256",
        "modsSha256",
        "schemaSha256",
        "tables",
    ])("rejects a supplement with inconsistent %s despite a matching file hash", async (field) => {
        const directory = await dataPackage();
        const path = join(directory, "crafting-data.json");
        const supplement = JSON.parse(await readFile(path, "utf8"));
        if (field === "patch") supplement.patch = "3.29.3.2";
        else supplement.source[field] = field === "tables" ? {} : "0".repeat(64);
        const bytes = JSON.stringify(supplement);
        await writeFile(path, bytes);
        const manifestPath = join(directory, "manifest.json");
        const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        manifest.crafting_data_sha256 = sha256(bytes);
        await writeFile(manifestPath, JSON.stringify(manifest));
        await expect(
            exportRecombinatorCatalog(directory, join(directory, "catalog.json")),
        ).rejects.toThrow("Recombination data differs");
    });

    it.each([
        { classes: ["missing"], error: "Unresolved recombinable item class" },
        { classes: ["Body Armour", "Body Armour"], error: "Duplicate recombinable item class" },
    ])("rejects invalid extracted classes: $error", async ({ classes, error }) => {
        const directory = await dataPackage("poe1", classes);
        await expect(
            exportRecombinatorCatalog(directory, join(directory, "catalog.json")),
        ).rejects.toThrow(error);
    });
});
