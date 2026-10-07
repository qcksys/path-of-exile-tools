import { seededRandom } from "../app/lib/crafting-engine";
import { catalog, engine } from "./crafting-fixtures";
import { anyItem, graphFixture, queryMods, quote } from "./crafting-graph-fixtures";

export const nnnBase = (name: string, level = 86) =>
    engine.createItem(
        Object.entries(catalog.bases).find(([, value]) => value.name === name)![0],
        level,
    );
export const rage = catalog.crafting.essences.find(
    (entry) => entry.name === "Screaming Essence of Rage",
)!;
export const strength = rage.mods["Body Armour"]!;
export const nnnDonor = () =>
    engine.addStartingMod(nnnBase("Necrotic Armour"), strength, seededRandom(1), "essence");
export const suppressionDonor = (name: string) => {
    const item = nnnBase(name);
    const mod = engine
        .pool({ ...item, rarity: "rare" })
        .find((entry) => entry.mod.name === "of Nullification")!;
    return engine.addStartingMod(item, mod.id, seededRandom(1));
};
export function nnnGraph() {
    const graph = graphFixture();
    const left = suppressionDonor("Zodiac Leather");
    const right = nnnDonor();
    graph.name = "Suppression NNN transfer";
    graph.nodes = [
        {
            kind: "acquire",
            id: "a",
            name: "Suppression donor",
            output: anyItem,
            choice: { mode: "automatic" },
            alternatives: [
                {
                    kind: "purchase",
                    id: "buy",
                    name: "Buy suppression",
                    item: left,
                    price: quote(10),
                },
            ],
        },
        {
            kind: "acquire",
            id: "b",
            name: "NNN donor",
            output: anyItem,
            choice: { mode: "automatic" },
            alternatives: [
                {
                    kind: "purchase",
                    id: "buy",
                    name: "Buy isolated Strength",
                    item: right,
                    price: quote(20),
                },
            ],
        },
        {
            kind: "craft",
            id: "combine",
            name: "Transfer suppression",
            output: anyItem,
            inputs: [
                { id: "left", name: "Suppression", source: "a" },
                { id: "right", name: "NNN", source: "b" },
            ],
            method: { kind: "recombine", id: "recombine" },
            branches: [],
            ordering: "automatic",
            fallback: { kind: "return" },
        },
    ];
    graph.outcomes = [
        {
            id: "target",
            name: "Suppression survives",
            query: queryMods(left.mods[0]!.id),
            success: true,
            disposition: "keep",
            price: null,
        },
    ];
    graph.iterations = 8;
    return graph;
}
