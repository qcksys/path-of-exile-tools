import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { build } from "vite-plus";
import { CRAFTING_GRAPH_ENGINE } from "../app/lib/crafting-graph-validation";
import { validateRulesetIndex } from "../app/lib/crafting-rulesets";
import { craftingCatalogSchema } from "../app/schemas/crafting";
import {
    type CraftingRuleset,
    type CraftingRulesetIndex,
    craftingRulesetSchema,
} from "../app/schemas/crafting-rulesets";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const artifact = (bytes: Uint8Array) => ({ sha256: hash(bytes), bytes: bytes.byteLength });
const json = (value: unknown) => Buffer.from(`${JSON.stringify(value, null, 4)}\n`);
const sameRevision = (a: CraftingRuleset, b: CraftingRuleset) =>
    a.game === b.game && a.era === b.era && a.revision === b.revision;

async function optionalFile(path: string) {
    try {
        return await readFile(path);
    } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
            return null;
        throw error;
    }
}
async function immutableFile(path: string, bytes: Uint8Array) {
    const prior = await optionalFile(path);
    if (prior) {
        if (!prior.equals(Buffer.from(bytes)))
            throw new Error(`Immutable crafting artifact differs: ${path}`);
        return;
    }
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: "wx" });
}
async function atomicFile(path: string, bytes: Uint8Array) {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, bytes);
    await rename(temporary, path);
}

async function buildStandaloneModule(appDirectory: string, entry: string) {
    const built = await build({
        configFile: false,
        root: appDirectory,
        publicDir: false,
        logLevel: "warn",
        resolve: { tsconfigPaths: true },
        build: {
            write: false,
            minify: true,
            target: "es2022",
            lib: {
                entry: resolve(appDirectory, entry),
                formats: ["es"],
                fileName: "runtime",
            },
        },
    });
    const outputs = (Array.isArray(built) ? built : [built]).flatMap((result) => {
        if (!("output" in result)) throw new Error("Expected a completed crafting runtime build.");
        return result.output;
    });
    const chunk = outputs[0];
    if (
        outputs.length !== 1 ||
        chunk?.type !== "chunk" ||
        chunk.imports.length ||
        chunk.dynamicImports.length
    )
        throw new Error("The historical crafting runtime must be one self-contained module.");
    return Buffer.from(chunk.code);
}

export const buildCraftingRuntime = (appDirectory: string) =>
    buildStandaloneModule(appDirectory, "scripts/crafting-runtime-entry.ts");

export async function materializeCraftingWorker(appDirectory: string, output: string) {
    await atomicFile(
        output,
        await buildStandaloneModule(appDirectory, "app/lib/crafting-graph.worker.ts"),
    );
}

export async function readCraftingHistory(archive: string): Promise<CraftingRulesetIndex> {
    const bytes = await optionalFile(resolve(archive, "index.json"));
    return bytes
        ? validateRulesetIndex(JSON.parse(bytes.toString()))
        : { format: 1, revisions: [], latest: [] };
}

export async function publishCraftingRevision(
    archive: string,
    catalogBytes: Uint8Array,
    implementationBytes: Uint8Array,
    metadata: Pick<CraftingRuleset, "era" | "revision" | "label" | "notes" | "availability">,
    publishedAt = new Date().toISOString(),
) {
    const catalog = craftingCatalogSchema.parse(JSON.parse(Buffer.from(catalogBytes).toString()));
    const index = await readCraftingHistory(archive);
    let entry = craftingRulesetSchema.parse({
        ...metadata,
        format: 1,
        game: catalog.game,
        patch: catalog.patch,
        engine: CRAFTING_GRAPH_ENGINE,
        manifestSha256: catalog.manifestSha256,
        craftingSha256: catalog.craftingSha256,
        publishedAt,
        catalog: artifact(catalogBytes),
        implementation: artifact(implementationBytes),
    });
    const prior = index.revisions.find((candidate) => sameRevision(candidate, entry));
    if (prior) {
        entry = { ...entry, publishedAt: prior.publishedAt };
        if (!json(prior).equals(json(entry)))
            throw new Error(
                "That crafting revision is immutable. Publish a new revision for corrections.",
            );
    } else index.revisions.push(entry);
    index.latest = index.latest.filter(
        (candidate) => candidate.game !== entry.game || candidate.era !== entry.era,
    );
    index.latest.push({ game: entry.game, era: entry.era, revision: entry.revision });
    validateRulesetIndex(index);
    await immutableFile(
        resolve(archive, "catalogs", `${entry.catalog.sha256}.json.gz`),
        gzipSync(catalogBytes, { level: 9 }),
    );
    await immutableFile(
        resolve(archive, "engines", `${entry.implementation.sha256}.mjs`),
        implementationBytes,
    );
    await immutableFile(
        resolve(archive, "engines", `${entry.implementation.sha256}.d.mts`),
        Buffer.from(
            'export const revision: string;\nexport const createSimulation: import("../../app/lib/crafting-runtime").HistoricalCraftingRuntime["createSimulation"];\n',
        ),
    );
    await atomicFile(resolve(archive, "index.json"), json(index));
    return entry;
}

export async function materializeCraftingHistory(
    archive: string,
    output: string,
    registryPath: string,
) {
    const index = await readCraftingHistory(archive);
    const catalogs = new Set<string>();
    const engines = new Map<string, CraftingRuleset>();
    for (const entry of index.revisions) {
        if (!catalogs.has(entry.catalog.sha256)) {
            const bytes = gunzipSync(
                await readFile(resolve(archive, "catalogs", `${entry.catalog.sha256}.json.gz`)),
            );
            if (hash(bytes) !== entry.catalog.sha256 || bytes.byteLength !== entry.catalog.bytes)
                throw new Error("Historical crafting catalog hash mismatch.");
            await immutableFile(resolve(output, "catalogs", `${entry.catalog.sha256}.json`), bytes);
            catalogs.add(entry.catalog.sha256);
        }
        if (!engines.has(entry.engine)) {
            const bytes = await readFile(
                resolve(archive, "engines", `${entry.implementation.sha256}.mjs`),
            );
            if (
                hash(bytes) !== entry.implementation.sha256 ||
                bytes.byteLength !== entry.implementation.bytes
            )
                throw new Error("Historical crafting implementation hash mismatch.");
            await immutableFile(
                resolve(output, "engines", `${entry.implementation.sha256}.mjs`),
                bytes,
            );
            engines.set(entry.engine, entry);
        }
    }
    const versions = [...engines.values()].sort((a, b) => a.engine.localeCompare(b.engine));
    const imports = versions.map(
        (entry, position) =>
            `import * as runtime${position} from "../../crafting-history/engines/${entry.implementation.sha256}.mjs";`,
    );
    const members = versions.map(
        (entry, position) => `${JSON.stringify(entry.engine)}: runtime${position},`,
    );
    const hashes = versions.map(
        (entry) =>
            `${JSON.stringify(entry.engine)}: ${JSON.stringify(entry.implementation.sha256)},`,
    );
    await atomicFile(
        registryPath,
        Buffer.from(
            [
                "// Generated by scripts/crafting-history.ts. Historical implementations are retained in crafting-history/.",
                'import type { HistoricalCraftingRuntime } from "./crafting-runtime";',
                ...imports,
                `export const craftingRuntimes: Readonly<Record<string, HistoricalCraftingRuntime>> = { ${members.join(" ")} };`,
                `export const craftingRuntimeHashes: Readonly<Record<string, string>> = { ${hashes.join(" ")} };`,
                "",
            ].join("\n"),
        ),
    );
    await atomicFile(resolve(output, "index.json"), json(index));
    return index;
}
