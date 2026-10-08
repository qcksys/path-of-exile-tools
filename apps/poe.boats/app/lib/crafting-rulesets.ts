import type { CraftingMethod } from "../schemas/crafting";
import { type CraftingGraph, craftingGraphSchema } from "../schemas/crafting-graph";
import {
    type CraftingRuleset,
    type CraftingRulesetIndex,
    type CraftingRulesetRef,
    craftingRulesetIndexSchema,
    craftingRulesetRefSchema,
} from "../schemas/crafting-rulesets";

export const CRAFTING_RULESET_INDEX_URL = "/game-data/history/index.json";
export const craftingCatalogUrl = (ruleset: CraftingRuleset) =>
    `/game-data/history/catalogs/${ruleset.catalog.sha256}.json`;
export const craftingImplementationUrl = (ruleset: CraftingRuleset) =>
    `/game-data/history/engines/${ruleset.implementation.sha256}.mjs`;
export const rulesetReference = (ruleset: CraftingRuleset): CraftingRulesetRef =>
    craftingRulesetRefSchema.strip().parse(ruleset);
const key = (value: { game: string; era: string; revision: string }) =>
    JSON.stringify([value.game, value.era, value.revision]);

export function validateRulesetIndex(input: unknown): CraftingRulesetIndex {
    const index = craftingRulesetIndexSchema.parse(input);
    const revisions = new Set<string>();
    const engines = new Map<string, string>();
    for (const entry of index.revisions) {
        if (revisions.has(key(entry))) throw new Error("Duplicate crafting ruleset revision.");
        revisions.add(key(entry));
        const prior = engines.get(entry.engine);
        if (prior && prior !== entry.implementation.sha256)
            throw new Error("One engine revision cannot refer to different implementations.");
        engines.set(entry.engine, entry.implementation.sha256);
    }
    const eras = new Set<string>();
    for (const latest of index.latest) {
        const era = JSON.stringify([latest.game, latest.era]);
        if (eras.has(era)) throw new Error("Duplicate latest revision for a crafting era.");
        eras.add(era);
        if (!revisions.has(key(latest))) throw new Error("Latest crafting revision is missing.");
    }
    return index;
}

export function resolveRuleset(
    index: CraftingRulesetIndex,
    game: CraftingRuleset["game"],
    reference: CraftingRulesetRef,
): CraftingRuleset {
    const entry = index.revisions.find((entry) => key(entry) === key({ game, ...reference }));
    if (!entry) throw new Error("The pinned crafting ruleset is unavailable.");
    const expected = rulesetReference(entry);
    for (const field of Object.keys(expected) as (keyof CraftingRulesetRef)[])
        if (expected[field] !== reference[field])
            throw new Error("The crafting ruleset pin does not match its published revision.");
    return entry;
}

export function availableCorrection(index: CraftingRulesetIndex, graph: CraftingGraph) {
    resolveRuleset(index, graph.game, graph.ruleset);
    const latest = index.latest.find(
        (entry) => entry.game === graph.game && entry.era === graph.ruleset.era,
    );
    if (!latest || latest.revision === graph.ruleset.revision) return null;
    return index.revisions.find((entry) => key(entry) === key(latest)) ?? null;
}

export function rulesetAllowsMethod(ruleset: CraftingRuleset, method: CraftingMethod) {
    return (
        ruleset.availability.kinds.includes(method.kind) &&
        !("allflame" in method && method.allflame && !ruleset.availability.allflame) &&
        !ruleset.availability.disabled.some(
            (entry) => entry.kind === method.kind && "id" in method && entry.id === method.id,
        )
    );
}

export function rulesetAllowsConditionalSteps(ruleset: Pick<CraftingRuleset, "engine">) {
    return ["crafting-graph-5", "crafting-graph-6", "crafting-graph-7"].includes(ruleset.engine);
}

export function validateRulesetGraph(ruleset: CraftingRuleset, input: unknown) {
    const graph = craftingGraphSchema.parse(input);
    resolveRuleset({ format: 1, revisions: [ruleset], latest: [] }, graph.game, graph.ruleset);
    for (const node of graph.nodes) {
        if (node.kind !== "craft") continue;
        if (node.smart && ruleset.engine !== "crafting-graph-7")
            throw new Error(`${node.name} requires a revision with simple crafting outcomes.`);
        if (!rulesetAllowsMethod(ruleset, node.method))
            throw new Error(`${node.name} uses a method unavailable in ${ruleset.label}.`);
        if (node.applyWhen && !rulesetAllowsConditionalSteps(ruleset))
            throw new Error(`${node.name} requires a revision with conditional crafting steps.`);
    }
    return graph;
}

export function adoptRuleset(graph: CraftingGraph, ruleset: CraftingRuleset) {
    if (graph.game !== ruleset.game) throw new Error("A project cannot change games.");
    return validateRulesetGraph(ruleset, { ...graph, ruleset: rulesetReference(ruleset) });
}

export async function verifyCraftingArtifact(
    bytes: Uint8Array<ArrayBuffer>,
    expected: { sha256: string; bytes: number },
) {
    if (bytes.byteLength !== expected.bytes)
        throw new Error("Crafting artifact size differs from its published revision.");
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
    ).join("");
    if (hash !== expected.sha256)
        throw new Error("Crafting artifact hash differs from its published revision.");
}
