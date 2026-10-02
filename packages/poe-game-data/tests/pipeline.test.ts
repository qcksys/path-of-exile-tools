import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { digest, readJson, writeJson } from "../src/io.ts";
import { datasetSchema, validateDataset } from "../src/model.ts";
import { manifestSchema, publish, replay, run, verify } from "../src/pipeline.ts";

const temporary: string[] = [];
async function directory() {
    const root = await mkdtemp(join(tmpdir(), "poe-pipeline-"));
    temporary.push(root);
    return root;
}
afterEach(async () => {
    vi.unstubAllGlobals();
    for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true });
});

const data = datasetSchema.parse({
    base_items: {
        belt: {
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
        },
    },
    mods: {
        life: {
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
        },
    },
    stats: { life: { alias: {}, is_aliased: false, is_local: false } },
    tags: ["default"],
    item_classes: { Belt: { name: "Belt" } },
});

async function snapshot() {
    const root = await directory();
    const path = join(root, "poe1/snapshots/.incomplete-fixture");
    const files: Record<string, string> = {};
    for (const [name, value] of Object.entries({
        "schema.json": { version: 8, tables: [] },
        "config.json": { poe1: { patch: "3.29.3.3" } },
        ...Object.fromEntries(
            Object.entries(data).map(([name, value]) => [`normalized/${name}.json`, value]),
        ),
    })) {
        await writeJson(join(path, name), value);
        files[name] = digest(await readFile(join(path, name)));
    }
    const manifest = manifestSchema.parse({
        format: 2,
        game: "poe1",
        patch: "3.29.3.3",
        created_at: new Date().toISOString(),
        source: "fixture",
        pipeline_sha256: "0".repeat(64),
        schema_sha256: files["schema.json"],
        weight_provenance:
            "client-extracted; PoE 2 values are not Craft of Exile empirical weights",
        files,
    });
    return { root, path: await publish(root, "poe1", path, manifest) };
}

it("publishes a valid snapshot and detects tampering and added files", async () => {
    const { root, path } = await snapshot();
    expect((await verify(path)).data).toEqual(data);
    expect(await readJson(join(root, "poe1/latest.json"))).toEqual({
        snapshot: "snapshots/fixture",
    });
    await writeJson(join(path, "normalized/mods.json"), {});
    await expect(verify(path)).rejects.toThrow("hash mismatch");
    await writeJson(join(path, "normalized/mods.json"), data.mods);
    await writeJson(join(path, "untracked.json"), {});
    await expect(verify(path)).rejects.toThrow("absent from the manifest");
});

it("requires the recorded pipeline and dependency lock for replay", async () => {
    const { root, path } = await snapshot();
    await expect(replay(path, join(root, "replay"))).rejects.toThrow(
        "restore the recorded versions",
    );
});

it("retains failure evidence without advancing latest and stays offline with local inputs", async () => {
    const { root, path } = await snapshot();
    const previous = await readFile(join(root, "poe1/latest.json"), "utf8");
    vi.stubGlobal(
        "fetch",
        vi.fn(() => {
            throw new Error("Network is forbidden");
        }),
    );
    await expect(
        run(
            { poe1: { patch: "3.29.3.3", directory: path } },
            root,
            ["poe1"],
            join(path, "schema.json"),
        ),
    ).rejects.toThrow("evidence retained");
    expect(fetch).not.toHaveBeenCalled();
    expect(await readFile(join(root, "poe1/latest.json"), "utf8")).toBe(previous);
    const failed = (await readdir(join(root, "poe1/snapshots"))).find((name) =>
        name.startsWith(".incomplete-"),
    );
    expect(failed).toBeTruthy();
    expect(await readFile(join(root, "poe1/snapshots", failed!, "extract.log"), "utf8")).toContain(
        "Missing poe1 schema",
    );
});

it("rejects dangling normalized references and mismatched stat ranges", () => {
    const broken = structuredClone(data);
    broken.base_items.belt!.implicits = ["missing"];
    expect(() => validateDataset(broken)).toThrow("unresolved implicit");
    broken.base_items.belt!.implicits = ["life"];
    broken.mods.life!.stats[0]!.min = 21;
    expect(() => validateDataset(broken)).toThrow("Invalid range");
});
