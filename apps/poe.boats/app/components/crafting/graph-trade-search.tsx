import type { ItemQuery } from "@poe-tools/item-query";
import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { CraftingCatalog } from "~/schemas/crafting";
import { type CraftingTradeResult, craftingTradeResultSchema } from "~/schemas/crafting-trade";
import { graphControl } from "./graph-query-editor";

export function GraphTradeSearch({
    query,
    catalog,
    league,
    onLeagueChange,
}: {
    query: ItemQuery;
    catalog: CraftingCatalog;
    league?: string;
    onLeagueChange: (league: string) => void;
}) {
    const [result, setResult] = useState<CraftingTradeResult>();
    const [error, setError] = useState<string>();
    const [busy, setBusy] = useState(false);
    const worker = useRef<Worker | null>(null);
    // biome-ignore lint/correctness/useExhaustiveDependencies: A search and its pending worker become stale when any source input changes.
    useEffect(() => {
        setResult(undefined);
        setError(undefined);
        setBusy(false);
        worker.current?.terminate();
        worker.current = null;
        return () => {
            worker.current?.terminate();
            worker.current = null;
        };
    }, [query, catalog, league]);

    function prepare() {
        worker.current?.terminate();
        setResult(undefined);
        setError(undefined);
        setBusy(true);
        const next = new Worker(new URL("../../lib/crafting-trade.worker.ts", import.meta.url), {
            type: "module",
        });
        worker.current = next;
        next.onmessage = ({
            data,
        }: MessageEvent<{ result?: CraftingTradeResult; error?: string }>) => {
            if (worker.current !== next) return;
            next.terminate();
            worker.current = null;
            setBusy(false);
            const parsed = craftingTradeResultSchema.safeParse(data.result);
            if (parsed.success) setResult(parsed.data);
            else setError(data.error ?? "Invalid trade translation result.");
        };
        next.onerror = () => {
            if (worker.current !== next) return;
            next.terminate();
            worker.current = null;
            setBusy(false);
            setError("Could not load trade definitions. Try again.");
        };
        const conditions = query.groups.flatMap((group) => group.filters);
        const baseIds = new Set(
            conditions.flatMap((condition) =>
                condition.kind === "base" && condition.field === "baseId" ? condition.values : [],
            ),
        );
        const modIds = new Set(
            conditions.flatMap((condition) =>
                condition.kind === "mod" ? (condition.ids ?? []) : [],
            ),
        );
        next.postMessage({
            query,
            league,
            catalog: {
                game: catalog.game,
                bases: Object.fromEntries(
                    [...baseIds].flatMap((id) =>
                        catalog.bases[id] ? [[id, catalog.bases[id]]] : [],
                    ),
                ),
                mods: Object.fromEntries(
                    [...modIds].flatMap((id) => (catalog.mods[id] ? [[id, catalog.mods[id]]] : [])),
                ),
            },
        });
    }
    return (
        <div className="space-y-3 rounded-md border border-border p-3">
            <Label className="block text-xs">
                Trade league
                <Input
                    className={graphControl}
                    value={league ?? ""}
                    placeholder="Enter the league name"
                    onChange={(event) => onLeagueChange(event.target.value)}
                />
            </Label>
            <Button
                variant="outline"
                size="sm"
                disabled={busy || !league?.trim()}
                onClick={prepare}
            >
                {busy ? "Preparing search…" : "Prepare trade search"}
            </Button>
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            {result && (
                <>
                    {query.groups.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                            No item requirements specified. This search includes all item types.
                        </p>
                    )}
                    <p className="text-sm">
                        {result.fidelity === "exact"
                            ? "All item conditions translated."
                            : "Approximate search — review the differences below."}
                    </p>
                    {result.warnings.length > 0 && (
                        <ul className="list-disc space-y-2 pl-4 text-xs text-muted-foreground">
                            {result.warnings.map((warning) => (
                                <li key={`${warning.group}:${warning.condition ?? "group"}`}>
                                    Group {warning.group + 1}
                                    {warning.condition === undefined
                                        ? ""
                                        : `, condition ${warning.condition + 1}`}
                                    : {warning.message}
                                </li>
                            ))}
                        </ul>
                    )}
                    <a
                        className="inline-block text-sm underline"
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Open trade search
                    </a>
                    <p className="text-xs text-muted-foreground">
                        Check listing prices, then enter a manual price on an acquisition
                        alternative. Listings are not fetched automatically. Trade definitions
                        checked {result.metadataDate.slice(0, 10)}.
                    </p>
                </>
            )}
        </div>
    );
}
