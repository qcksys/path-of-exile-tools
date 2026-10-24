import { useEffect, useMemo, useRef, useState } from "react";
import { CurrencyLabel } from "~/components/currency-label";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { CRAFTING_RULESET_INDEX_URL, validateRulesetIndex } from "~/lib/crafting-rulesets";
import { copyWorkbenchMarketPrices, workbenchPriceGraph } from "~/lib/crafting-workbench-prices";
import type { CraftingProject } from "~/schemas/crafting";
import type { CraftingRuleset } from "~/schemas/crafting-rulesets";
import { ExchangePricePicker } from "./exchange-price-picker";
import { SourcePricePicker } from "./source-price-picker";

export function WorkbenchMarketPrices({
    engine,
    project,
    entries,
    onChange,
}: {
    engine: CraftingEngine;
    project: CraftingProject;
    entries: [string, string][];
    onChange: (prices: CraftingProject["prices"]) => void;
}) {
    const [league, setLeague] = useState("");
    const [ruleset, setRuleset] = useState<CraftingRuleset>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const pending = useRef<AbortController | null>(null);
    useEffect(() => () => pending.current?.abort(), []);
    const graph = useMemo(
        () => (ruleset ? workbenchPriceGraph(engine, project, ruleset, league) : undefined),
        [engine, project, ruleset, league],
    );
    async function open() {
        pending.current?.abort();
        const controller = new AbortController();
        pending.current = controller;
        setBusy(true);
        setError("");
        try {
            const response = await fetch(CRAFTING_RULESET_INDEX_URL, {
                cache: "no-cache",
                signal: controller.signal,
            });
            if (!response.ok) throw new Error("Crafting price sources are unavailable.");
            const index = validateRulesetIndex(await response.json());
            const matching = index.revisions.find(
                (entry) =>
                    entry.game === engine.catalog.game &&
                    entry.patch === engine.catalog.patch &&
                    entry.manifestSha256 === engine.catalog.manifestSha256 &&
                    entry.craftingSha256 === engine.catalog.craftingSha256 &&
                    index.latest.some(
                        (latest) =>
                            latest.game === entry.game &&
                            latest.era === entry.era &&
                            latest.revision === entry.revision,
                    ),
            );
            if (!matching) throw new Error("This catalog has no published price-source revision.");
            if (!controller.signal.aborted) setRuleset(matching);
        } catch (error) {
            if (!controller.signal.aborted)
                setError(error instanceof Error ? error.message : "Price lookup failed.");
        } finally {
            if (!controller.signal.aborted) setBusy(false);
        }
    }
    const apply = (next: NonNullable<typeof graph>) => {
        if (next.league !== graph?.league && next.prices === graph?.prices) {
            setLeague(next.league ?? "");
            setError("");
            return;
        }
        try {
            onChange(
                copyWorkbenchMarketPrices(
                    project,
                    next,
                    league,
                    entries.map(([id]) => id),
                ),
            );
        } catch (error) {
            setError(error instanceof Error ? error.message : "Cannot copy market prices.");
        }
    };
    return (
        <section
            aria-label="Workbench market prices"
            className="space-y-3 border-t border-border pt-3"
        >
            <p className="text-xs text-muted-foreground">
                Copy selected market estimates into your{" "}
                <CurrencyLabel currency="chaos" game={engine.catalog.game} /> prices. Entered
                amounts stay until you explicitly replace them. Copied estimates are fixed amounts;
                look them up again to update them. Starting item cost is entered separately.
            </p>
            {graph ? (
                <>
                    <Label className="block space-y-1 text-xs">
                        Price lookup league
                        <Input
                            value={league}
                            onChange={(event) => setLeague(event.target.value)}
                            placeholder="Enter league"
                            maxLength={100}
                        />
                    </Label>
                    <ExchangePricePicker
                        graph={graph}
                        entries={entries}
                        onChange={apply}
                        copyOnly
                    />
                    <SourcePricePicker
                        graph={graph}
                        engine={engine}
                        entries={entries}
                        onChange={apply}
                    />
                </>
            ) : (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void open()}>
                    {busy ? "Loading price sources…" : "Find market prices"}
                </Button>
            )}
            {error && (
                <p role="alert" className="text-xs">
                    {error}
                </p>
            )}
        </section>
    );
}
