/** biome-ignore-all lint/style/useNamingConvention: Assertions use the official trade API's field names. */
import { itemQuerySchema } from "@poe-tools/item-query";
import { describe, expect, it } from "vite-plus/test";
import { buildCraftingTradeSearch, loadCraftingTradeMetadata } from "../app/lib/crafting-trade";
import { craftingTradeResultSchema } from "../app/schemas/crafting-trade";
import { baseId, catalog } from "./crafting-fixtures";

const poe1 = await loadCraftingTradeMetadata("poe1");
const poe2 = await loadCraftingTradeMetadata("poe2");
const query = (groups: unknown[], game = "poe1") => itemQuerySchema.parse({ game, groups });
const and = (filters: unknown[]) => query([{ type: "and", filters }]);

describe("crafting trade translation", () => {
    it("exports base, rarity, level, links, flags and open slots to official PoE 1 fields", () => {
        const result = buildCraftingTradeSearch(
            catalog,
            and([
                { kind: "base", field: "baseId", values: [baseId] },
                { kind: "rarity", values: ["Normal", "Magic", "Rare"] },
                { kind: "range", field: "ilvl", value: { min: 84 } },
                { kind: "range", field: "ilvl", value: { max: 86 } },
                { kind: "range", field: "links", value: { min: 6 } },
                { kind: "range", field: "openSuffixes", value: { min: 3 } },
                { kind: "flag", field: "fractured", value: false },
                { kind: "flag", field: "corrupted", value: false },
            ]),
            "A league & name",
            poe1,
        );
        expect(result.fidelity).toBe("exact");
        expect(result.payload.query.type).toBe(catalog.bases[baseId]!.name);
        expect(result.payload.query.filters).toMatchObject({
            misc_filters: {
                filters: {
                    ilvl: { min: 84, max: 86 },
                    fractured_item: { option: "false" },
                    corrupted: { option: "false" },
                },
            },
            type_filters: { filters: { rarity: { option: "nonunique" } } },
            socket_filters: { filters: { links: { min: 6 } } },
        });
        expect(result.payload.query.stats[0]!.filters).toEqual([
            { id: "pseudo.pseudo_number_of_empty_suffix_mods", value: { min: 3 } },
        ]);
        const url = new URL(result.url);
        expect(url.pathname).toBe("/trade/search/A%20league%20%26%20name");
        expect(JSON.parse(url.searchParams.get("q")!)).toEqual(result.payload);
        expect(craftingTradeResultSchema.parse(result)).toEqual(result);
    });

    it("uses PoE 2 level, augment-socket and sanctified filters without PoE 1 links", () => {
        const requirements = query(
            [
                {
                    type: "and",
                    filters: [
                        { kind: "range", field: "ilvl", value: { min: 80 } },
                        { kind: "range", field: "sockets", value: { min: 2 } },
                        { kind: "flag", field: "sanctified", value: false },
                        { kind: "range", field: "links", value: { min: 6 } },
                    ],
                },
            ],
            "poe2",
        );
        const result = buildCraftingTradeSearch(
            { game: "poe2", bases: {}, mods: {} },
            requirements,
            "Standard",
            poe2,
        );
        expect(result.url).toContain("/trade2/search/poe2/Standard?");
        expect(result.payload.query.filters).toEqual({
            type_filters: { filters: { ilvl: { min: 80 } } },
            equipment_filters: { filters: { total_augment_sockets: { min: 2 } } },
            misc_filters: { filters: { sanctified: { option: "false" } } },
        });
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]!.condition).toBe(3);
    });

    it("searches hybrid displayed minimum rolls but reports identity and tier ambiguity", () => {
        const id = "LocalIncreasedPhysicalDamagePercentAndAccuracyRating3";
        const result = buildCraftingTradeSearch(
            catalog,
            and([
                {
                    kind: "mod",
                    ids: [id],
                    side: "prefix",
                    tier: { min: 1, max: 1 },
                    fractured: true,
                },
            ]),
            "Standard",
            poe1,
        );
        expect(result.fidelity).toBe("approximate");
        expect(result.warnings[0]!.message).toContain("hybrid");
        expect(result.payload.query.stats[0]!.filters).toHaveLength(2);
        expect(result.payload.query.stats[0]!.filters.map((filter) => filter.value)).toEqual([
            { min: 25 },
            { min: 47 },
        ]);
        expect(
            result.payload.query.stats[0]!.filters.every((filter) =>
                filter.id.startsWith("fractured."),
            ),
        ).toBe(true);
    });

    it.each([
        "or",
        "not",
        "count",
    ])("drops an unsupported %s group whole instead of changing its meaning", (type) => {
        const result = buildCraftingTradeSearch(
            catalog,
            query([
                {
                    type,
                    value: { max: 1 },
                    filters: [
                        { kind: "range", field: "openPrefixes", value: { min: 1 } },
                        { kind: "mod", ids: ["unknown"] },
                    ],
                },
            ]),
            "Standard",
            poe1,
        );
        expect(result.payload.query.stats).toEqual([]);
        expect(result.payload.query.filters).toEqual({});
        expect(result.warnings).toHaveLength(1);
        expect(result.fidelity).toBe("approximate");
    });

    it("preserves OR, NOT and bounded counts when every condition is an exact pseudo stat", () => {
        const filters = [
            { kind: "range", field: "prefixes", value: { min: 2 } },
            { kind: "range", field: "suffixes", value: { min: 2 } },
        ];
        const result = buildCraftingTradeSearch(
            catalog,
            query([
                { type: "or", filters },
                { type: "not", filters },
                { type: "count", filters, value: { min: 0, max: 1 } },
            ]),
            "Standard",
            poe1,
        );
        expect(result.fidelity).toBe("exact");
        expect(
            result.payload.query.stats.map((group) => ({ type: group.type, value: group.value })),
        ).toEqual([
            { type: "count", value: { min: 1 } },
            { type: "not", value: undefined },
            { type: "count", value: { min: 0, max: 1 } },
        ]);
    });

    it("does not reinterpret internal stat IDs as official trade IDs", () => {
        const result = buildCraftingTradeSearch(
            catalog,
            and([
                { kind: "stat", id: "local_energy_shield", scope: "explicit", value: { min: 100 } },
            ]),
            "Standard",
            poe1,
        );
        expect(result.fidelity).toBe("approximate");
        expect(result.payload.query.stats).toEqual([]);
    });

    it("refuses game mismatches and contradictory exact ranges", () => {
        expect(() =>
            buildCraftingTradeSearch(
                catalog,
                itemQuerySchema.parse({ game: "poe1" }),
                "Standard",
                poe2,
            ),
        ).toThrow("same game");
        expect(() =>
            buildCraftingTradeSearch(
                catalog,
                and([
                    { kind: "range", field: "ilvl", value: { min: 86 } },
                    { kind: "range", field: "ilvl", value: { max: 84 } },
                ]),
                "Standard",
                poe1,
            ),
        ).toThrow("empty ilvl range");
    });
});
