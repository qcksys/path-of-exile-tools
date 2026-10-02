/** biome-ignore-all lint/style/useNamingConvention: Fixtures use the RePoE wire format. */
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { exportRecombinatorCatalog } from "../scripts/export-recombinator-catalog";

const temporary: string[] = [];
afterEach(async () => {
    await Promise.all(
        temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
});

async function snapshot(game = "poe1") {
    const directory = await mkdtemp(join(tmpdir(), "recombinator-export-"));
    temporary.push(directory);
    await mkdir(join(directory, "normalized"));
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
        "normalized/base_items.json": {
            base,
            unreleased: { ...base, release_state: "unreleased" },
            currency: { ...base, item_class: "Currency" },
        },
        "normalized/mods.json": {
            life: mod,
            essence: { ...mod, is_essence_only: true },
            unique: { ...mod, generation_type: "unique" },
            blocked: {
                ...mod,
                spawn_weights: [
                    { tag: "body_armour", weight: 0 },
                    { tag: "default", weight: 1000 },
                ],
            },
        },
    };
    const files: Record<string, string> = {};
    for (const [path, data] of Object.entries(tables)) {
        const bytes = JSON.stringify(data);
        files[path] = createHash("sha256").update(bytes).digest("hex");
        await writeFile(join(directory, path), bytes);
    }
    await writeFile(
        join(directory, "manifest.json"),
        JSON.stringify({ format_version: 1, game, patch: "fixture", files }),
    );
    return directory;
}

describe("catalog snapshot export", () => {
    it("exports a deterministic equipment subset with source hashes and plain text", async () => {
        const directory = await snapshot();
        const output = join(directory, "public", "catalog.json");
        const catalog = await exportRecombinatorCatalog(directory, output);
        expect(catalog.bases.map((base) => base.id)).toEqual(["base"]);
        expect(catalog.mods.map((mod) => mod.id)).toEqual(["life"]);
        expect(catalog.mods[0].text).toBe("+10 to maximum Life");
        expect(catalog.source.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
        const first = await readFile(output, "utf8");
        await exportRecombinatorCatalog(directory, output);
        expect(await readFile(output, "utf8")).toBe(first);
    });

    it("preserves the last published catalog on corruption and rejects PoE 2 inputs", async () => {
        const directory = await snapshot();
        const output = join(directory, "catalog.json");
        await exportRecombinatorCatalog(directory, output);
        const before = await readFile(output, "utf8");
        await writeFile(join(directory, "normalized/mods.json"), "{}");
        await expect(exportRecombinatorCatalog(directory, output)).rejects.toThrow(
            "Snapshot hash mismatch",
        );
        expect(await readFile(output, "utf8")).toBe(before);
        await expect(exportRecombinatorCatalog(await snapshot("poe2"), output)).rejects.toThrow();
        expect(await readFile(output, "utf8")).toBe(before);
    });
});
