import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vite-plus/test";
import type { Game } from "../src/config.ts";
import { craftingDataSchema } from "../src/crafting-data-model.ts";
import {
    commitDataPackages,
    dataPackages,
    materializePackage,
    verifyDataPackage,
} from "../src/distribute.ts";
import { digest, readJson, writeBytes, writeJson } from "../src/io.ts";
import {
    baseSchema,
    dataPackageManifestSchema,
    datasetSchema,
    modSchema,
    packageVersionForBuild,
} from "../src/model.ts";
import { manifestSchema, packageDirectory, publish } from "../src/pipeline.ts";

const temporary: string[] = [];
const execute = promisify(execFile);
afterEach(async () => {
    for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true });
});

const data = datasetSchema.parse({
    base_items: {
        belt: baseSchema.parse({
            domain: "item",
            drop_level: 1,
            implicits: ["life"],
            inventory_height: 1,
            inventory_width: 2,
            item_class: "Belt",
            name: "Leather Belt",
            properties: {},
            release_state: "released",
            tags: ["default"],
            visual_identity: { id: "Belt", dds_file: "belt.dds" },
        }),
    },
    mods: {
        life: modSchema.parse({
            adds_tags: [],
            domain: "item",
            generation_type: "prefix",
            generation_weights: [],
            grants_effects: [],
            groups: ["Life"],
            implicit_tags: [],
            is_essence_only: false,
            name: "Healthy",
            required_level: 1,
            maximum_level: 100,
            spawn_weights: [{ tag: "default", weight: 1000 }],
            stats: [{ id: "life", min: 10, max: 20 }],
            text: "Life",
            type: "Life",
        }),
    },
    stats: { life: { alias: {}, is_aliased: false, is_local: false } },
    tags: ["default"],
    item_classes: { Belt: { name: "Belt" } },
});

async function fixture(
    game: Game = "poe1",
    extra: Record<string, unknown> = {},
    withCrafting = false,
) {
    const root = await mkdtemp(join(tmpdir(), "poe-distribute-"));
    temporary.push(root);
    const packagesRoot = join(root, "packages");
    const directory = join(packagesRoot, dataPackages[game]);
    await writeJson(
        join(directory, "package.json"),
        await readJson(join(packageDirectory, "..", dataPackages[game], "package.json")),
    );
    const build = game === "poe1" ? "3.29.3.3" : "4.5.5.4";
    const staging = join(root, game, "snapshots/.incomplete-fixture");
    const files: Record<string, string> = {};
    for (const [name, value] of Object.entries({
        "schema.json": { version: 8, tables: [] },
        "config.json": { [game]: { patch: build } },
        ...Object.fromEntries(
            Object.entries(data).map(([name, value]) => [`normalized/${name}.json`, value]),
        ),
        "normalized/tag_details.json": { default: { name: "default" } },
        "normalized/base_items/Belt.json": data.base_items,
        "normalized/Metadata/Items/Belts/Belt.json": {
            Base: { tags: ["belt", "default"], level: 1 },
        },
        "normalized/mods.min.json": data.mods,
        "normalized/Art/example.png": "image fixture",
        ...extra,
    })) {
        await writeJson(join(staging, name), value);
        files[name] = digest(await readFile(join(staging, name)));
    }
    if (withCrafting) {
        const table = "Data/Mods.datc64";
        await writeBytes(join(staging, "raw", table), "raw fixture");
        files[`raw/${table}`] = digest("raw fixture");
        const crafting = craftingDataSchema.parse({
            format: 1,
            game,
            patch: build,
            source: {
                basesSha256: files["normalized/base_items.json"],
                modsSha256: files["normalized/mods.json"],
                schemaSha256: files["schema.json"],
                tables: { [table]: files[`raw/${table}`] },
            },
            currencies: [],
            allflame: null,
            strongboxes: [],
            clusterJewels: null,
            locus: null,
            memoryMaps: null,
            templeCorruption: null,
            qualityInfusers: [],
            waystones: [],
            maps: [],
            baseQuality: [],
            taintedCatalysts: [],
            mapQuality: [],
            augments: [],
            augmentTags: {},
            elementalConversions: [],
            taggedModifierEffects: [],
            memoryStrandCosts: {},
            recombinableClasses: [],
            craftableModTypes: [],
            keywords: {},
            sanctification: null,
            passiveTree: null,
            genesis: null,
            anointing: { maps: [], items: [], recipes: [], passives: {} },
            liquidEmotions: [],
            scalableStats: [],
            catalysts: [],
            desecration: [],
            modEquivalencies: [],
            baseRules: {},
            tieredCurrency: [],
            poe2Essences: [],
            rarities: {},
            classes: {},
            influences: [],
            influenceUpgrades: [],
            modRules: {},
            statDescriptions: [],
            modDescriptions: {},
            modTexts: {},
            statLookups: {},
            essences: [],
            bench: [],
            flaskEnchantments: [],
            fossils: [],
            harvest: [],
            beasts: [],
        });
        await writeJson(join(staging, "crafting-data.json"), crafting);
        files["crafting-data.json"] = digest(await readFile(join(staging, "crafting-data.json")));
    }
    const snapshot = await publish(
        root,
        game,
        staging,
        manifestSchema.parse({
            format: 2,
            game,
            patch: build,
            created_at: "2026-10-02T00:00:00.000Z",
            source: "fixture",
            pipeline_sha256: "0".repeat(64),
            schema_sha256: files["schema.json"],
            weight_provenance:
                "client-extracted; PoE 2 values are not Craft of Exile empirical weights",
            files,
        }),
    );
    return { root, packagesRoot, directory, snapshot };
}

it.each([
    ["3.27.0", "3.27.0"],
    ["3.29.3.3", "3.29.3-build.3"],
    ["4.5.5.4", "4.5.5-build.4"],
    ["4.5.5.4.10", "4.5.5-build.4.10"],
])("maps build %s to version %s", (build, version) =>
    expect(packageVersionForBuild(build)).toBe(version));

it.each([
    "3.27",
    "3.027.0",
    "3.27.0-beta",
    "3.27.0+foo",
    "3.27.0/../file",
])("rejects invalid build %s", (build) => expect(() => packageVersionForBuild(build)).toThrow());

it.each([
    "poe1",
    "poe2",
] as const)("packages every canonical JSON file for %s and regenerates deterministically", async (game) => {
    const { directory, packagesRoot, snapshot } = await fixture(game);
    await writeJson(join(directory, "data/stale.json"), {});
    const other = game === "poe1" ? "poe2" : "poe1";
    await writeBytes(join(packagesRoot, dataPackages[other], "sentinel"), "unchanged");
    const output = await materializePackage(snapshot, packagesRoot);
    expect(output.files).toBe(8);
    const { manifest, counts } = await verifyDataPackage(directory);
    expect(counts.bases).toBe(1);
    expect(manifest.client_build).toBe(game === "poe1" ? "3.29.3.3" : "4.5.5.4");
    expect(Object.keys(manifest.files)).not.toContain("mods.min.json");
    expect(Object.keys(manifest.files)).not.toContain("Art/example.png");
    expect(await readFile(join(directory, "data/mods.json"))).toEqual(
        await readFile(join(snapshot, "normalized/mods.json")),
    );
    expect(await readFile(join(packagesRoot, dataPackages[other], "sentinel"), "utf8")).toBe(
        "unchanged",
    );
    const first = await readFile(join(directory, "manifest.json"), "utf8");
    await materializePackage(snapshot, packagesRoot);
    expect(await readFile(join(directory, "manifest.json"), "utf8")).toBe(first);
    expect(dataPackageManifestSchema.safeParse({ ...manifest, version: "1.0.0" }).success).toBe(
        false,
    );
    expect(dataPackageManifestSchema.safeParse({ ...manifest, game: other }).success).toBe(false);
    expect(
        dataPackageManifestSchema.safeParse({ ...manifest, client_build: "invalid" }).success,
    ).toBe(false);
});

it.each([
    ["data/mods.json", "{}", "hash mismatch"],
    ["data/untracked.json", "{}", "differ from manifest"],
    ["src/schemas.ts", "export {};", "schema hash mismatch"],
    ["src/release.ts", "export {};", "Generated package source changed"],
    ["types/mods.d.ts", "export {};", "Generated package source changed"],
    ["json-schema/mods.schema.json", "{}", "Generated package source changed"],
    ["json-schema/extra.schema.json", "{}", "JSON Schema files differ"],
])("detects modified package file %s", async (path, content, error) => {
    const { directory, packagesRoot, snapshot } = await fixture();
    await materializePackage(snapshot, packagesRoot);
    await writeBytes(join(directory, path), content);
    await expect(verifyDataPackage(directory)).rejects.toThrow(error);
});

it("packages crafting provenance, detects recipe tampering, and removes stale supplements", async () => {
    const { directory, packagesRoot, snapshot } = await fixture("poe1", {}, true);
    await materializePackage(snapshot, packagesRoot);
    const { manifest } = await verifyDataPackage(directory);
    const bytes = await readFile(join(directory, "crafting-data.json"));
    expect(manifest.crafting_data_sha256).toBe(digest(bytes));
    expect(await readFile(join(snapshot, "crafting-data.json"))).toEqual(bytes);
    await writeBytes(join(directory, "crafting-data.json"), `${bytes.toString()} `);
    await expect(verifyDataPackage(directory)).rejects.toThrow("hash mismatch: crafting-data.json");
    const legacy = await fixture();
    await materializePackage(legacy.snapshot, packagesRoot);
    expect((await verifyDataPackage(directory)).manifest.crafting_data_sha256).toBeUndefined();
    await expect(readFile(join(directory, "crafting-data.json"))).rejects.toThrow();
    const metadata = await readJson(join(directory, "package.json"));
    expect(metadata).not.toHaveProperty(["exports", "./crafting-data.json"]);
});

it("rejects invalid snapshot JSON before changing the package", async () => {
    const { directory, packagesRoot, snapshot } = await fixture("poe1", {
        "normalized/tag_details.json": { bad: 1 },
    });
    const before = await readFile(join(directory, "package.json"));
    await expect(materializePackage(snapshot, packagesRoot)).rejects.toThrow();
    expect(await readFile(join(directory, "package.json"))).toEqual(before);
    await expect(readFile(join(directory, "manifest.json"))).rejects.toThrow();
});

it("commits only verified data packages and refuses an occupied index", async () => {
    const { root, packagesRoot, snapshot } = await fixture();
    const git = (...args: string[]) =>
        execute("git", ["-c", "commit.gpgsign=false", ...args], { cwd: root });
    await git("init");
    await git("config", "user.name", "Pipeline test");
    await git("config", "user.email", "pipeline@example.invalid");
    await git("config", "core.hooksPath", join(root, "no-hooks"));
    await git("config", "commit.gpgsign", "false");
    await writeBytes(join(root, "unrelated.txt"), "initial");
    await git("add", "unrelated.txt");
    await git("commit", "-m", "fixture");
    const output = await materializePackage(snapshot, packagesRoot);
    await writeBytes(join(root, "unrelated.txt"), "user work");
    await git("add", "unrelated.txt");
    await expect(commitDataPackages([output], root)).rejects.toThrow("already contains staged");
    expect((await git("diff", "--cached", "--name-only")).stdout.trim()).toBe("unrelated.txt");
    await git("restore", "--staged", "unrelated.txt");
    expect((await commitDataPackages([output], root)).committed).toBe(true);
    expect(
        (await git("show", "--pretty=", "--name-only", "HEAD")).stdout
            .trim()
            .split(/\r?\n/)
            .every((path) => path.startsWith("packages/poe-1-data/")),
    ).toBe(true);
    expect((await git("diff", "--name-only")).stdout.trim()).toBe("unrelated.txt");
    expect((await commitDataPackages([output], root)).committed).toBe(false);
});

it.each([
    "poe1",
    "poe2",
] as const)("validates every committed %s JSON file and relationship", async (game) => {
    const { manifest, counts } = await verifyDataPackage(
        join(packageDirectory, "..", dataPackages[game]),
    );
    expect(manifest.game).toBe(game);
    expect(counts.bases).toBeGreaterThan(5000);
    expect(counts.mods).toBeGreaterThan(10000);
}, 30_000);

it("detects missing JSON Schemas and incorrect schema references", async () => {
    const { directory, packagesRoot, snapshot } = await fixture();
    await materializePackage(snapshot, packagesRoot);
    const manifest = dataPackageManifestSchema.parse(
        await readJson(join(directory, "manifest.json")),
    );
    manifest.files["mods.json"]!.schema = "json-schema/stats.schema.json";
    await writeJson(join(directory, "manifest.json"), manifest);
    await expect(verifyDataPackage(directory)).rejects.toThrow("Incorrect JSON Schema reference");
    await materializePackage(snapshot, packagesRoot);
    await rm(join(directory, "json-schema/mods.schema.json"));
    await expect(verifyDataPackage(directory)).rejects.toThrow();
});
