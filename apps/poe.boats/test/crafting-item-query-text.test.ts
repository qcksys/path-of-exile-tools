import { readFileSync } from "node:fs";
import {
    itemQuerySelectionSchema,
    matchItem,
    normalizeApiItem,
    queryFromItem,
} from "@poe-tools/item-query";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { createCraftingItemQuery } from "../app/lib/crafting-item-query";
import { queriesFromItemText } from "../app/lib/crafting-item-query-text";
import { exportCraftingItemText } from "../app/lib/crafting-item-text";
import { craftingCatalogSchema } from "../app/schemas/crafting";
import { craftingItemQueryTextResultSchema } from "../app/schemas/crafting-item-query-text";

const defaults = itemQuerySelectionSchema.parse({});

describe.each(["poe1", "poe2"] as const)("%s copied item requirements", (game) => {
    const engine = new CraftingEngine(
        craftingCatalogSchema.parse(
            JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
        ),
    );
    const baseId = Object.entries(engine.catalog.bases).find(
        ([, base]) => base.item_class === "Body Armour" && base.drop_level === 1,
    )![0];
    const blank = { ...engine.createItem(baseId, 86), rarity: "rare" as const };
    const prefix = engine.pool(blank).find((entry) => entry.mod.generation_type === "prefix")!;
    const item = engine.addStartingMod(blank, prefix.id, seededRandom(1));
    const text = exportCraftingItemText(engine, item);

    it("creates matching requirements with canonical modifier identity and tier", () => {
        const result = craftingItemQueryTextResultSchema.parse(
            queriesFromItemText(engine, text, defaults),
        );
        expect(result.matches.length).toBeGreaterThan(0);
        for (const candidate of result.matches) {
            expect(candidate.record.source).toBe("paste");
            expect(matchItem(candidate.record, candidate.query)).toBe("match");
            const filters = candidate.query.groups.flatMap((group) => group.filters);
            expect(filters).toContainEqual({ kind: "base", field: "baseId", values: [baseId] });
            expect(filters).toContainEqual({ kind: "range", field: "ilvl", value: { min: 86 } });
            expect(filters.find((filter) => filter.kind === "mod")).toMatchObject({
                ids: [prefix.id],
                side: "prefix",
                count: { min: 1 },
            });
            const fact = candidate.record.facts.modifiers.find((mod) => mod.id === prefix.id)!;
            expect(fact.tier).toBeDefined();
            expect(filters.find((filter) => filter.kind === "mod")).toHaveProperty("tier", {
                min: fact.tier,
                max: fact.tier,
            });
            expect(
                matchItem(
                    {
                        ...candidate.record,
                        facts: {
                            ...candidate.record.facts,
                            modifiers: [],
                            modifiersComplete: true,
                        },
                    },
                    candidate.query,
                ),
            ).toBe("no-match");
        }
    });

    it("uses each game's actual affix limits and lets users omit rarity and modifier constraints", () => {
        const result = queryFromItem(
            createCraftingItemQuery(engine).record(item),
            itemQuerySelectionSchema.parse({ rarity: false, modifiers: false, openAffixes: true }),
        );
        const filters = result.query.groups.flatMap((group) => group.filters);
        expect(filters.some((filter) => filter.kind === "rarity" || filter.kind === "mod")).toBe(
            false,
        );
        expect(filters).toContainEqual({
            kind: "range",
            field: "openPrefixes",
            value: { min: engine.limits(item).prefixes - 1 },
        });
        expect(filters).toContainEqual({
            kind: "range",
            field: "openSuffixes",
            value: { min: engine.limits(item).suffixes },
        });
    });

    it("does not invent socket knowledge absent from a paste", () => {
        const noSockets = text.replace(/^(?:Sockets|Socket Count):.*\r?\n/gm, "");
        const result = queriesFromItemText(engine, noSockets, { ...defaults, sockets: true });
        for (const candidate of result.matches) {
            expect(candidate.warnings).toContain("Socket count is unknown and was omitted.");
            expect(
                candidate.query.groups
                    .flatMap((group) => group.filters)
                    .some(
                        (filter) =>
                            filter.kind === "range" && ["links", "sockets"].includes(filter.field),
                    ),
            ).toBe(false);
        }
    });

    it("does not represent hidden affixes on an unidentified copy as empty slots", () => {
        const copy = exportCraftingItemText(engine, { ...blank, unidentified: true });
        const result = queriesFromItemText(engine, copy, { ...defaults, openAffixes: true });
        for (const candidate of result.matches) {
            expect(candidate.record.facts.prefixes).toBeUndefined();
            expect(candidate.record.facts.suffixes).toBeUndefined();
            expect(candidate.warnings).toContain(
                "Empty prefix slots are unknown and were omitted.",
            );
            expect(
                candidate.query.groups
                    .flatMap((group) => group.filters)
                    .some(
                        (condition) =>
                            condition.kind === "range" && condition.field === "openPrefixes",
                    ),
            ).toBe(false);
        }
    });

    it("rejects unresolved text without returning a guessed query", () => {
        expect(() =>
            queriesFromItemText(engine, "Rarity: Rare\nUnknown item\nItem Level: 86", defaults),
        ).toThrow();
    });

    if (game === "poe1")
        it("preserves hybrid and separate-mod interpretations instead of selecting one", () => {
            const ambiguous = `Rarity: RARE\nTest\n${engine.base(blank).name}\nItem Level: 86\nImplicits: 0\n+100 to Armour\n+35 to maximum Life`;
            const result = queriesFromItemText(engine, ambiguous, defaults);
            expect(new Set(result.matches.map((candidate) => candidate.item.mods.length))).toEqual(
                new Set([1, 2]),
            );
            expect(
                new Set(result.matches.map((candidate) => JSON.stringify(candidate.query))).size,
            ).toBeGreaterThan(1);
            for (const candidate of result.matches)
                expect(matchItem(candidate.record, candidate.query)).toBe("match");
        });
});

it("keeps incomplete API modifier knowledge explicit", () => {
    const record = normalizeApiItem("poe1", "trade", {
        baseType: "Iron Ring",
        identified: true,
        explicitMods: ["+35 to maximum Life"],
    });
    const result = queryFromItem(record, { ...defaults, openAffixes: true, sockets: true });
    expect(result.warnings).toContain(
        "Modifier knowledge is incomplete. Only supported modifier facts are included.",
    );
    expect(result.warnings).toContain("Empty prefix slots are unknown and were omitted.");
    expect(
        result.query.groups
            .flatMap((group) => group.filters)
            .some((filter) => filter.kind === "mod" || filter.kind === "range"),
    ).toBe(false);
});

it("uses exact link groups from API-shaped sockets", () => {
    const record = normalizeApiItem("poe1", "stash", {
        baseType: "Plate Vest",
        sockets: [{ group: 0 }, { group: 0 }, { group: 0 }, { group: 1 }],
    });
    const result = queryFromItem(record, { ...defaults, sockets: true });
    expect(result.query.groups.flatMap((group) => group.filters)).toContainEqual({
        kind: "range",
        field: "links",
        value: { min: 3 },
    });
});

it("does not silently classify a modifier with unknown affix side as explicit", () => {
    const record = normalizeApiItem(
        "poe1",
        "trade",
        { baseType: "Iron Ring" },
        { modifiers: [{ id: "known-id" }] },
    );
    const result = queryFromItem(record, defaults);
    expect(result.warnings).toContain("Modifier known-id has no known affix side and was omitted.");
    expect(
        result.query.groups
            .flatMap((group) => group.filters)
            .some((filter) => filter.kind === "mod"),
    ).toBe(false);
});
