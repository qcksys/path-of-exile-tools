import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { calculateCraftingGraph } from "../app/lib/crafting-graph-simulation";
import { loadCraftingRevision } from "../app/lib/crafting-ruleset-loader";
import {
    adoptRuleset,
    availableCorrection,
    resolveRuleset,
    rulesetReference,
    validateRulesetGraph,
    validateRulesetIndex,
    verifyCraftingArtifact,
} from "../app/lib/crafting-rulesets";
import { craftingRuntimes } from "../app/lib/crafting-runtimes.generated";
import { craftingGraphResultSchema } from "../app/schemas/crafting-graph-result";
import type { CraftingRuleset } from "../app/schemas/crafting-rulesets";
import {
    materializeCraftingHistory,
    publishCraftingRevision,
    readCraftingHistory,
} from "../scripts/crafting-history";
import { conditionalTransmuteGraph } from "./crafting-conditional-fixtures";
import { catalog } from "./crafting-fixtures";
import { graphFixture } from "./crafting-graph-fixtures";
import {
    historyIndex,
    retainedRevision,
    retainedTransmuteGraph,
} from "./crafting-history-fixtures";
import { nnnGraph } from "./crafting-nnn-fixtures";

const directories: string[] = [];
afterEach(async () => {
    for (const directory of directories.splice(0))
        await rm(directory, { recursive: true, force: true });
});
const current = historyIndex.revisions.find(
    (entry) =>
        entry.game === "poe1" &&
        entry.revision === historyIndex.latest.find((latest) => latest.game === "poe1")!.revision,
)!;
const metadata = (entry: CraftingRuleset) => ({
    era: entry.era,
    revision: entry.revision,
    label: entry.label,
    notes: entry.notes,
    availability: entry.availability,
});

async function archiveFixture() {
    const directory = await mkdtemp(join(tmpdir(), "crafting-history-"));
    directories.push(directory);
    const archive = join(directory, "archive");
    const catalogBytes = await readFile("public/game-data/crafting-poe1.json");
    const engineBytes = await readFile(
        `crafting-history/engines/${current.implementation.sha256}.mjs`,
    );
    await publishCraftingRevision(
        archive,
        catalogBytes,
        engineBytes,
        metadata(current),
        current.publishedAt,
    );
    return { directory, archive, catalogBytes, engineBytes };
}

describe("retained crafting rulesets", () => {
    it.each([
        "poe1",
        "poe2",
    ] as const)("preserves old %s behavior and supports conditional preparation only in r5", async (game) => {
        const graph = conditionalTransmuteGraph(game);
        const old = historyIndex.revisions.find(
            (entry) => entry.game === game && entry.revision === "r4",
        )!;
        expect(() => adoptRuleset(graph, old)).toThrow("conditional crafting steps");
        const previous = await retainedRevision(old);
        expect(() =>
            previous.runtime.createSimulation(previous.catalog, {
                ...graph,
                ruleset: rulesetReference(old),
            }),
        ).toThrow();
        const latest = historyIndex.revisions.find(
            (entry) => entry.game === game && entry.revision === "r5",
        )!;
        const loaded = await retainedRevision(latest);
        const simulation = loaded.runtime.createSimulation(loaded.catalog, graph, {
            estimateIterations: 1,
        });
        while (!simulation.runBatch()) {
            /* Run the published implementation. */
        }
        expect(simulation.result()).toMatchObject({
            complete: true,
            meanCost: 10,
            meanActions: 0,
            probability: 1,
            visits: { transmute: { skipped: 3 } },
        });
    });
    it("adds NNN support in r3 while the retained r2 calculation still refuses it", async () => {
        for (const revision of ["r2", "r3"]) {
            const ruleset = historyIndex.revisions.find(
                (entry) => entry.game === "poe1" && entry.revision === revision,
            )!;
            const loaded = await retainedRevision(ruleset);
            const graph = { ...nnnGraph(), ruleset: rulesetReference(ruleset) };
            const simulation = loaded.runtime.createSimulation(loaded.catalog, graph, {
                estimateIterations: 2,
                workLimit: 1000,
            });
            while (!simulation.runBatch()) {
                /* Run the actual retained implementation. */
            }
            const result = simulation.result();
            if (revision === "r3")
                expect(result).toMatchObject({
                    complete: true,
                    meanCost: 31,
                    meanActions: 1,
                    probability: 1,
                    errors: {},
                });
            else {
                expect(result.meanCost).toBeNull();
                expect(JSON.stringify(result)).toContain("supports natural modifiers");
            }
        }
    });
    it.each(
        historyIndex.revisions,
    )("executes a complete $game craft with retained $revision/$engine", async (ruleset) => {
        const loaded = await retainedRevision(ruleset);
        const graph = retainedTransmuteGraph(ruleset, loaded.catalog);
        const simulation = loaded.runtime.createSimulation(loaded.catalog, graph, {
            estimateIterations: 2,
        });
        while (!simulation.runBatch()) {
            /* Execute the retained implementation. */
        }
        expect(simulation.result()).toMatchObject({
            complete: true,
            meanCost: 11,
            meanActions: 1,
            probability: 1,
        });
    });

    it("executes a retained self-contained engine and catalog with the same graph result", async () => {
        const loaded = await retainedRevision(current);
        const graph = graphFixture();
        const simulation = loaded.runtime.createSimulation(loaded.catalog, graph, {
            estimateIterations: 3,
            workLimit: 1000,
        });
        while (!simulation.runBatch()) {
            /* Use the historical execution contract. */
        }
        expect(craftingGraphResultSchema.parse(simulation.result())).toEqual(
            calculateCraftingGraph(catalog, graph, { estimateIterations: 3, workLimit: 1000 }),
        );
    });

    it("publishes corrections without overwriting prior data and deduplicates unchanged artifacts", async () => {
        const { directory, archive, catalogBytes, engineBytes } = await archiveFixture();
        const original = await readCraftingHistory(archive);
        await publishCraftingRevision(archive, catalogBytes, engineBytes, metadata(current));
        expect(await readCraftingHistory(archive)).toEqual(original);
        const correction = await publishCraftingRevision(archive, catalogBytes, engineBytes, {
            ...metadata(current),
            revision: "fixture-correction",
            notes: "A reviewed availability correction.",
            availability: { ...current.availability, allflame: false },
        });
        const index = await readCraftingHistory(archive);
        expect(index.revisions).toHaveLength(2);
        expect(index.revisions[0]).toEqual(current);
        expect(await readdir(join(archive, "catalogs"))).toHaveLength(1);
        expect(
            (await readdir(join(archive, "engines"))).filter((name) => name.endsWith(".mjs")),
        ).toHaveLength(1);
        const graph = graphFixture();
        const originalGraph = structuredClone(graph);
        expect(availableCorrection(index, graph)).toEqual(correction);
        expect(resolveRuleset(index, graph.game, graph.ruleset)).toEqual(current);
        const updated = adoptRuleset(graph, correction);
        expect(updated.ruleset.revision).toBe("fixture-correction");
        expect(updated.prices).toEqual(graph.prices);
        expect(graph).toEqual(originalGraph);
        const output = join(directory, "public");
        await materializeCraftingHistory(archive, output, join(directory, "registry.ts"));
        expect(
            (await readFile(join(output, "catalogs", `${current.catalog.sha256}.json`))).equals(
                catalogBytes,
            ),
        ).toBe(true);
        expect(
            (
                await readFile(join(output, "engines", `${current.implementation.sha256}.mjs`))
            ).equals(engineBytes),
        ).toBe(true);
    });

    it("refuses changed revisions and reused implementation names with different code", async () => {
        const { archive, catalogBytes, engineBytes } = await archiveFixture();
        await expect(
            publishCraftingRevision(archive, catalogBytes, engineBytes, {
                ...metadata(current),
                notes: "Overwritten",
            }),
        ).rejects.toThrow("immutable");
        await expect(
            publishCraftingRevision(
                archive,
                catalogBytes,
                Buffer.concat([engineBytes, Buffer.from("\n// changed")]),
                { ...metadata(current), revision: "fixture-correction" },
            ),
        ).rejects.toThrow("different implementations");
        expect((await readCraftingHistory(archive)).revisions).toHaveLength(1);
    });

    it("retains a removed method in the old revision and refuses it after explicit adoption", () => {
        const graph = graphFixture();
        const newer: CraftingRuleset = {
            ...current,
            revision: "fixture-correction",
            availability: { ...current.availability, kinds: ["currency"] },
        };
        expect(validateRulesetGraph(current, graph)).toEqual(graph);
        expect(() => adoptRuleset(graph, newer)).toThrow("unavailable");
        const allflame = structuredClone(graph);
        allflame.nodes.find((node) => node.kind === "craft")!.method = {
            kind: "currency",
            id: "example",
            allflame: true,
        };
        expect(() => validateRulesetGraph(current, allflame)).not.toThrow();
        expect(() =>
            adoptRuleset(allflame, {
                ...newer,
                availability: { ...newer.availability, allflame: false },
            }),
        ).toThrow("unavailable");
    });

    it("refuses invalid index pointers, altered pins, corrupt artifacts and wrong runtime revisions", async () => {
        expect(() =>
            validateRulesetIndex({
                ...historyIndex,
                latest: [{ game: "poe1", era: "3.29", revision: "absent" }],
            }),
        ).toThrow("missing");
        expect(() =>
            resolveRuleset(historyIndex, "poe1", {
                ...rulesetReference(current),
                engine: "other-engine",
            }),
        ).toThrow("pin");
        const bytes = new Uint8Array(await readFile("public/game-data/crafting-poe1.json"));
        await expect(verifyCraftingArtifact(bytes.subarray(1), current.catalog)).rejects.toThrow(
            "size",
        );
        const corrupt = new Uint8Array(bytes);
        corrupt[0] = 0;
        await expect(verifyCraftingArtifact(corrupt, current.catalog)).rejects.toThrow("hash");
        await expect(
            loadCraftingRevision(
                current,
                async () => bytes,
                async () => ({ ...craftingRuntimes[current.engine]!, revision: "wrong" }),
            ),
        ).rejects.toThrow("implementation");
        const { archive, directory } = await archiveFixture();
        await writeFile(
            resolve(archive, "engines", `${current.implementation.sha256}.mjs`),
            "corrupt",
        );
        await expect(
            materializeCraftingHistory(
                archive,
                join(directory, "public"),
                join(directory, "registry.ts"),
            ),
        ).rejects.toThrow("implementation hash");
    });
});
