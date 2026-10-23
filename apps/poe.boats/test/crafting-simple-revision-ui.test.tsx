// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { GraphNodeEditor } from "../app/components/crafting/graph-node-editor";
import { rulesetReference, validateRulesetIndex } from "../app/lib/crafting-rulesets";
import index from "../crafting-history/index.json";
import { exchangeGraph } from "./crafting-exchange-fixtures";
import { engine } from "./crafting-fixtures";

const historyIndex = validateRulesetIndex(index);

afterEach(cleanup);

it.each([
    "crafting-graph-7",
    "crafting-graph-8",
    "crafting-graph-9",
    "crafting-graph-10",
])("keeps simple crafting controls available for %s", (engineRevision) => {
    const original = historyIndex.revisions.find(
        (entry) => entry.game === "poe1" && entry.revision === "r7",
    )!;
    const ruleset = { ...original, engine: engineRevision };
    const graph = { ...exchangeGraph(), ruleset: rulesetReference(ruleset) };
    const node = graph.nodes.find((entry) => entry.kind === "craft")!;
    const changed = vi.fn();
    const failed = vi.fn();
    render(
        <GraphNodeEditor
            graph={graph}
            node={node}
            ruleset={ruleset}
            engine={engine}
            onChange={changed}
            onError={failed}
        />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Use simple outcomes" }));
    expect(failed).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledWith({
        ...graph,
        nodes: expect.arrayContaining([
            expect.objectContaining({ id: node.id, smart: { kind: "once" } }),
        ]),
    });
});
