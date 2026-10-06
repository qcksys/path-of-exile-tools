import type { AffixDistribution } from "~/lib/crafting-distributions";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { modText } from "./item-card";

export function SuccessDistribution({
    engine,
    rows,
    successes,
}: {
    engine: CraftingEngine;
    rows: AffixDistribution[];
    successes: number;
}) {
    return (
        <details className="rounded-lg border border-border bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium">
                Affix distribution on success
            </summary>
            <p className="mt-3 text-xs text-muted-foreground">
                All {successes.toLocaleString()} successful items, including unstored outcomes.
                Tiers are grouped by modifier family and source. Presence is the percentage of
                successful items containing that family. Unrevealed placeholders are excluded.
            </p>
            {!rows.length ? (
                <p className="mt-3 text-sm text-muted-foreground">
                    No revealed affixes on successful items.
                </p>
            ) : null}
            {(["prefix", "suffix"] as const).map((side) => {
                const entries = rows
                    .filter((row) => row.side === side)
                    .sort((a, b) => b.items - a.items || a.key.localeCompare(b.key));
                if (!entries.length) return null;
                return (
                    <div key={side} className="mt-4 overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <caption className="mb-2 text-left text-sm font-medium">
                                {side === "prefix" ? "Prefixes" : "Suffixes"}
                            </caption>
                            <thead>
                                <tr className="border-b border-border">
                                    <th scope="col" className="pb-2 pr-3">
                                        Modifier family
                                    </th>
                                    <th
                                        scope="col"
                                        className="whitespace-nowrap pb-2 pr-3 text-right"
                                    >
                                        Avg. tier
                                    </th>
                                    <th scope="col" className="pb-2 pr-3 text-right">
                                        Count
                                    </th>
                                    <th scope="col" className="pb-2 text-right">
                                        Presence
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map((row) => {
                                    const mod = engine.mod(row.modId);
                                    const text = modText(mod);
                                    const label = clusterModPassives(engine.catalog, mod).length
                                        ? text
                                        : text.replace(
                                              /\(-?\d+(?:\.\d+)?--?\d+(?:\.\d+)?\)|\d+(?:\.\d+)?/g,
                                              "#",
                                          );
                                    return (
                                        <tr
                                            key={row.key}
                                            className="border-b border-border/50 last:border-0"
                                        >
                                            <th
                                                scope="row"
                                                className="whitespace-pre-line py-2 pr-3 font-normal"
                                            >
                                                {label}
                                                {row.essence ? " · essence" : ""}
                                            </th>
                                            <td className="py-2 pr-3 text-right font-mono">
                                                {row.ranked === row.count
                                                    ? (row.tierTotal / row.count).toFixed(2)
                                                    : "—"}
                                            </td>
                                            <td className="py-2 pr-3 text-right font-mono">
                                                {row.count.toLocaleString()}
                                            </td>
                                            <td className="py-2 text-right font-mono">
                                                {successes
                                                    ? ((row.items / successes) * 100).toFixed(1)
                                                    : "0.0"}
                                                %
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                );
            })}
            {rows.some((row) => row.ranked !== row.count) ? (
                <p className="mt-3 text-xs text-muted-foreground">
                    A dash means this build cannot rank every observed modifier in that family.
                </p>
            ) : null}
        </details>
    );
}

import { clusterModPassives } from "~/lib/crafting-clusters";
