import { itemQuerySchema } from "@poe-tools/item-query";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { CraftingCatalog } from "~/schemas/crafting";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import { GraphPriceInput } from "./graph-node-editor";
import { GraphQueryEditor, graphControl } from "./graph-query-editor";

export function GraphOutcomeEditor({
    graph,
    catalog,
    outcomeId,
    onChange: update,
    onError: fail,
}: {
    graph: CraftingGraph;
    catalog: CraftingCatalog;
    outcomeId: string;
    onChange: (graph: CraftingGraph) => void;
    onError: (error: unknown) => void;
}) {
    return (
        <section aria-label="Outcome editor" className="space-y-3 p-3">
            <p className="mt-2 text-xs text-muted-foreground">
                Only specified properties matter. More specific queries route first unless you
                choose manual order.
            </p>
            <div className="mt-4 space-y-4">
                {graph.outcomes.map((outcome, i) =>
                    outcome.id !== outcomeId ? null : (
                        <section key={outcome.id} className="space-y-3 border-t border-border pt-3">
                            <Input
                                key={outcome.name}
                                aria-label="Outcome name"
                                className={graphControl}
                                defaultValue={outcome.name}
                                onBlur={(event) => {
                                    if (event.target.value.trim())
                                        update({
                                            ...graph,
                                            outcomes: graph.outcomes.map((entry) =>
                                                entry.id === outcome.id
                                                    ? {
                                                          ...entry,
                                                          name: event.target.value,
                                                      }
                                                    : entry,
                                            ),
                                        });
                                }}
                            />
                            <GraphQueryEditor
                                label="Outcome requirements"
                                ruleset={graph.ruleset}
                                catalog={catalog}
                                value={outcome.query}
                                onChange={(query) =>
                                    update({
                                        ...graph,
                                        outcomes: graph.outcomes.map((entry) =>
                                            entry.id === outcome.id ? { ...entry, query } : entry,
                                        ),
                                    })
                                }
                            />
                            <Label className="flex gap-2 text-xs">
                                <Checkbox
                                    checked={outcome.success}
                                    onCheckedChange={(checked) =>
                                        update({
                                            ...graph,
                                            outcomes: graph.outcomes.map((entry) =>
                                                entry.id === outcome.id
                                                    ? {
                                                          ...entry,
                                                          success: checked,
                                                      }
                                                    : entry,
                                            ),
                                        })
                                    }
                                />
                                Count as a successful result
                            </Label>
                            <Label className="block text-xs">
                                Disposition
                                <FormSelect
                                    className={graphControl}
                                    value={outcome.disposition}
                                    onValueChange={(selectedValue) =>
                                        update({
                                            ...graph,
                                            outcomes: graph.outcomes.map((entry) =>
                                                entry.id === outcome.id
                                                    ? {
                                                          ...entry,
                                                          disposition:
                                                              selectedValue as typeof outcome.disposition,
                                                      }
                                                    : entry,
                                            ),
                                        })
                                    }
                                >
                                    <FormSelectItem value="keep">Keep</FormSelectItem>
                                    <FormSelectItem value="sell">Sell</FormSelectItem>
                                    <FormSelectItem value="discard">Discard</FormSelectItem>
                                </FormSelect>
                            </Label>
                            {outcome.disposition === "sell" && (
                                <GraphPriceInput
                                    label="Sale price"
                                    currency={graph.currency}
                                    value={graph.prices[`outcome:${outcome.id}`] ?? outcome.price}
                                    onChange={(price) => {
                                        const prices = { ...graph.prices };
                                        delete prices[`outcome:${outcome.id}`];
                                        update({
                                            ...graph,
                                            prices,
                                            outcomes: graph.outcomes.map((entry) =>
                                                entry.id === outcome.id
                                                    ? { ...entry, price }
                                                    : entry,
                                            ),
                                        });
                                    }}
                                />
                            )}
                            <Button
                                size="sm"
                                variant="ghost"
                                disabled={i === 0}
                                onClick={() => {
                                    const outcomes = [...graph.outcomes];
                                    outcomes.splice(i - 1, 0, outcomes.splice(i, 1)[0]!);
                                    update({
                                        ...graph,
                                        outcomes,
                                        outcomeOrdering: "manual",
                                    });
                                }}
                            >
                                Move outcome up
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                disabled={i === graph.outcomes.length - 1}
                                onClick={() => {
                                    const outcomes = [...graph.outcomes];
                                    outcomes.splice(i + 1, 0, outcomes.splice(i, 1)[0]!);
                                    update({
                                        ...graph,
                                        outcomes,
                                        outcomeOrdering: "manual",
                                    });
                                }}
                            >
                                Move outcome down
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                disabled={graph.outcomes.length === 1}
                                onClick={() => {
                                    const referenced = graph.nodes.some(
                                        (node) =>
                                            node.kind === "craft" &&
                                            [
                                                node.fallback,
                                                ...node.branches.map(
                                                    (branch) => branch.destination,
                                                ),
                                            ].some(
                                                (destination) =>
                                                    destination.kind === "terminal" &&
                                                    destination.outcomeId === outcome.id,
                                            ),
                                    );
                                    if (referenced) {
                                        fail(
                                            "Redirect branches that finish at this outcome before removing it.",
                                        );
                                        return;
                                    }
                                    const prices = { ...graph.prices };
                                    delete prices[`outcome:${outcome.id}`];
                                    update({
                                        ...graph,
                                        prices,
                                        outcomes: graph.outcomes.filter(
                                            (entry) => entry.id !== outcome.id,
                                        ),
                                    });
                                }}
                            >
                                Remove outcome
                            </Button>
                        </section>
                    ),
                )}
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                        update({
                            ...graph,
                            outcomes: [
                                ...graph.outcomes,
                                {
                                    id: crypto.randomUUID(),
                                    name: `Outcome ${graph.outcomes.length + 1}`,
                                    query: itemQuerySchema.parse({
                                        game: graph.game,
                                    }),
                                    success: false,
                                    disposition: "discard",
                                    price: null,
                                },
                            ],
                        })
                    }
                >
                    Add terminal outcome
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => update({ ...graph, outcomeOrdering: "automatic" })}
                >
                    {graph.outcomeOrdering === "automatic"
                        ? "Automatic outcome ordering"
                        : "Restore automatic outcome ordering"}
                </Button>
            </div>
        </section>
    );
}
