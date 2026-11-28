import catalog from "../data/collector-items.json" with { type: "json" };

export const collectorItems = catalog;

export function collectorMarketKey(asset: string, identified: boolean) {
    return `collector:${identified ? "" : "unid:"}${asset}`;
}
