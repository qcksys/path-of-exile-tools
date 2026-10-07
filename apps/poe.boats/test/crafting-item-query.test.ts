import { readFileSync } from "node:fs";
import { itemQuerySchema, itemRecordSchema } from "@poe-tools/item-query";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { createCraftingItemQuery } from "../app/lib/crafting-item-query";
import { craftingCatalogSchema } from "../app/schemas/crafting";
import { baseId, engine } from "./crafting-fixtures";

const second = new CraftingEngine(
    craftingCatalogSchema.parse(
        JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
    ),
);

describe("crafting item query adapter", () => {
    it.each([
        engine,
        second,
    ])("uses each game's actual affix limits and canonical modifiers ($catalog.game)", (gameEngine) => {
        const id = Object.entries(gameEngine.catalog.bases).find(
            ([, base]) =>
                base.item_class === "Ring" && !base.corrupted && base.rarities.includes("rare"),
        )![0];
        const blank = { ...gameEngine.createItem(id, 86), rarity: "rare" as const };
        const prefix = gameEngine
            .pool(blank)
            .find((entry) => gameEngine.mod(entry.id).generation_type === "prefix")!;
        const item = gameEngine.addStartingMod(blank, prefix.id, seededRandom(1));
        const adapter = createCraftingItemQuery(gameEngine);
        const record = itemRecordSchema.parse(adapter.record(item));
        expect(record.facts.prefixLimit).toBe(gameEngine.limits(item).prefixes);
        expect(record.facts.suffixLimit).toBe(gameEngine.limits(item).suffixes);
        expect(
            adapter.matches(
                item,
                itemQuerySchema.parse({
                    game: gameEngine.catalog.game,
                    groups: [
                        {
                            type: "and",
                            filters: [
                                { kind: "base", field: "baseId", values: [id] },
                                { kind: "mod", ids: [prefix.id], side: "prefix" },
                                {
                                    kind: "range",
                                    field: "openSuffixes",
                                    value: { min: gameEngine.limits(item).suffixes },
                                },
                            ],
                        },
                    ],
                }),
            ),
        ).toBe("match");
        expect(record.facts.stats.explicit).toEqual(
            Object.fromEntries(gameEngine.statTotals(item, "explicit")),
        );
        expect(
            adapter.matches(
                item,
                itemQuerySchema.parse({
                    game: gameEngine.catalog.game,
                    groups: [
                        {
                            type: "and",
                            filters: [{ kind: "mod", ids: [prefix.id], fractured: true }],
                        },
                    ],
                }),
            ),
        ).toBe("no-match");
    });

    it("retains partial socket-link knowledge instead of inventing disconnected sockets", () => {
        const item = {
            ...engine.createItem(baseId),
            sockets: 6,
            socketLinks: [true, true, true, false, null],
        };
        const adapter = createCraftingItemQuery(engine);
        expect(adapter.record(item).facts.linkedSockets).toEqual({ min: 4, max: 4 });
        const target = itemQuerySchema.parse({
            game: "poe1",
            groups: [
                { type: "and", filters: [{ kind: "range", field: "links", value: { min: 4 } }] },
            ],
        });
        expect(adapter.matches(item, target)).toBe("match");
        expect(adapter.matches({ ...item, socketLinks: undefined }, target)).toBe("unknown");
        expect(item.socketLinks).toEqual([true, true, true, false, null]);
    });
});
