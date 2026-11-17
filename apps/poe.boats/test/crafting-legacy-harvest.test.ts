import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { expect, it } from "vite-plus/test";
import { craftingCatalogSchema } from "../app/schemas/crafting";

const archive = resolve(import.meta.dirname, "../crafting-history/catalogs");
const retained = readdirSync(archive).map((name) =>
    JSON.parse(gunzipSync(readFileSync(resolve(archive, name))).toString()),
);

it("opens every retained catalog with current code", () => {
    expect(retained.length).toBeGreaterThan(1);
    for (const catalog of retained)
        expect(() => craftingCatalogSchema.parse(catalog)).not.toThrow();
});

it("reads a 3.29 Harvest cost of one lifeforce colour and Sacred as a cost list", () => {
    const legacy = retained.find((catalog) => catalog.patch.startsWith("3.29."))!;
    const augment = legacy.crafting.harvest.find(
        (entry: { id: string }) => entry.id === "AugmentFire",
    );
    expect(augment).toMatchObject({ lifeforceType: 1, lifeforce: 15000, sacred: 1 });
    const parsed = craftingCatalogSchema.parse(legacy);
    expect(parsed.crafting.harvest.find((entry) => entry.id === "AugmentFire")).toMatchObject({
        cost: [
            {
                id: "Metadata/Items/Currency/HarvestSeedRed",
                name: "Wild Crystallised Lifeforce",
                amount: 15000,
            },
            {
                id: "Metadata/Items/Currency/HarvestSeedBoss",
                name: "Sacred Crystallised Lifeforce",
                amount: 1,
            },
        ],
    });
    expect(parsed.crafting.harvest.find((entry) => entry.id === "AugmentFire")).not.toHaveProperty(
        "lifeforceType",
    );
    const missing = structuredClone(legacy);
    missing.crafting.currencies = missing.crafting.currencies.filter(
        (entry: { id: string }) => !entry.id.endsWith("HarvestSeedBoss"),
    );
    expect(() => craftingCatalogSchema.parse(missing)).toThrow("Lifeforce currency is missing");
});
