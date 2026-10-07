import { itemQuerySchema, normalizeApiItem } from "@poe-tools/item-query";
import { describe, expect, it } from "vite-plus/test";
import { compareAcquisition } from "../app/lib/crafting-acquisition";
import { orderCraftingBranches, routeCraftingItem } from "../app/lib/crafting-query-routing";
import { acquisitionEstimateSchema } from "../app/schemas/crafting-economy";

const query = (...ids: string[]) =>
    itemQuerySchema.parse({
        game: "poe1",
        groups: [
            {
                type: "and",
                filters: ids.map((id) => ({ kind: "mod", ids: [id] })),
            },
        ],
    });
const branches = [
    { id: "percent", query: query("percent"), probability: 0.6 },
    { id: "hybrid", query: query("hybrid"), probability: 0.2 },
    { id: "both", query: query("percent", "hybrid"), probability: 0.1 },
];

describe("crafting outcome routing", () => {
    it("routes both physical modifiers forward before either recovery branch", () => {
        const item = normalizeApiItem(
            "poe1",
            "craft",
            { baseType: "Axe" },
            {
                modifiersComplete: true,
                modifiers: [{ id: "percent" }, { id: "hybrid" }, { id: "unimportant-suffix" }],
            },
        );
        expect(orderCraftingBranches(branches, "automatic").map((branch) => branch.id)).toEqual([
            "both",
            "hybrid",
            "percent",
        ]);
        expect(routeCraftingItem(item, branches, "automatic").branchId).toBe("both");
        expect(routeCraftingItem(item, branches, "manual").branchId).toBe("percent");
        expect(branches.map((branch) => branch.id)).toEqual(["percent", "hybrid", "both"]);
    });

    it("uses the probability of matching the entire query and preserves unresolved ties", () => {
        const corrected = branches.map((branch) => ({
            ...branch,
            probability: branch.id === "percent" ? 0.01 : branch.probability,
        }));
        expect(orderCraftingBranches(corrected, "automatic").map((branch) => branch.id)).toEqual([
            "both",
            "percent",
            "hybrid",
        ]);
        expect(
            orderCraftingBranches(
                branches.map((branch) => ({ ...branch, probability: null })),
                "automatic",
            ).map((branch) => branch.id),
        ).toEqual(["both", "percent", "hybrid"]);
        expect(orderCraftingBranches(corrected, "manual").map((branch) => branch.id)).toEqual([
            "percent",
            "hybrid",
            "both",
        ]);
    });

    it("does not send incomplete item data past an unresolved earlier branch", () => {
        const item = normalizeApiItem(
            "poe1",
            "paste",
            { baseType: "Axe" },
            {
                modifiersComplete: false,
                modifiers: [{ id: "percent" }],
            },
        );
        expect(routeCraftingItem(item, branches, "automatic")).toEqual({
            status: "unknown",
            branchId: null,
            candidates: ["both", "hybrid", "percent"],
        });
    });
});

describe("acquisition comparisons", () => {
    const alternative = (id: string, expectedCost: number | null) =>
        acquisitionEstimateSchema.parse({
            id,
            name: id,
            kind: id === "buy" ? "purchase" : "craft",
            expectedCost,
            currency: "chaos",
            expectedActions: id === "buy" ? 0 : 100,
            guaranteed: id === "buy",
            confidence: null,
        });

    it("updates the cheapest complete estimate while keeping all choices visible", () => {
        const values = [
            alternative("buy", 100),
            alternative("alterations", 50),
            alternative("fracture", null),
        ];
        expect(compareAcquisition(values, { mode: "automatic" })).toMatchObject({
            selectedId: "alterations",
            alternatives: values,
            incomplete: true,
        });
        expect(
            compareAcquisition([alternative("buy", 25), values[1]!, values[2]!], {
                mode: "automatic",
            }).selectedId,
        ).toBe("buy");
    });

    it("preserves a user's pinned purchase when estimates and confidence change", () => {
        expect(
            compareAcquisition([alternative("buy", 100), alternative("craft", 1)], {
                mode: "pinned",
                alternativeId: "buy",
            }).selectedId,
        ).toBe("buy");
        expect(
            compareAcquisition([alternative("buy", null), alternative("craft", 1)], {
                mode: "pinned",
                alternativeId: "buy",
            }),
        ).toMatchObject({ selectedId: "buy", incomplete: true });
    });

    it("does not treat unknown costs as free or silently change a missing pinned choice", () => {
        expect(
            compareAcquisition([alternative("buy", null)], { mode: "automatic" }).selectedId,
        ).toBeNull();
        expect(
            compareAcquisition([{ ...alternative("buy", 0), missingPrices: ["base"] }], {
                mode: "automatic",
            }).selectedId,
        ).toBeNull();
        expect(() => compareAcquisition([], { mode: "pinned", alternativeId: "buy" })).toThrow(
            "no longer exists",
        );
        expect(() =>
            compareAcquisition(
                [alternative("buy", 100), { ...alternative("craft", 1), currency: "divine" }],
                { mode: "automatic" },
            ),
        ).toThrow("currency");
    });
});
