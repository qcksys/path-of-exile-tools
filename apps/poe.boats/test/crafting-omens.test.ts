import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { availableOmens, omenEffects } from "../app/lib/crafting-omens";
import { type CraftingMethod, craftingCatalogSchema } from "../app/schemas/crafting";
import { catalog as poe1 } from "./crafting-fixtures";

const catalog = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const reveal: CraftingMethod = { kind: "reveal", preferred: [] };

describe("extracted omen lookup", () => {
    it("keeps returned lists and extracted-build availability independent", () => {
        const available = availableOmens(catalog, reveal);
        expect(available).toHaveLength(1);
        const echo = available[0]!;
        expect(echo.id.endsWith("/OmenOnAbyssRerollOptions")).toBe(true);
        available.pop();
        expect(availableOmens(catalog, reveal)).toEqual([echo]);
        const withoutEcho = {
            ...catalog,
            crafting: {
                ...catalog.crafting,
                currencies: catalog.crafting.currencies.filter((entry) => entry.id !== echo.id),
            },
        };
        expect(availableOmens(withoutEcho, reveal)).toEqual([]);
        expect(() => omenEffects(withoutEcho, { ...reveal, omens: [echo.id] })).toThrow(
            "does not apply",
        );
        expect(availableOmens(poe1, reveal)).toEqual([]);
        expect(omenEffects(catalog, { ...reveal, omens: [echo.id] })).toEqual({
            revealReroll: true,
        });
    });

    it("retains item-class and extracted-feature restrictions after other lookups", () => {
        const currency = (action: string): CraftingMethod => ({
            kind: "currency",
            id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
        });
        const exalt = currency("add_mod_to_rare");
        const chaos = currency("reroll");
        const divine = currency("reroll_mod_values");
        expect(
            availableOmens(catalog, exalt, "Jewel").some((entry) =>
                entry.id.endsWith("/OmenOnExaltConsumeQuality"),
            ),
        ).toBe(true);
        expect(
            availableOmens(catalog, exalt, "Body Armour").some((entry) =>
                entry.id.endsWith("/OmenOnExaltConsumeQuality"),
            ),
        ).toBe(false);
        expect(
            availableOmens(catalog, chaos, "Map").some((entry) =>
                entry.id.endsWith("/OmenOnChaosMapPackSize"),
            ),
        ).toBe(true);
        expect(
            availableOmens(catalog, chaos, "Body Armour").some((entry) =>
                entry.id.endsWith("/OmenOnChaosMapPackSize"),
            ),
        ).toBe(false);
        expect(
            availableOmens(catalog, divine).some((entry) =>
                entry.id.endsWith("/OmenOnDivineSanctify"),
            ),
        ).toBe(true);
        expect(
            availableOmens(
                { ...catalog, crafting: { ...catalog.crafting, sanctification: null } },
                divine,
            ).some((entry) => entry.id.endsWith("/OmenOnDivineSanctify")),
        ).toBe(false);
    });

    it("retains validation for selected omens and empty selections", () => {
        const echo = availableOmens(catalog, reveal)[0]!.id;
        expect(omenEffects(catalog, reveal)).toEqual({});
        expect(omenEffects(catalog, { ...reveal, omens: [] })).toEqual({});
        expect(() => omenEffects(catalog, { ...reveal, omens: [echo, echo] })).toThrow(
            "only be used once",
        );
        const currency: CraftingMethod = {
            kind: "currency",
            id: catalog.crafting.currencies.find((entry) => entry.action === "add_mod_to_rare")!.id,
            omens: [echo],
        };
        expect(() => omenEffects(catalog, currency)).toThrow("does not apply");
    });
});
