import { exchangeSnapshotSchema, quoteExchangeSnapshot } from "@poe-tools/market";
import { craftingGraphSchema } from "../app/schemas/crafting-graph";
import { quote } from "./crafting-graph-fixtures";
import { marketGraph } from "./crafting-market-fixtures";

export const transmuteId = "Metadata/Items/Currency/CurrencyUpgradeToMagic";
export const chaosId = "Metadata/Items/Currency/CurrencyRerollRare";
export const exchangeSnapshot = exchangeSnapshotSchema.parse({
    realm: "pc",
    league: "Standard",
    marketId: `${transmuteId}|${chaosId}`,
    hour: 1790899200,
    volumeTraded: { [transmuteId]: 100, [chaosId]: 200 },
    lowestRatio: { [transmuteId]: 1, [chaosId]: 1 },
    highestRatio: { [transmuteId]: 1, [chaosId]: 3 },
});
export const exchangeQuote = quoteExchangeSnapshot(exchangeSnapshot, transmuteId, chaosId)!;
export function exchangeGraph() {
    const graph = marketGraph();
    const node = graph.nodes[0]!;
    if (node.kind !== "acquire" || node.alternatives[0]?.kind !== "purchase")
        throw new Error("Fixture");
    node.alternatives[0].price = quote(10);
    return craftingGraphSchema.parse({
        ...graph,
        name: "Exchange-priced craft",
        entry: "transmute",
        prices: {},
        nodes: [
            ...graph.nodes,
            {
                kind: "craft",
                id: "transmute",
                name: "Transmute base",
                output: node.output,
                method: { kind: "currency", id: transmuteId },
                inputs: [{ id: "item", name: "Base", source: "base" }],
            },
        ],
    });
}
