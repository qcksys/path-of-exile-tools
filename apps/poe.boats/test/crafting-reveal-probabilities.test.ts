import { describe, expect, it } from "vite-plus/test";
import type { PoolEntry } from "~/lib/crafting-engine";
import { revealChoiceProbabilities } from "~/lib/crafting-reveal-probabilities";
import { catalog } from "./crafting-fixtures";

const mod = Object.values(catalog.mods)[0]!;
function entry(id: string, weight = 1, groups = [id], tags: string[] = []): PoolEntry {
    const copy = { ...mod, groups };
    copy.implicit_tags = tags;
    return { id, weight, mod: copy };
}
const sum = (values: Map<string, number>) => [...values.values()].reduce((a, b) => a + b, 0);

describe("reveal offer probabilities", () => {
    it("offers three of four equally weighted groups without changing the pool", () => {
        const pools = { exclusive: ["a", "b", "c", "d"].map((id) => entry(id)), ordinary: [] };
        const before = structuredClone(pools);
        const result = revealChoiceProbabilities("poe1", pools);
        for (const chance of result.values()) expect(chance).toBeCloseTo(3 / 4, 12);
        expect(sum(result)).toBeCloseTo(3, 12);
        expect(pools).toEqual(before);
    });

    it("allocates a guaranteed group between unequal tiers using their weights", () => {
        const result = revealChoiceProbabilities("poe1", {
            exclusive: [
                entry("a", 1, ["life"]),
                entry("b", 3, ["life"]),
                entry("c", 2),
                entry("d", 6),
            ],
            ordinary: [],
        });
        expect(result.get("a")).toBeCloseTo(1 / 4, 12);
        expect(result.get("b")).toBeCloseTo(3 / 4, 12);
        expect(result.get("c")).toBeCloseTo(1, 12);
        expect(result.get("d")).toBeCloseTo(1, 12);
    });

    it("handles intersecting groups and offers that end before three choices", () => {
        const result = revealChoiceProbabilities("poe1", {
            exclusive: [
                entry("a", 1, ["x"]),
                entry("b", 1, ["x", "y"]),
                entry("c", 1, ["y"]),
                entry("d"),
            ],
            ordinary: [],
        });
        expect(result.get("a")).toBeCloseTo(2 / 3, 12);
        expect(result.get("b")).toBeCloseTo(1 / 3, 12);
        expect(result.get("c")).toBeCloseTo(2 / 3, 12);
        expect(result.get("d")).toBeCloseTo(1, 12);
        expect(sum(result)).toBeCloseTo(8 / 3, 12);
    });

    it("mixes PoE 2 exclusive and ordinary offers without pooling their weights", () => {
        const result = revealChoiceProbabilities("poe2", {
            exclusive: ["a", "b", "c"].map((id) => entry(id, 100)),
            ordinary: ["d", "e", "f"].map((id) => entry(id)),
        });
        for (const id of ["a", "b", "c"]) expect(result.get(id)).toBeCloseTo(5 / 12, 12);
        for (const id of ["d", "e", "f"]) expect(result.get(id)).toBeCloseTo(7 / 12, 12);
        expect(sum(result)).toBeCloseTo(3, 12);
    });

    it("applies a Lich guarantee only to the first exclusive choice", () => {
        const pools = {
            exclusive: [entry("a", 1, ["x"], ["lich"]), entry("b", 3, ["x"]), entry("c")],
            ordinary: [entry("d"), entry("e")],
        };
        const result = revealChoiceProbabilities("poe2", pools, "lich");
        expect(result.get("a")).toBeCloseTo(1, 12);
        expect(result.get("b")).toBe(0);
        expect(result.get("c")).toBeCloseTo(1 / 5, 12);
        for (const id of ["d", "e"]) expect(result.get(id)).toBeCloseTo(9 / 10, 12);
        expect(revealChoiceProbabilities("poe2", pools, "absent")).toEqual(
            revealChoiceProbabilities("poe2", pools),
        );
    });

    it("blocks shared groups across sources and fills missing exclusive choices", () => {
        const result = revealChoiceProbabilities("poe2", {
            exclusive: [entry("a", 1, ["x"])],
            ordinary: [entry("b", 5, ["x"]), entry("c"), entry("d")],
        });
        expect(result.get("a")).toBeCloseTo(1, 12);
        expect(result.get("b")).toBe(0);
        expect(result.get("c")).toBeCloseTo(1, 12);
        expect(result.get("d")).toBeCloseTo(1, 12);
        expect(revealChoiceProbabilities("poe2", { exclusive: [], ordinary: [] }).size).toBe(0);
        const ordinary = revealChoiceProbabilities("poe2", {
            exclusive: [],
            ordinary: [entry("a"), entry("b")],
        });
        expect(ordinary.get("a")).toBeCloseTo(1, 12);
        expect(ordinary.get("b")).toBeCloseTo(1, 12);
    });

    it("keeps ungrouped modifiers independent", () => {
        const result = revealChoiceProbabilities("poe1", {
            exclusive: ["a", "b", "c", "d"].map((id) => entry(id, 1, [])),
            ordinary: [],
        });
        for (const chance of result.values()) expect(chance).toBeCloseTo(3 / 4, 12);
    });
});
