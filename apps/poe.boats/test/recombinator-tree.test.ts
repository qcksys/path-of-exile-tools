import { describe, expect, it } from "vite-plus/test";
import { exampleRecombinatorDraft } from "~/lib/recombinator-plan";
import {
    connectTreeStep,
    draftAffixes,
    isValidTreeConnection,
    layoutRecombinatorTree,
    toggleDraftAffixFlag,
} from "~/lib/recombinator-tree";

describe("crafting tree", () => {
    it("places every source before its consumers with no overlapping cards", () => {
        const draft = exampleRecombinatorDraft;
        const { nodes, edges } = layoutRecombinatorTree(draft);
        expect(nodes).toHaveLength(draft.items.length + draft.steps.length);
        expect(edges).toHaveLength(draft.steps.length * 2);
        for (const edge of edges) {
            const source = nodes.find((node) => node.id === edge.source)!;
            const target = nodes.find((node) => node.id === edge.target)!;
            expect(source.x + source.width).toBeLessThan(target.x);
        }
        for (const node of nodes) {
            for (const other of nodes.filter(
                (other) => other.id !== node.id && other.x === node.x,
            )) {
                expect(node.y + node.height <= other.y || other.y + other.height <= node.y).toBe(
                    true,
                );
            }
        }
    });

    it("replaces one input and retains two distinct edges when inputs share a source", () => {
        const draft = connectTreeStep(exampleRecombinatorDraft, {
            source: "first",
            target: "finish",
            targetHandle: "right",
        });
        expect(draft.steps[2]).toMatchObject({ left: "first", right: "first" });
        expect(exampleRecombinatorDraft.steps[2].right).toBe("second");
        const edges = layoutRecombinatorTree(draft).edges.filter(
            (edge) => edge.target === "finish",
        );
        expect(edges.map((edge) => edge.targetHandle)).toEqual(["left", "right"]);
        expect(new Set(edges.map((edge) => edge.id)).size).toBe(2);
    });

    it.each([
        { source: "finish", target: "first", targetHandle: "left" },
        { source: "first", target: "first", targetHandle: "right" },
        { source: "missing", target: "finish", targetHandle: "left" },
        { source: "a", target: "a", targetHandle: "left" },
        { source: "a", target: "finish", targetHandle: null },
        { source: "a", target: "finish", targetHandle: "output" },
    ])("rejects invalid connections: $source to $target/$targetHandle", (connection) => {
        expect(isValidTreeConnection(exampleRecombinatorDraft, connection)).toBe(false);
        expect(connectTreeStep(exampleRecombinatorDraft, connection)).toBe(
            exampleRecombinatorDraft,
        );
    });

    it("updates every copy of a flag while preserving groups and unrelated input", () => {
        const original = {
            ...exampleRecombinatorDraft,
            items: [
                { id: "a", name: "A", prefixes: "Life | life\n\nArmour", suffixes: "*Essence" },
                { id: "b", name: "B", prefixes: "Life | life", suffixes: "Fire" },
            ],
        };
        const marked = toggleDraftAffixFlag(original, "Life", "nonNative", true);
        expect(marked.items.map((item) => item.prefixes)).toEqual([
            "!Life | life\n\nArmour",
            "!Life | life",
        ]);
        expect(marked.items[0].suffixes).toBe("*Essence");
        const both = toggleDraftAffixFlag(marked, "Life", "exclusive", true);
        expect(both.items[0].prefixes).toBe("*!Life | life\n\nArmour");
        const onlyExclusive = toggleDraftAffixFlag(both, "Life", "nonNative", false);
        expect(onlyExclusive.items[0].prefixes).toBe("*Life | life\n\nArmour");
        expect(original.items[0].prefixes).toBe("Life | life\n\nArmour");
    });

    it("keeps the tree usable while a modifier line is incomplete", () => {
        expect(draftAffixes("!\nLife\ninvalid | | group").map((affix) => affix.id)).toEqual([
            "Life",
        ]);
    });
});
