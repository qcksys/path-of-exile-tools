import { execFile } from "node:child_process";
import type { Dirent } from "node:fs";
import { readdir, readFile, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { assetPath, digest, missing, readJson, writeBytes, writeJson } from "./io.ts";
import {
    type DataPackageManifest,
    dataFileSchemas,
    dataPackageManifestSchema,
    dataPackageVersionSchema,
    packageVersionForBuild,
    schemaForDataFile,
    validateDataset,
} from "./model.ts";
import { counts, packageDirectory, verify } from "./pipeline.ts";

const execute = promisify(execFile);
export const dataPackages = { poe1: "poe-1-data", poe2: "poe-2-data" } as const;
const fileTypes = {
    base_items: "BaseItems",
    mods: "Mods",
    stats: "Stats",
    tags: "Tags",
    item_classes: "ItemClasses",
    tag_details: "TagDetails",
    item_metadata: "ItemMetadata",
    manifest: "DataPackageManifest",
} as const;
const packageSchema = z
    .object({
        name: z.string(),
        version: dataPackageVersionSchema,
        private: z.literal(false).optional(),
        exports: z.record(z.string(), z.unknown()),
        files: z.array(z.string()),
    })
    .passthrough();

async function generatedSources(
    manifest: Pick<DataPackageManifest, "game" | "version" | "client_build">,
) {
    const model = (await readFile(join(packageDirectory, "src/model.ts"), "utf8")).replaceAll(
        "\r\n",
        "\n",
    );
    const release = `import { z } from "zod";\nimport { dataPackageManifestSchema } from "./schemas.js";\n\nexport const game = ${JSON.stringify(manifest.game)};\nexport const version = ${JSON.stringify(manifest.version)};\nexport const clientBuild = ${JSON.stringify(manifest.client_build)};\nexport const manifestSchema = dataPackageManifestSchema.safeExtend({\n    game: z.literal(game),\n    version: z.literal(version),\n    client_build: z.literal(clientBuild),\n});\nexport type Manifest = z.infer<typeof manifestSchema>;\n`;
    return {
        "src/schemas.ts": model,
        "src/release.ts": release,
        ...Object.fromEntries(
            Object.entries(fileTypes).map(([name, type]) => [
                `types/${name}.d.ts`,
                name === "manifest"
                    ? 'import type { Manifest } from "../dist/release.js";\n\ndeclare const data: Manifest;\nexport default data;\n'
                    : `import type { ${type} } from "../dist/schemas.js";\n\ndeclare const data: ${type};\nexport default data;\n`,
            ]),
        ),
    };
}

async function listFiles(root: string, prefix = ""): Promise<string[]> {
    const files: string[] = [];
    let entries: Dirent[];
    try {
        entries = await readdir(join(root, prefix), { withFileTypes: true });
    } catch (error) {
        if (missing(error)) return [];
        throw error;
    }
    for (const entry of entries) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) files.push(...(await listFiles(root, path)));
        else if (entry.isFile()) files.push(path);
        else throw new Error(`Unsupported package entry: ${path}`);
    }
    return files.sort();
}

export async function materializePackage(
    snapshot: string,
    packagesRoot = resolve(packageDirectory, ".."),
) {
    const { manifest } = await verify(snapshot);
    const version = packageVersionForBuild(manifest.patch);
    const directory = join(packagesRoot, dataPackages[manifest.game]);
    const metadata = packageSchema.parse(await readJson(join(directory, "package.json")));
    if (metadata.name !== `@qcksys/${dataPackages[manifest.game]}`)
        throw new Error("Package name does not match snapshot game");
    const sources = await generatedSources({
        game: manifest.game,
        version,
        client_build: manifest.patch,
    });
    const files: Record<string, { sha256: string; bytes: number }> = {};
    const outputs = new Map<string, Buffer>();
    for (const source of Object.keys(manifest.files).sort()) {
        if (
            !source.startsWith("normalized/") ||
            !source.endsWith(".json") ||
            source.endsWith(".min.json")
        )
            continue;
        const path = source.slice("normalized/".length);
        const bytes = await readFile(assetPath(snapshot, source));
        schemaForDataFile(path).parse(JSON.parse(bytes.toString("utf8")));
        files[path] = { sha256: digest(bytes), bytes: bytes.length };
        outputs.set(path, bytes);
    }
    for (const path of Object.keys(dataFileSchemas))
        if (!outputs.has(path)) throw new Error(`Snapshot is missing package dataset: ${path}`);
    const provenance = dataPackageManifestSchema.parse({
        format: 1,
        game: manifest.game,
        version,
        client_build: manifest.patch,
        source_manifest_sha256: digest(await readFile(join(snapshot, "manifest.json"))),
        dat_schema_sha256: manifest.schema_sha256,
        extractor_sha256: manifest.pipeline_sha256,
        zod_schema_sha256: digest(sources["src/schemas.ts"]),
        weight_provenance: manifest.weight_provenance,
        files,
    });
    for (const [path, bytes] of outputs)
        await writeBytes(assetPath(join(directory, "data"), path), bytes);
    for (const old of await listFiles(join(directory, "data")))
        if (!outputs.has(old)) await rm(assetPath(join(directory, "data"), old));
    for (const [path, content] of Object.entries(sources))
        await writeBytes(join(directory, path), content);
    await writeBytes(
        join(directory, "THIRD_PARTY_NOTICES.md"),
        await readFile(join(packageDirectory, "THIRD_PARTY_NOTICES.md")),
    );
    await writeJson(join(directory, "manifest.json"), provenance);
    await writeBytes(
        join(directory, "package.json"),
        `${JSON.stringify({ ...metadata, version }, null, 4)}\n`,
    );
    return {
        directory,
        name: metadata.name,
        version,
        game: manifest.game,
        clientBuild: manifest.patch,
        files: outputs.size,
    };
}

export async function verifyDataPackage(directory: string) {
    const metadata = packageSchema.parse(await readJson(join(directory, "package.json")));
    const manifest = dataPackageManifestSchema.parse(
        await readJson(join(directory, "manifest.json")),
    );
    if (
        metadata.name !== `@qcksys/${dataPackages[manifest.game]}` ||
        metadata.version !== manifest.version
    )
        throw new Error("Package identity/version differs from data manifest");
    const schema = await readFile(join(directory, "src/schemas.ts"));
    if (digest(schema) !== manifest.zod_schema_sha256)
        throw new Error("Packaged Zod schema hash mismatch");
    for (const [path, expected] of Object.entries(await generatedSources(manifest))) {
        if ((await readFile(join(directory, path), "utf8")).replaceAll("\r\n", "\n") !== expected)
            throw new Error(`Generated package source changed; regenerate: ${path}`);
    }
    for (const path of Object.keys(dataFileSchemas))
        if (!manifest.files[path]) throw new Error(`Package is missing required dataset: ${path}`);
    const listed = Object.keys(manifest.files).sort();
    if (JSON.stringify(await listFiles(join(directory, "data"))) !== JSON.stringify(listed))
        throw new Error("Package data files differ from manifest");
    const core: Record<string, unknown> = {};
    for (const [path, expected] of Object.entries(manifest.files)) {
        const bytes = await readFile(assetPath(join(directory, "data"), path));
        if (bytes.length !== expected.bytes || digest(bytes) !== expected.sha256)
            throw new Error(`Package data hash mismatch: ${path}`);
        const value = schemaForDataFile(path).parse(JSON.parse(bytes.toString("utf8")));
        if (Object.hasOwn(dataFileSchemas, path)) core[path.slice(0, -5)] = value;
    }
    const { tag_details: _details, ...dataset } = core;
    return { manifest, counts: counts(validateDataset(dataset)) };
}

export async function commitDataPackages(
    packages: { directory: string; name: string; version: string }[],
    repository = resolve(packageDirectory, "../.."),
) {
    if (!packages.length) throw new Error("No data packages to commit");
    const staged = await execute("git", ["diff", "--cached", "--name-only"], { cwd: repository });
    if (staged.stdout.trim())
        throw new Error("Commit refused: the index already contains staged changes");
    const paths = packages.map((item) => {
        const path = relative(repository, item.directory).replaceAll("\\", "/");
        if (!/^packages\/poe-[12]-data$/.test(path))
            throw new Error("Data package is outside the expected repository location");
        return path;
    });
    for (const item of packages) {
        const { manifest } = await verifyDataPackage(item.directory);
        if (
            item.name !== `@qcksys/${dataPackages[manifest.game]}` ||
            item.version !== manifest.version
        )
            throw new Error("Commit metadata differs from package");
    }
    await execute("git", ["add", "--", ...paths], { cwd: repository });
    const changes = await execute("git", ["diff", "--cached", "--name-only"], { cwd: repository });
    if (!changes.stdout.trim()) return { committed: false };
    await execute(
        "git",
        [
            "commit",
            "-m",
            `data: update ${packages.map((item) => `${item.name}@${item.version}`).join(", ")}`,
        ],
        { cwd: repository, maxBuffer: 8 * 1024 * 1024 },
    );
    return {
        committed: true,
        commit: (await execute("git", ["rev-parse", "HEAD"], { cwd: repository })).stdout.trim(),
    };
}
