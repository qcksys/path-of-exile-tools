import { mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vite-plus/test";
import { baseItemsSchema } from "../../../packages/poe-game-data/src/model";
import { exportCraftingCatalog } from "../scripts/export-crafting-catalog";

it("leaves identical catalogs untouched and replaces changed output with validated data", async () => {
    const directory = await mkdtemp(join(tmpdir(), "crafting-catalog-export-"));
    try {
        const path = join(directory, "catalog.json");
        const source = resolve("../../packages/poe-1-data");
        await exportCraftingCatalog(source, path);
        const expected = await readFile(path, "utf8");
        const previous = new Date("2000-01-01T00:00:00.000Z");
        await utimes(path, previous, previous);
        await exportCraftingCatalog(source, path);
        expect((await stat(path)).mtimeMs).toBe(previous.getTime());
        expect(await readFile(path, "utf8")).toBe(expected);
        await writeFile(path, "{}");
        await exportCraftingCatalog(source, path);
        expect(await readFile(path, "utf8")).toBe(expected);
        await expect(exportCraftingCatalog(source, directory)).rejects.toThrow();
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}, 15000);

it("exports PoE 2 skill gem identities without adding equipment to the exchange names", async () => {
    const directory = await mkdtemp(join(tmpdir(), "exchange-gem-export-"));
    try {
        const source = resolve("../../packages/poe-2-data");
        await exportCraftingCatalog(source, join(directory, "catalog.json"));
        const names: Record<string, string> = JSON.parse(
            await readFile(join(directory, "market-exchange-items-poe2.json"), "utf8"),
        );
        const bases = baseItemsSchema.parse(
            JSON.parse(await readFile(join(source, "data", "base_items.json"), "utf8")),
        );
        for (const [id, base] of Object.entries(bases))
            if (base.name && base.item_class.endsWith("Skill Gem"))
                expect(names[id], id).toBe(base.name);
        expect(names["Metadata/Items/Gems/SupportGemAilithLineage"]).toBe("Ailith's Chimes");
        expect(names["Metadata/Items/Gems/SkillGemIceNova"]).toBe("Ice Nova");
        expect(names["Metadata/Items/Gems/SkillGemBlasphemy"]).toBe("Blasphemy");
        expect(names["Metadata/Items/Currency/CurrencyModValues"]).toBe("Divine Orb");
        expect(names["Metadata/Items/Armours/BodyArmours/FourBodyStr1"]).toBeUndefined();
        expect(names["Metadata/Items/Weapons/TwoHandWeapons/Bows/FourBow1"]).toBeUndefined();
        const items: Record<string, { art: string }> = JSON.parse(
            await readFile(join(directory, "items-poe2.json"), "utf8"),
        );
        expect(items["Metadata/Items/SoulCores/RuneFireLesser"]!.art).toMatch(
            /^https:\/\/web\.poecdn\.com\/gen\/image\/.+\/FireRuneTier1\.png$/,
        );
        expect(items["Metadata/Items/Armours/BodyArmours/FourBodyStr1"]!.art).toMatch(
            /^https:\/\/cdn\.poe2db\.tw\/image\/Art\//,
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}, 15000);
