import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rename } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { type Config, configSchema, type Game, gameSchema, hosts } from "./config.ts";
import { exportImage } from "./images.ts";
import { assetPath, digest, readJson, writeBytes, writeJson } from "./io.ts";
import { Metadata } from "./metadata.ts";
import { type Dataset, datasetSchema, validateDataset } from "./model.ts";
import { normalize } from "./normalize.ts";
import { Source } from "./source.ts";
import { datSchema, Tables } from "./tables.ts";
import { Translations } from "./translations.ts";

export const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
export const schemaUrl =
    "https://github.com/poe-tool-dev/dat-schema/releases/download/latest/schema.min.json";
const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const manifestSchema = z.strictObject({
    format: z.literal(2),
    game: gameSchema,
    patch: z.string(),
    created_at: z.string(),
    source: z.string(),
    pipeline_sha256: sha,
    schema_sha256: sha,
    weight_provenance: z.literal(
        "client-extracted; PoE 2 values are not Craft of Exile empirical weights",
    ),
    files: z.record(z.string(), sha).refine((files) => Object.keys(files).length > 0),
});

async function filesUnder(root: string, prefix = ""): Promise<string[]> {
    const files: string[] = [];
    for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) files.push(...(await filesUnder(root, path)));
        else if (entry.isFile()) files.push(path);
        else throw new Error(`Unsupported snapshot entry: ${path}`);
    }
    return files.sort();
}

export async function pipelineSources(): Promise<Record<string, Buffer>> {
    const files: Record<string, Buffer> = {};
    for (const name of await filesUnder(join(packageDirectory, "src")))
        files[`src/${name}`] = await readFile(join(packageDirectory, "src", name));
    files["package.json"] = await readFile(join(packageDirectory, "package.json"));
    files["pnpm-lock.yaml"] = await readFile(join(packageDirectory, "../../pnpm-lock.yaml"));
    files["pnpm-workspace.yaml"] = await readFile(
        join(packageDirectory, "../../pnpm-workspace.yaml"),
    );
    return files;
}

function sourceDigest(files: Record<string, Buffer>) {
    return digest(
        JSON.stringify(
            Object.keys(files)
                .sort()
                .map((name) => [name, digest(files[name] ?? Buffer.alloc(0))]),
        ),
    );
}

export async function readDataset(snapshot: string): Promise<Dataset> {
    return validateDataset(
        Object.fromEntries(
            await Promise.all(
                Object.keys(datasetSchema.shape).map(async (name) => [
                    name,
                    await readJson(join(snapshot, "normalized", `${name}.json`)),
                ]),
            ),
        ),
    );
}

export function counts(data: Dataset) {
    const mods = Object.values(data.mods);
    const histogram: Record<string, number> = {};
    for (const mod of mods)
        for (const rule of mod.spawn_weights)
            histogram[rule.weight] = (histogram[rule.weight] ?? 0) + 1;
    return {
        bases: Object.keys(data.base_items).length,
        mods: mods.length,
        stats: Object.keys(data.stats).length,
        tags: data.tags.length,
        spawn_weight_values: histogram,
        mods_without_text: mods.filter((mod) => !mod.text).length,
        mods_without_positive_spawn_weights: mods.filter(
            (mod) => !mod.spawn_weights.some((rule) => rule.weight > 0),
        ).length,
    };
}

export async function verify(snapshot: string) {
    const manifest = manifestSchema.parse(await readJson(join(snapshot, "manifest.json")));
    for (const name of [
        "schema.json",
        "config.json",
        ...Object.keys(datasetSchema.shape).map((name) => `normalized/${name}.json`),
    ]) {
        if (!manifest.files[name]) throw new Error(`Manifest is missing required file: ${name}`);
    }
    for (const [name, expected] of Object.entries(manifest.files)) {
        if (digest(await readFile(assetPath(snapshot, name))) !== expected)
            throw new Error(`Snapshot hash mismatch: ${name}`);
    }
    const actual = (await filesUnder(snapshot)).filter(
        (name) => name !== "manifest.json" && name !== "extract.log",
    );
    if (actual.some((name) => !manifest.files[name]))
        throw new Error("Snapshot contains files absent from the manifest");
    if (digest(await readFile(join(snapshot, "schema.json"))) !== manifest.schema_sha256)
        throw new Error("Schema digest differs from manifest");
    return { manifest, data: await readDataset(snapshot) };
}

export async function publish(
    output: string,
    game: Game,
    staging: string,
    manifest: z.infer<typeof manifestSchema>,
) {
    await writeJson(join(staging, "manifest.json"), manifestSchema.parse(manifest));
    const final = join(output, game, "snapshots", basename(staging).replace(/^\.incomplete-/, ""));
    await rename(staging, final);
    const pointer = join(output, game, "latest.json");
    const temporary = `${pointer}.${randomUUID()}`;
    await writeJson(temporary, {
        snapshot: relative(join(output, game), final).replaceAll("\\", "/"),
    });
    await rename(temporary, pointer);
    return final;
}

async function writeNormalized(path: string, name: string, value: unknown) {
    await writeJson(assetPath(path, `${name}.json`), value);
    await writeBytes(assetPath(path, `${name}.min.json`), JSON.stringify(value));
}

export async function run(config: Config, output: string, selected: Game[], schemaPath?: string) {
    config = configSchema.parse(config);
    let schemaBytes: Buffer;
    if (schemaPath) schemaBytes = await readFile(schemaPath);
    else {
        const response = await fetch(schemaUrl, { signal: AbortSignal.timeout(60_000) });
        if (!response.ok) throw new Error(`Schema download failed: ${response.status}`);
        schemaBytes = Buffer.from(await response.arrayBuffer());
    }
    const schema = datSchema.parse(JSON.parse(schemaBytes.toString("utf8")));
    const sources = await pipelineSources();
    const results: string[] = [];
    for (const game of selected) {
        const configSource = config[game];
        if (!configSource) throw new Error(`Game is not configured: ${game}`);
        const snapshots = join(output, game, "snapshots");
        await mkdir(snapshots, { recursive: true });
        const staging = await mkdtemp(join(snapshots, `.incomplete-${configSource.patch}-`));
        await writeBytes(join(staging, "schema.json"), schemaBytes);
        await writeJson(join(staging, "config.json"), { [game]: configSource });
        for (const [name, bytes] of Object.entries(sources))
            await writeBytes(assetPath(join(staging, "pipeline"), name), bytes);
        let source: Source | undefined;
        try {
            source = await Source.open(
                game,
                configSource,
                join(staging, "raw"),
                join(packageDirectory, ".cache/bundles"),
            );
            console.error(`[${game}] Decoding tables and normalizing records`);
            const tables = new Tables(game, source, schema);
            const metadata = new Metadata(source);
            const translations = new Translations(source, tables);
            const { data, tagDetails, images } = await normalize(
                tables,
                metadata,
                (domain, stats, id) => translations.translate(domain, stats, id),
            );
            const normalized = join(staging, "normalized");
            for (const [name, value] of Object.entries(data))
                await writeNormalized(normalized, name, value);
            await writeNormalized(normalized, "tag_details", tagDetails);
            const byClass: Record<string, Record<string, unknown>> = {};
            for (const [id, base] of Object.entries(data.base_items)) {
                const group = byClass[base.item_class] ?? {};
                group[id] = base;
                byClass[base.item_class] = group;
            }
            for (const [name, value] of Object.entries(byClass))
                await writeNormalized(normalized, `base_items/${name}`, value);
            for (const [path, value] of metadata.files)
                await writeNormalized(normalized, path, value.sections);
            const imageErrors: Record<string, string> = {};
            for (const [index, image] of images.entries()) {
                if (index % 100 === 0) console.error(`[${game}] Images ${index}/${images.length}`);
                try {
                    await exportImage(source, image, normalized);
                } catch (error) {
                    imageErrors[image.path] =
                        error instanceof Error ? error.message : String(error);
                }
            }
            await writeJson(join(staging, "translation-errors.json"), translations.errors);
            await writeJson(join(staging, "image-errors.json"), imageErrors);
            await writeJson(join(staging, "validation.json"), {
                ...counts(data),
                missing_images: Object.entries(data.base_items)
                    .filter(([, base]) => imageErrors[base.visual_identity.dds_file])
                    .map(([id]) => id),
            });
            await writeJson(join(staging, "inputs.json"), source.inputs);
            await writeJson(join(staging, "transport.json"), source.transports);
            const files: Record<string, string> = {};
            for (const name of await filesUnder(staging))
                files[name] = digest(await readFile(assetPath(staging, name)));
            const final = await publish(output, game, staging, {
                format: 2,
                game,
                patch: configSource.patch,
                created_at: new Date().toISOString(),
                source: configSource.directory ?? `https://${hosts[game]}/${configSource.patch}/`,
                pipeline_sha256: sourceDigest(sources),
                schema_sha256: digest(schemaBytes),
                weight_provenance:
                    "client-extracted; PoE 2 values are not Craft of Exile empirical weights",
                files,
            });
            results.push(resolve(final));
        } catch (error) {
            const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
            await writeBytes(join(staging, "extract.log"), message);
            await writeJson(join(staging, "inputs.json"), source?.inputs ?? {});
            await writeJson(join(staging, "transport.json"), source?.transports ?? {});
            throw new Error(`Extraction failed; evidence retained at ${staging}`, { cause: error });
        } finally {
            await source?.close();
        }
    }
    return results;
}

export async function replay(snapshot: string, output: string) {
    const { manifest } = await verify(snapshot);
    if (manifest.pipeline_sha256 !== sourceDigest(await pipelineSources()))
        throw new Error(
            "Pipeline sources or dependency lock differ from snapshot; restore the recorded versions before replaying",
        );
    return run(
        { [manifest.game]: { patch: manifest.patch, directory: resolve(snapshot, "raw") } },
        output,
        [manifest.game],
        join(snapshot, "schema.json"),
    );
}
