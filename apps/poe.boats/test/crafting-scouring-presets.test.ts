import { itemQuerySchema } from "@poe-tools/item-query";
import { expect, it } from "vite-plus/test";
import { seededRandom } from "../app/lib/crafting-engine";
import { projectFromPreset } from "../app/lib/crafting-presets";
import type { CraftingPresetId } from "../app/schemas/crafting-presets";
import { currency, engine } from "./crafting-fixtures";
import { quote, runGraphTrial } from "./crafting-graph-fixtures";
import { historyIndex } from "./crafting-history-fixtures";

const prior = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r11",
)!;
const ruleset = { ...prior, revision: "r14", engine: "crafting-graph-14" };
const sources: [CraftingPresetId, string, string][] = [
    ["life-block-shield", "block-make-base", "Heat-attuned Tower Shield"],
    ["life-block-shield", "max-res-make-base", "Heat-attuned Tower Shield"],
    ["life-block-shield", "recovery-make-base", "Pinnacle Tower Shield"],
    ["es-block-shield", "flat-make-base", "Titanium Spirit Shield"],
    ["rarity-helmet", "donor-0-1-make-base", "Hubris Circlet"],
    ["rarity-helmet", "donor-1-0-make-base", "Hubris Circlet"],
    ["rarity-helmet", "donor-1-1-make-base", "Hubris Circlet"],
];

it.each(
    sources,
)("adds paid sources to %s/%s while preserving the original purchase", (preset, id, name) => {
    const old = projectFromPreset(engine, prior, preset);
    const graph = projectFromPreset(engine, ruleset, preset);
    const before = old.nodes.find((node) => node.id === id)!;
    const node = graph.nodes.find((node) => node.id === id)!;
    if (before.kind !== "acquire" || node.kind !== "acquire")
        throw new Error("Expected base acquisition.");
    const sources = node.alternatives.filter(
        (entry) => entry.kind === "purchase" && entry.sourcePreparation?.kind === "scour-v1",
    );
    expect(sources).toHaveLength(4);
    expect(node.alternatives.slice(0, before.alternatives.length)).toEqual(before.alternatives);
    expect(node.choice).toEqual(before.choice);
    expect(node.output).toEqual(before.output);
    for (const source of sources) {
        if (source.kind !== "purchase") throw new Error("Expected source purchase.");
        expect(source.price).toBeNull();
        expect(source.item).toEqual(
            before.alternatives[0]?.kind === "purchase" ? before.alternatives[0].item : null,
        );
        expect(source.item).toMatchObject({ level: 86, rarity: "normal", mods: [] });
        expect(engine.base(source.item).name).toBe(name);
    }
    expect(graph.outcomes).toEqual(old.outcomes);
    expect(graph.prices).toEqual(old.prices);
    expect(graph.nodes).toHaveLength(old.nodes.length);
});

it.each(
    sources,
)("charges cleanup once before the existing Transmutation in %s/%s", (preset, id) => {
    const graph = projectFromPreset(engine, ruleset, preset);
    const node = graph.nodes.find((entry) => entry.id === id)!;
    if (node.kind !== "acquire") throw new Error("Expected base acquisition.");
    const source = node.alternatives.find((entry) => entry.id === "buy-scour-crafted-enchanted")!;
    if (source.kind !== "purchase") throw new Error("Expected source purchase.");
    source.price = quote(7);
    node.choice = { mode: "pinned", alternativeId: source.id };
    const scour = currency("convert_to_normal").id;
    const transmute = currency("transmute_to_magic").id;
    graph.prices[scour] = quote(2);
    graph.prices[transmute] = quote(3);
    graph.entry = `${id.slice(0, -5)}-transmute`;
    graph.outcomes[0]!.query = itemQuerySchema.parse({
        game: "poe1",
        groups: [{ type: "and", filters: [{ kind: "rarity", values: ["Magic"] }] }],
    });
    const result = runGraphTrial(graph, seededRandom(42));
    expect(result).toMatchObject({
        success: true,
        purchases: 1,
        actions: 4,
        cost: 20,
        missingPrices: [],
    });
    expect(result.spending[scour]).toBe(5);
    expect(result.spending[transmute]).toBe(1);
});

it("preserves the four r11 mercenary sources in r14", () => {
    const before = projectFromPreset(engine, prior, "sushi-mercenary-chest");
    const graph = projectFromPreset(engine, ruleset, "sushi-mercenary-chest");
    expect(graph.nodes).toEqual(before.nodes);
    expect(graph.outcomes).toEqual(before.outcomes);
    expect(graph.prices).toEqual(before.prices);
});
