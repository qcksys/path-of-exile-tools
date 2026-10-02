import type { RecombinatorDraft } from "~/lib/recombinator-plan";
import { parseAffixes, type RecombinatorAffix } from "~/schemas/recombinator";

export type TreeConnection = { source: string; target: string; targetHandle: string | null };
export type TreeAffix = { affix: RecombinatorAffix; side: "prefixes" | "suffixes" };

export function draftAffixes(text: string): RecombinatorAffix[] {
    return text.split(/\r?\n/).flatMap((line) => {
        try {
            return parseAffixes(line);
        } catch {
            return [];
        }
    });
}

export function toggleDraftAffixFlag(
    draft: RecombinatorDraft,
    id: string,
    flag: "exclusive" | "nonNative",
    enabled: boolean,
): RecombinatorDraft {
    const update = (text: string) =>
        text
            .split(/\r?\n/)
            .map((line) => {
                const affix = draftAffixes(line)[0];
                if (affix?.id !== id) return line;
                const next = { ...affix, [flag]: enabled };
                const value = line
                    .trim()
                    .replace(/^[*!]+/, "")
                    .trim();
                return `${next.exclusive ? "*" : ""}${next.nonNative ? "!" : ""}${value}`;
            })
            .join("\n");
    return {
        ...draft,
        items: draft.items.map((entry) => ({
            ...entry,
            prefixes: update(entry.prefixes),
            suffixes: update(entry.suffixes),
            ...(entry.catalog
                ? {
                      catalog: {
                          ...entry.catalog,
                          prefixes: entry.catalog.prefixes.map((affix) =>
                              affix.id === id ? { ...affix, [flag]: enabled } : affix,
                          ),
                          suffixes: entry.catalog.suffixes.map((affix) =>
                              affix.id === id ? { ...affix, [flag]: enabled } : affix,
                          ),
                      },
                  }
                : {}),
        })),
    };
}

export function isValidTreeConnection(
    draft: RecombinatorDraft,
    connection: TreeConnection,
): boolean {
    if (connection.targetHandle !== "left" && connection.targetHandle !== "right") return false;
    const targetIndex = draft.steps.findIndex((step) => step.id === connection.target);
    if (targetIndex === -1) return false;
    return (
        draft.items.some((item) => item.id === connection.source) ||
        draft.steps.slice(0, targetIndex).some((step) => step.id === connection.source)
    );
}

export function connectTreeStep(
    draft: RecombinatorDraft,
    connection: TreeConnection,
): RecombinatorDraft {
    if (!isValidTreeConnection(draft, connection)) return draft;
    return {
        ...draft,
        steps: draft.steps.map((step) =>
            step.id === connection.target
                ? {
                      ...step,
                      [connection.targetHandle!]: connection.source,
                  }
                : step,
        ),
    };
}

export function layoutRecombinatorTree(draft: RecombinatorDraft) {
    const itemNodes = draft.items.map((item, index) => {
        const affixes: TreeAffix[] = [
            ...[...(item.catalog?.prefixes ?? []), ...draftAffixes(item.prefixes)].map((affix) => ({
                affix,
                side: "prefixes" as const,
            })),
            ...[...(item.catalog?.suffixes ?? []), ...draftAffixes(item.suffixes)].map((affix) => ({
                affix,
                side: "suffixes" as const,
            })),
        ];
        return {
            id: item.id,
            name: item.catalog ? `${item.name} · ${item.catalog.base.name}` : item.name,
            kind: "item" as const,
            index,
            affixes,
            depth: 0,
            x: 0,
            y: 0,
            width: 236,
            height: Math.max(112, 64 + Math.min(affixes.length, 6) * 20),
        };
    });
    let nextY = 0;
    for (const node of itemNodes) {
        node.y = nextY;
        nextY += node.height + 28;
    }
    type LayoutNode = Omit<(typeof itemNodes)[number], "kind"> & { kind: "item" | "step" };
    const nodes: LayoutNode[] = [...itemNodes];
    const positions = new Map(nodes.map((node) => [node.id, node]));
    const columnBottoms = new Map<number, number>();
    for (const [index, step] of draft.steps.entries()) {
        const left = positions.get(step.left)!;
        const right = positions.get(step.right)!;
        const depth = Math.max(left.depth, right.depth) + 1;
        const height = 124;
        const center = (left.y + left.height / 2 + right.y + right.height / 2) / 2;
        const y = Math.max(0, center - height / 2, columnBottoms.get(depth) ?? 0);
        const node: LayoutNode = {
            id: step.id,
            name: step.name,
            kind: "step",
            index,
            affixes: [],
            depth,
            x: depth * 340,
            y,
            width: 236,
            height,
        };
        nodes.push(node);
        positions.set(node.id, node);
        columnBottoms.set(depth, y + height + 28);
    }
    const edges = draft.steps.flatMap((step) =>
        (["left", "right"] as const).map((side) => ({
            id: `${step.id}-${side}`,
            source: step[side],
            target: step.id,
            targetHandle: side,
        })),
    );
    return { nodes, edges };
}
